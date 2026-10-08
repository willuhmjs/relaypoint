import { error, type RequestEvent } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma/prismaConnection';
import type { Display } from '@prisma/client';

async function userCanAccessDisplayGroup(
	userId: string,
	role: string,
	displayGroupId: string | null
): Promise<boolean> {
	if (role === 'ADMIN') return true;
	if (!displayGroupId) return false;

	const membership = await prisma.usersOnTeams.findFirst({
		where: {
			userId,
			team: { displayGroups: { some: { displayGroupId } } }
		}
	});

	return membership !== null;
}

export async function assertSessionForDisplayGroup(
	event: RequestEvent,
	displayGroupId: string | null
) {
	const session = await event.locals.auth();
	if (!session?.user) {
		throw error(401, 'Unauthorized');
	}
	if (!(await userCanAccessDisplayGroup(session.user.id, session.user.role, displayGroupId))) {
		throw error(403, 'You do not have permission to access this display');
	}
	return session;
}

export async function assertCanEditDisplay(
	event: RequestEvent,
	displayId: number
): Promise<Display> {
	const session = await event.locals.auth();
	if (!session?.user) {
		throw error(401, 'Unauthorized');
	}
	const display = await prisma.display.findUnique({ where: { id: displayId } });
	if (!display) {
		throw error(404, 'Display not found');
	}
	if (!(await userCanAccessDisplayGroup(session.user.id, session.user.role, display.displayGroupId))) {
		throw error(403, 'You do not have permission to access this display');
	}
	return display;
}
