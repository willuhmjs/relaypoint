import { prisma } from '$lib/server/prisma/prismaConnection';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const { version } = params;

	const apkVersion = await prisma.apkVersion.findUnique({
		where: { version }
	});

	if (!apkVersion) {
		throw error(404, 'APK version not found');
	}

	try {
		const command = new GetObjectCommand({
			Bucket: BUCKET_NAME,
			Key: apkVersion.s3Path
		});

		const response = await s3Client.send(command);

		if (!response.Body) {
			throw error(404, 'File not found in storage');
		}

		return new Response(response.Body as any, {
			headers: {
				'Content-Type': 'application/vnd.android.package-archive',
				'Content-Disposition': `attachment; filename="${apkVersion.filename}"`
			}
		});
	} catch (err) {
		console.error('Error fetching APK from S3:', err);
		throw error(500, 'Error downloading file');
	}
};
