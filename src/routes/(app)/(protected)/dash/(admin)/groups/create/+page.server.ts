import { prisma } from '$lib/server/prisma/prismaConnection';
import { fail, redirect } from '@sveltejs/kit';
import { actionHelper } from '$lib/server/actionHelper';
import { z } from 'zod';
import { isRedirect } from "@sveltejs/kit";
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
				const existingGroup = await prisma.displayGroup.findUnique({
					where: { name }
				});

				if (existingGroup) {
					return fail(400, { error: 'A team with this name already exists.' });
				}

				const group = await prisma.displayGroup.create({
					data: {
						name
					}
				});

			
				throw redirect(303, `/dash/groups/${group.id}`);
			} catch (error) {
				if (isRedirect(error)) {
					throw error; // Re-throw if it's a redirect error
				}
				console.error(error); // Log the raw error for server-side debugging

				let userErrorMessage = 'Failed to create group due to an unexpected error.';

				if (error instanceof Error) {
					userErrorMessage = error.message;
				} else if (typeof error === 'object' && error !== null) {
					if ('message' in error && typeof error.message === 'string') {
						userErrorMessage = error.message;
					} else {
						try {
							userErrorMessage = JSON.stringify(error);
						} catch { // Omit variable name to suppress ESLint warning for unused variable
							userErrorMessage = `Failed to create group: ${String(error)}`;
						}
					}
				} else {
					userErrorMessage = `Failed to create group: ${String(error)}`;
				}

				return fail(500, { error: userErrorMessage });
			}
		}
	)
};
