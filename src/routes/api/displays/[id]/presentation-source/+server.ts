import { prisma } from '$lib/server/prisma/prismaConnection';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { error } from '@sveltejs/kit';
import { assertSessionForDisplayGroup } from '$lib/server/displayAuth';
import JSZip from 'jszip';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { params } = event;
	const displayId = parseInt(params.id ?? '', 10);
	if (isNaN(displayId)) {
		throw error(400, 'Invalid display ID');
	}

	const display = await prisma.display.findUnique({ where: { id: displayId } });
	if (!display) {
		throw error(404, 'Display not found');
	}
	await assertSessionForDisplayGroup(event, display.displayGroupId);

	const sources = await prisma.presentationSource.findMany({
		where: { displayId },
		orderBy: { createdAt: 'asc' }
	});

	if (sources.length === 0) {
		throw error(404, 'No original presentation files have been retained for this display.');
	}

	try {
		if (sources.length === 1) {
			const source = sources[0];
			const response = await s3Client.send(
				new GetObjectCommand({ Bucket: BUCKET_NAME, Key: source.s3Path })
			);
			if (!response.Body) {
				throw error(404, 'File not found in storage');
			}
			return new Response(response.Body as any, {
				headers: {
					'Content-Type': source.mimeType,
					'Content-Disposition': `attachment; filename="${source.filename}"`
				}
			});
		}

		const zip = new JSZip();
		for (const source of sources) {
			const response = await s3Client.send(
				new GetObjectCommand({ Bucket: BUCKET_NAME, Key: source.s3Path })
			);
			const bytes = await response.Body?.transformToByteArray();
			if (bytes) {
				zip.file(source.filename, bytes);
			}
		}
		const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

		return new Response(zipBuffer, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${display.name.replace(/\s+/g, '_')}_originals.zip"`
			}
		});
	} catch (err) {
		console.error('Error fetching presentation source(s) from S3:', err);
		throw error(500, 'Error downloading file');
	}
};
