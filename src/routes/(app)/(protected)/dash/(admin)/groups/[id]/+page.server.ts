import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { redirect, fail, error } from '@sveltejs/kit';

// Framework control-flow (HttpError, Redirect) must never be swallowed by
// catch blocks that convert unknown errors into a 500.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isFrameworkError = (e: any): boolean =>
	!!e && typeof e === 'object' && 'status' in e && ('body' in e || 'location' in e);
import { actionHelper } from '$lib/server/actionHelper';
import { z } from 'zod';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { broadcastReload, broadcastUpdate } from '$lib/server/webSocketHandler';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { id } = params;
	const session = await locals.auth();

	if (!session?.user?.id) {
		redirect(303, '/');
	}

	if (session?.user?.role !== 'ADMIN') {
		redirect(303, '/dash');
	}

	try {
		const displayGroup = await prisma.displayGroup.findUnique({
			where: {
				id: id
			},
			include: {
				teams: true,
				displays: {
					include: {
						slides: {
							where: {
								type: {
									in: ['IMAGE', 'VIDEO']
								}
							},
							orderBy: {
								order: 'asc'
							},
							take: 1
						}
					}
				}
			}
		});

		if (!displayGroup) {
			// `fail()` is only valid in actions; in `load` it must be `error()`.
			error(404, 'Display Group not found');
		}

		const allTeams = await prisma.team.findMany({
			select: {
				id: true,
				name: true
			}
		});

		const allDisplaysInGroup = displayGroup.displays;

		return { displayGroup, allTeams, allDisplays: allDisplaysInGroup };
	} catch (e) {
		if (isFrameworkError(e)) throw e;
		console.error(e);
		error(500, 'An internal server error occurred.');
	}
};

