import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { slideTypeFromMime, sanitizeFilename } from '$lib/server/slideMime';
import { assertCanEditDisplay } from '$lib/server/displayAuth';

const PrepareSchema = z.object({
	files: z
		.array(
			z.object({
				filename: z.string().min(1).max(255),
				type: z.string().min(1),
				size: z.number().int().nonnegative()
			})
		)
		.min(1)
		.max(50)
});

export const POST: RequestHandler = async (event) => {
	const displayId = parseInt(event.params.id ?? '', 10);
	if (isNaN(displayId)) throw error(400, 'Invalid display ID');

	await assertCanEditDisplay(event, displayId);

	const body = await event.request.json().catch(() => null);
	const parsed = PrepareSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Invalid request body');
	}

	for (const f of parsed.data.files) {
		if (slideTypeFromMime(f.type) === null) {
			throw error(400, `Unsupported MIME for fast path: ${f.type}`);
		}
	}

	const MAX_ATTEMPTS = 3;
	let result: { slideId: number; filename: string; contentType: string }[] = [];
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			result = await prisma.$transaction(async (tx) => {
				const last = await tx.slide.findFirst({
					where: { displayId },
					orderBy: { order: 'desc' },
					select: { order: true }
				});
				let nextOrder = (last?.order ?? -1) + 1;

				const created: { slideId: number; filename: string; contentType: string }[] = [];
				for (const f of parsed.data.files) {
					const safeName = sanitizeFilename(f.filename);
					const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
					const s3Key = `displays/${displayId}/slides/${uniqueSuffix}-${safeName}`;
					const slideType = slideTypeFromMime(f.type)!;

					const slide = await tx.slide.create({
						data: {
							displayId,
							order: nextOrder,
							type: slideType,
							contentUrl: s3Key,
							duration: 10,
							isHidden: true
						}
					});
					created.push({ slideId: slide.id, filename: f.filename, contentType: f.type });
					nextOrder += 1;
				}
				return created;
			});
			break;
		} catch (err) {
			const code = (err as { code?: string })?.code;
			if (code === 'P2002' && attempt < MAX_ATTEMPTS) {
				console.warn(`[prepare] order collision on attempt ${attempt}, retrying`);
				continue;
			}
			throw err;
		}
	}

	const slides = result.map((r) => ({
		slideId: r.slideId,
		filename: r.filename,
		contentType: r.contentType,
		uploadUrl: `/dash/displays/${displayId}/slides/${r.slideId}/upload`
	}));

	return json({ slides });
};
