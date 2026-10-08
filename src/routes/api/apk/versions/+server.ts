import { prisma } from '$lib/server/prisma/prismaConnection';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const versions = await prisma.apkVersion.findMany({
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			version: true,
			filename: true,
			createdAt: true,
			isPinned: true
		}
	});

	return json(versions);
};
