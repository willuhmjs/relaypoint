import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma/prismaConnection';

/**
 * Liveness/readiness endpoint for load balancers, Docker healthchecks and
 * uptime monitors: { status: "ok" } when the database is reachable,
 * 503 otherwise.
 */
export const GET: RequestHandler = async () => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		return json({ status: 'ok', uptime: Math.round(process.uptime()) });
	} catch (err) {
		console.error('[health] Database unreachable:', err);
		return json({ status: 'unhealthy' }, { status: 503 });
	}
};
