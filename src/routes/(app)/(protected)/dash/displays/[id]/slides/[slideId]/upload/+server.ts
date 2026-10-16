import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { assertCanEditDisplay } from '$lib/server/displayAuth';
import { isFastPathMime } from '$lib/server/slideMime';
import { MAX_UPLOAD_BYTES } from '$lib/server/uploadLimits';

// NOTE: adapter-node enforces a *global* request-body cap via the
// BODY_SIZE_LIMIT env var (default 512K) before the request is ever routed
// here. Deployments must set BODY_SIZE_LIMIT >= MAX_UPLOAD_BYTES_MB (see
// $lib/server/uploadLimits); the explicit checks below then provide a clean
// 413 response as a second line of defense.

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
	if (contentLength > MAX_UPLOAD_BYTES) {
		throw error(
			413,
			`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit`
		);
	}

	if (!event.request.body) throw error(400, 'Missing request body');

	// Buffer the body instead of streaming it: some S3-compatible servers
	// (MinIO, s3rver, Cloudflare R2 in certain modes) mishandle the SDK's
	// streaming/chunked path and store corrupted bytes. A bounded buffer is
	// also the only way to guarantee the size cap is enforced atomically.
	let body: ArrayBuffer;
	try {
		body = await event.request.arrayBuffer();
	} catch (err) {
		console.error(`[upload] Failed to read request body for slide ${slideId}`, err);
		throw error(400, 'Could not read upload body');
	}
	if (body.byteLength > MAX_UPLOAD_BYTES) {
		throw error(
			413,
			`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit`
		);
	}

	try {
		await s3Client.send(
			new PutObjectCommand({
				Bucket: BUCKET_NAME,
				Key: slide.contentUrl,
				Body: Buffer.from(body),
				ContentType: contentType,
				ContentLength: body.byteLength
			})
		);
	} catch (err) {
		console.error(`[upload] S3 PUT failed for slide ${slideId}`, err);
		throw error(502, 'Storage upload failed');
	}

	return json({ success: true });
};