export const actions: Actions = {
	edit: actionHelper(
		z.object({
			name: z
				.string()
				.min(1, { message: 'Name cannot be empty' })
				.max(100, { message: 'Name cannot exceed 100 characters' }),
			teamIds: z
				.string()
				.transform((str) => JSON.parse(str) as string[])
				.optional(),
			displayIds: z
				.string()
				.transform((str) => JSON.parse(str) as number[])
				.optional(),
			useSharedTimeline: z
				.string()
				.optional()
				.transform((val) => val === 'on')
		}),
		async ({ name, teamIds, useSharedTimeline }, { locals, params }) => {
			const session = await locals.auth();
			if (!session?.user?.id || session.user.role !== 'ADMIN') {
				return fail(403, { error: 'You are not authorized to perform this action.' });
			}

			const { id } = params;
			if (!id) {
				return fail(400, { message: 'Display Group ID not found' });
			}

			try {
				const currentGroup = await prisma.displayGroup.findUnique({
					where: { id: id },
					select: { useSharedTimeline: true }
				});
				if (!currentGroup) {
					return fail(404, { message: 'Display Group not found' });
				}
				const isSyncToggled = currentGroup.useSharedTimeline !== useSharedTimeline;

				await prisma.$transaction(async (tx) => {
					await tx.displayGroup.update({
						where: { id: id },
						data: {
							name,
							useSharedTimeline,
							...(isSyncToggled && { timelineBasisTime: new Date() })
						}
					});

					if (teamIds !== undefined) {
						await tx.displayGroupsOnTeams.deleteMany({
							where: { displayGroupId: id }
						});

						if (teamIds.length > 0) {
							await tx.displayGroupsOnTeams.createMany({
								data: teamIds.map((teamId: string) => ({
									displayGroupId: id,
									teamId: teamId
								}))
							});
						}
					}
				});

				if (isSyncToggled) {
					const displaysInGroup = await prisma.display.findMany({
						where: { displayGroupId: id },
						select: { id: true }
					});

					for (const display of displaysInGroup) {
						broadcastUpdate(display.id, 'GROUP_SYNC_SETTINGS_UPDATED');
					}
				}

				const updatedDisplayGroup = await prisma.displayGroup.findUnique({ where: { id } });

				return {
					success: true,
					message: 'Display Group updated successfully.',
					data: {
						name: updatedDisplayGroup!.name
					}
				};
			} catch (error) {
				console.error(error);
				return fail(500, { error: 'Failed to update Display Group.' });
			}
		}
	),

	restartGroup: async ({ params, locals }) => {
		const session = await locals.auth();
		if (session?.user?.role !== 'ADMIN') {
			return fail(403, { error: 'You are not authorized to perform this action.' });
		}

		const { id: displayGroupId } = params;
		if (!displayGroupId) {
			return fail(400, { message: 'Display Group ID not found.' });
		}

		try {
			// Update the group's basis time
			await prisma.displayGroup.update({
				where: { id: displayGroupId },
				data: { timelineBasisTime: new Date() }
			});

			// Find all displays in the group to notify them
			const displaysInGroup = await prisma.display.findMany({
				where: { displayGroupId: displayGroupId },
				select: { id: true }
			});

			// Send a WebSocket message to each display client
			for (const display of displaysInGroup) {
				broadcastUpdate(display.id, 'GROUP_RESTARTED');
			}

			return { success: true, message: 'Group restarted successfully.' };
		} catch (error) {
			console.error('Error restarting group:', error);
			return fail(500, { error: 'Failed to restart the group.' });
		}
	},

	delete: async ({ locals, params }) => {
		const session = await locals.auth();
		if (!session?.user?.id || session.user.role !== 'ADMIN') {
			return fail(403, { error: 'You are not authorized to delete this Display Group.' });
		}

		const { id } = params;
		if (!id) {
			return fail(400, { message: 'Display Group ID not found' });
		}

		try {
			await prisma.displayGroup.delete({
				where: { id: id }
			});
		} catch (error) {
			console.error(error);
			return fail(500, { error: 'Failed to delete Display Group.' });
		}

		redirect(303, '/dash');
	},

	createDisplay: actionHelper(
		z.object({
			name: z.string().min(1, { message: 'Name cannot be empty' }),
			description: z.string().optional()
		}),
		async ({ name, description }, { locals, params }) => {
			const session = await locals.auth();
			if (!session?.user?.id || session.user.role !== 'ADMIN') {
				return fail(403, { error: 'You are not authorized to perform this action.' });
			}

			const { id: displayGroupId } = params;
			if (!displayGroupId) {
				return fail(400, { message: 'Display Group ID not found' });
			}

			try {
				await prisma.display.create({
					data: {
						name,
						description,
						displayGroupId: displayGroupId
					}
				});

				return {
					success: true,
					message: 'Display created successfully.'
				};
			} catch (error: any) {
				if (error?.code === 'P2002') {
					return fail(400, {
						error: 'A display with this name already exists in this group.'
					});
				}
				console.error(error);
				return fail(500, { error: 'Failed to create display.' });
			}
		}
	),

	deleteDisplay: actionHelper(
		z.object({
			displayId: z.string().transform(Number)
		}),
		async ({ displayId }, { locals }) => {
			const session = await locals.auth();
			if (session?.user?.role !== 'ADMIN') {
				return fail(403, { error: 'You are not authorized to perform this action.' });
			}

			const display = await prisma.display.findUnique({
				where: { id: displayId },
				include: {
					slides: { select: { contentUrl: true } },
					assets: { select: { s3Path: true } },
					presentationSources: { select: { s3Path: true } }
				}
			});

			if (!display) {
				return fail(404, { error: 'Display not found.' });
			}

			try {
				await prisma.display.delete({ where: { id: display.id } });
			} catch (error) {
				console.error('Failed to delete display from database:', error);
				return fail(500, { error: 'Could not delete display from the database.' });
			}

			// The row is gone; storage cleanup is best effort afterwards so a
			// transient S3 error can never leave an undeletable display behind.
			// (Slides and assets cascade-delete in the database via FK.)
			const s3Keys = [
				...display.slides.map((slide) => slide.contentUrl),
				...display.assets.map((asset) => asset.s3Path),
				...display.presentationSources.map((source) => source.s3Path)
			].filter((key): key is string => !!key);

			if (s3Keys.length > 0) {
				const results = await Promise.allSettled(
					s3Keys.map((key) =>
						s3Client.send(
							new DeleteObjectCommand({
								Bucket: BUCKET_NAME,
								Key: key
							})
						)
					)
				);
				const failures = results.filter((r) => r.status === 'rejected').length;
				if (failures > 0) {
					console.error(
						`Failed to delete ${failures}/${s3Keys.length} S3 objects for display ${displayId}; they are orphaned.`
					);
				}
			}

			return { success: true, message: 'Display deleted successfully.' };
		}
	),

	forceRefreshDisplay: actionHelper(
		z.object({
			displayId: z.string().transform(Number)
		}),
		async ({ displayId }, { locals }) => {
			const session = await locals.auth();
			if (session?.user?.role !== 'ADMIN') {
				return fail(403, { error: 'You are not authorized to perform this action.' });
			}

			try {
				broadcastReload(displayId);
				return { success: true, message: 'Refresh signal sent to display.' };
			} catch (error) {
				console.error('Failed to send refresh signal:', error);
				return fail(500, { error: 'Could not send refresh signal.' });
			}
		}
	)
};
