import { prisma } from '$lib/server/prisma/prismaConnection';
import { fail, redirect } from '@sveltejs/kit';
import { actionHelper } from '$lib/server/actionHelper';
import { z } from 'zod';
import { isRedirect } from '@sveltejs/kit';
export const actions = {
	default: actionHelper(
		z.object({
			name: z
				.string()
				.min(1, { message: 'Name cannot be empty' })
				.max(100, { message: 'Name cannot exceed 100 characters' })
		}),
		async ({ name }, { locals }) => {
			const session = await locals.auth();
			if (!session?.user?.id || session.user.role !== 'ADMIN') {
				return redirect(303, '/');
			}

			try {
				// Check if a team with the same name already exists
				const existingTeam = await prisma.team.findUnique({
					where: { name }
				});

				if (existingTeam) {
					return fail(400, { error: 'A team with this name already exists.' });
				}

				const team = await prisma.team.create({
					data: {
						name
					}
				});

				// Automatically add all administrators to the new team
				const adminUsers = await prisma.user.findMany({
					where: { role: 'ADMIN' },
					select: { id: true }
				});

				if (adminUsers.length > 0) {
					await prisma.usersOnTeams.createMany({
						data: adminUsers.map((admin) => ({
							userId: admin.id,
							teamId: team.id
						}))
					});
				}

				throw redirect(303, `/dash/teams/${team.id}`);
			} catch (error) {
				if (isRedirect(error)) {
					throw error; // Re-throw if it's a redirect error
				}
				console.error(error); // Log the raw error for server-side debugging

				let userErrorMessage = 'Failed to create team due to an unexpected error.';

				if (error instanceof Error) {
					userErrorMessage = error.message;
				} else if (typeof error === 'object' && error !== null) {
					if ('message' in error && typeof error.message === 'string') {
						userErrorMessage = error.message;
					} else {
						try {
							userErrorMessage = JSON.stringify(error);
						} catch {
							// Omit variable name to suppress ESLint warning for unused variable
							userErrorMessage = `Failed to create team: ${String(error)}`;
						}
					}
				} else {
					userErrorMessage = `Failed to create team: ${String(error)}`;
				}

				return fail(500, { error: userErrorMessage });
			}
		}
	)
};