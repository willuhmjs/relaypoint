import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { assertCanEditDisplay } from '$lib/server/displayAuth';

const RollbackSchema = z.object({
	slideIds: z.array(z.number().int().positive()).min(1).max(50)
});

export const POST: RequestHandler = async (event) => {
	const displayId = parseInt(event.params.id ?? '', 10);
	if (isNaN(displayId)) throw error(400, 'Invalid display ID');

	await assertCanEditDisplay(event, displayId);

	const body = await event.request.json().catch(() => null);
	const parsed = RollbackSchema.safeParse(body);
	if (!parsed.success) throw error(400, 'Invalid request body');

	const slides = await prisma.slide.findMany({
		where: { id: { in: parsed.data.slideIds }, displayId }
	});

	await Promise.allSettled(
		slides.map((s) =>
			s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s.contentUrl }))
		)
	);

	const { count } = await prisma.slide.deleteMany({
		where: { id: { in: slides.map((s) => s.id) } }
	});

	return json({ success: true, deleted: count });
};
