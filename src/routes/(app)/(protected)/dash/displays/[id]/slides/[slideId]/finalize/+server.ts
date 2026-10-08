import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { broadcastUpdate } from '$lib/server/webSocketHandler';
import { getVideoDurationFromStream, DEFAULT_VIDEO_DURATION } from '$lib/server/videoDuration';
import { assertCanEditDisplay } from '$lib/server/displayAuth';

export const POST: RequestHandler = async (event) => {
	const displayId = parseInt(event.params.id ?? '', 10);
	const slideId = parseInt(event.params.slideId ?? '', 10);
	if (isNaN(displayId) || isNaN(slideId)) throw error(400, 'Invalid IDs');

	await assertCanEditDisplay(event, displayId);

	const slide = await prisma.slide.findUnique({ where: { id: slideId } });
	if (!slide || slide.displayId !== displayId) throw error(404, 'Slide not found');

	if (!slide.isHidden) {
		return json({ success: true, slide });
	}

	let duration = slide.duration;

	if (slide.type === 'VIDEO') {
		let obj;
		try {
			obj = await s3Client.send(
				new GetObjectCommand({ Bucket: BUCKET_NAME, Key: slide.contentUrl })
			);
		} catch (err) {
			console.error(`[finalize] S3 object missing for slide ${slideId}`, err);
			throw error(409, 'Upload not found in storage');
		}
		if (!obj.Body) throw error(409, 'Upload not found in storage');
		try {
			duration = await getVideoDurationFromStream(obj.Body as Readable);
		} catch (err) {
			console.error(`[finalize] ffprobe failed for slide ${slideId}, using default`, err);
			duration = DEFAULT_VIDEO_DURATION;
		}
	} else {
		try {
			await s3Client.send(
				new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: slide.contentUrl })
			);
		} catch (err) {
			console.error(`[finalize] S3 object missing for slide ${slideId}`, err);
			throw error(409, 'Upload not found in storage');
		}
	}

	const updated = await prisma.slide.update({
		where: { id: slideId },
		data: { isHidden: false, duration }
	});

	broadcastUpdate(displayId, 'SLIDE_ADDED');

	return json({ success: true, slide: updated });
};
