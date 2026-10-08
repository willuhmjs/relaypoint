import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { redirect, fail } from '@sveltejs/kit';
import { actionHelper } from '$lib/server/actionHelper';
import { z } from 'zod';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { id } = params;
	const session = await locals.auth();

	if (!session?.user?.id) {
		redirect(303, '/');
	}

	if (session?.user?.role != 'ADMIN') {
		redirect(303, '/dash');
	}

	try {
		const team = await prisma.team.findUnique({
			where: {
				id: id
			},
			include: {
				users: true,
				displayGroups: true,
				invites: true
			}
		});

		if (!team) {
			return fail(404, { message: 'Team not found' });
		}

		const user = await prisma.user.findUnique({
			where: {
				id: session.user.id
			},
			select: {
				role: true
			}
		});

		if (user?.role !== 'ADMIN') {
			redirect(303, '/dash/');
		}

		const allUsers = await prisma.user.findMany({
			where: {
				role: {
					not: 'ADMIN'
				}
			},
			select: {
				id: true,
				name: true,
				email: true,
				role: true
			}
		});

		return { team, allUsers };
	} catch (error) {
		console.error(error);
		return fail(500, { message: 'An internal server error occurred.' });
	}
};

export const actions: Actions = {
	edit: actionHelper(
		z.object({
			name: z
				.string()
				.min(1, { message: 'Name cannot be empty' })
				.max(100, { message: 'Name cannot exceed 100 characters' }),
			userIds: z.string().transform((str) => JSON.parse(str) as string[]).optional(),
			invitedEmails: z.string().transform((str) => JSON.parse(str) as string[]).optional()
		}),
		async ({ name, userIds, invitedEmails }, { locals, params }) => {
			const session = await locals.auth();
			if (!session?.user?.id) {
				redirect(303, '/');
			}

			if (session.user.role != 'ADMIN') {
				return fail(403, { error: 'You are not authorized to edit this team.' });
			}

			const { id } = params;

			if (!id) {
				return fail(400, { message: 'Team ID not found' });
			}

			try {
				const user = await prisma.user.findUnique({
					where: {
						id: session.user.id
					},
					select: {
						role: true
					}
				});

				if (user?.role !== 'ADMIN') {
					const teamPermissionCheck = await prisma.team.findUnique({
						where: { id: id },
						select: {
							users: { where: { userId: session.user.id } }
						}
					});

					if (!teamPermissionCheck || teamPermissionCheck.users.length === 0) {
						return fail(403, { error: "You don't have permission to edit this team." });
					}
				}

				const updatedTeam = await prisma.team.update({
					where: {
						id: id
					},
					data: {
						name
					}
				});

				// Update UsersOnTeams
				if (userIds !== undefined) {
					// Fetch all admin user IDs to ensure they are not removed
					const adminUsers = await prisma.user.findMany({
						where: { role: 'ADMIN' },
						select: { id: true }
					});
					const adminUserIds = adminUsers.map((u) => u.id);

					// Delete only non-admin users from the team before re-adding
					await prisma.usersOnTeams.deleteMany({
						where: {
							teamId: id,
							userId: { notIn: adminUserIds }
						}
					});

					// Add back the selected non-admin users from the form
					if (userIds.length > 0) {
						await prisma.usersOnTeams.createMany({
							data: userIds.map((userId: string) => ({
								userId,
								teamId: id
							})),
							skipDuplicates: true
						});
					}

					// Ensure all admins are members of the team (idempotent operation)
					if (adminUserIds.length > 0) {
						await prisma.usersOnTeams.createMany({
							data: adminUserIds.map((adminId) => ({
								userId: adminId,
								teamId: id
							})),
							skipDuplicates: true
						});
					}
				}

				// Update pending email invites
				if (invitedEmails !== undefined) {
					const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
					const normalizedEmails = Array.from(
						new Set(
							invitedEmails
								.map((email) => email.trim().toLowerCase())
								.filter((email) => EMAIL_REGEX.test(email))
						)
					);

					// If an invited email already belongs to a registered user, add them directly
					const existingUsersForEmails =
						normalizedEmails.length > 0
							? await prisma.user.findMany({
									where: { email: { in: normalizedEmails } },
									select: { id: true, email: true }
								})
							: [];

					if (existingUsersForEmails.length > 0) {
						await prisma.usersOnTeams.createMany({
							data: existingUsersForEmails.map((u) => ({ userId: u.id, teamId: id })),
							skipDuplicates: true
						});
					}

					const existingEmailSet = new Set(existingUsersForEmails.map((u) => u.email!.toLowerCase()));
					const pendingEmails = normalizedEmails.filter((email) => !existingEmailSet.has(email));

					// Replace the team's pending invites with the submitted set
					await prisma.teamInvite.deleteMany({
						where: { teamId: id, email: { notIn: pendingEmails } }
					});

					if (pendingEmails.length > 0) {
						await prisma.teamInvite.createMany({
							data: pendingEmails.map((email) => ({ email, teamId: id })),
							skipDuplicates: true
						});
					}
				}

				return {
					success: true,
					message: 'Team updated successfully.',
					data: {
						name: updatedTeam.name
					}
				};
			} catch (error) {
				console.error(error);
				return fail(500, { error: 'Failed to update team.' });
			}
		}
	),

	delete: async ({ locals, params }) => {
		const session = await locals.auth();
		if (!session?.user?.id) {
			redirect(303, '/');
		}

		if (session.user.role !== 'ADMIN') {
			return fail(403, { error: 'You are not authorized to delete this team.' });
		}

		const { id } = params;

		if (!id) {
			return fail(400, { message: 'Team ID not found' });
		}

		try {
			await prisma.team.delete({
				where: {
					id: id
				}
			});
		} catch (error) {
			console.error(error);
			return fail(500, { error: 'Failed to delete team.' });
		}

		redirect(303, '/dash');
	}
};