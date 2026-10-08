import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Readable } from 'stream';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { assertCanEditDisplay } from '$lib/server/displayAuth';
import { isFastPathMime } from '$lib/server/slideMime';

export const PUT: RequestHandler = async (event) => {
	const displayId = parseInt(event.params.id ?? '', 10);
	const slideId = parseInt(event.params.slideId ?? '', 10);
	if (isNaN(displayId) || isNaN(slideId)) throw error(400, 'Invalid IDs');

	await assertCanEditDisplay(event, displayId);

	const slide = await prisma.slide.findUnique({ where: { id: slideId } });
	if (!slide || slide.displayId !== displayId) throw error(404, 'Slide not found');
	if (!slide.isHidden) throw error(409, 'Slide already finalized');

	const contentType = event.request.headers.get('content-type') ?? 'application/octet-stream';
	if (!isFastPathMime(contentType)) {
		throw error(415, `Unsupported content type: ${contentType}`);
	}

	const contentLengthHeader = event.request.headers.get('content-length');
	const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
	if (!Number.isFinite(contentLength) || contentLength <= 0) {
		throw error(411, 'Content-Length required');
	}

	if (!event.request.body) throw error(400, 'Missing request body');

	const nodeStream = Readable.fromWeb(event.request.body as Parameters<typeof Readable.fromWeb>[0]);

	try {
		await s3Client.send(
			new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: slide.contentUrl,
				Body: nodeStream,
				ContentType: contentType,
				ContentLength: contentLength
			})
		);
	} catch (err) {
		console.error(`[upload] S3 PUT failed for slide ${slideId}`, err);
		throw error(502, 'Storage upload failed');
	}

	return json({ success: true });
};
