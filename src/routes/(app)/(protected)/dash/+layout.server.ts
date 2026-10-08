import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/prisma/prismaConnection';
import type { Display, DisplayGroup, Team } from '@prisma/client';

export const load: LayoutServerLoad = async (event) => {
	const session = await event.locals.auth();
	if (!session?.user) {
		return redirect(303, '/login');
	}

	const user = await prisma.user.findUnique({
		where: {
			id: session?.user.id
		},
		include: {
			teams: {
				include: {
					team: {
						include: {
							users: true,
							displayGroups: true
						}
					}
				}
			}
		}
	});

	let allTeams: Team[] = [];
	let allDisplayGroups: DisplayGroup[] = [];

	if (user?.role === 'ADMIN') {
		allTeams = await prisma.team.findMany();
		allDisplayGroups = await prisma.displayGroup.findMany({
			include: {
				teams: true,
				displays: {
					include: {
						slides: {
							where: {
								type: {
									in: ['IMAGE', 'VIDEO', 'HTML']
								}
							},
							orderBy: { order: 'asc' },
							take: 1
						}
					}
				}
			}
		});
	} else {
		if (user) {
			const userTeamsWithRelations = user.teams.map((teamOnUser) => teamOnUser.team);
			allTeams = userTeamsWithRelations;
			const displayGroupIds = userTeamsWithRelations.flatMap((team) =>
				team.displayGroups.map((group) => group.displayGroupId)
			);

			allDisplayGroups = await prisma.displayGroup.findMany({
				where: {
					id: {
						in: displayGroupIds
					}
				},
				include: {
					teams: true,
					displays: {
						include: {
							slides: {
								where: {
									type: {
										in: ['IMAGE', 'VIDEO', 'HTML']
									}
								},
								orderBy: { order: 'asc' },
								take: 1
							}
						}
					}
				}
			});
		}
	}

	return {
		session,
		user: {
			...user
		},
		displayGroups: allDisplayGroups,
		teams: allTeams
	};
};