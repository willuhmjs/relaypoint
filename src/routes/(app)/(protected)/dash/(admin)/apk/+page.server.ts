import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma/prismaConnection';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();
	if (!session?.user?.id) {
		redirect(303, '/');
	}
	if (session.user.role !== 'ADMIN') {
		redirect(303, '/dash');
	}

	const versions = await prisma.apkVersion.findMany({
		orderBy: {
			createdAt: 'desc'
		}
	});
	return { versions };
};

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		const session = await locals.auth();
		if (session?.user?.role !== 'ADMIN') {
			return fail(403, { error: 'You are not authorized to perform this action.' });
		}

		const formData = await request.formData();
		const apkFile = formData.get('apk') as File;
		const version = formData.get('version') as string;

		if (!apkFile || !version) {
			return fail(400, { error: 'Missing required fields' });
		}

		if (!apkFile.name.endsWith('.apk')) {
			return fail(400, { error: 'File must be an APK' });
		}

		const existing = await prisma.apkVersion.findUnique({
			where: { version }
		});

		if (existing) {
			return fail(400, { error: 'Version already exists' });
		}

		try {
			const filename = `${uuidv4()}-${apkFile.name}`;
			const s3Path = `apks/${filename}`;

			const buffer = await apkFile.arrayBuffer();

			await s3Client.send(
				new PutObjectCommand({
					Bucket: BUCKET_NAME,
					Key: s3Path,
					Body: Buffer.from(buffer),
					ContentType: 'application/vnd.android.package-archive'
				})
			);

			await prisma.apkVersion.create({
				data: {
					version,
					filename: apkFile.name,
					s3Path
				}
			});

			// Cleanup unpinned older versions
			const allVersions = await prisma.apkVersion.findMany({
				orderBy: { createdAt: 'desc' }
			});

			// Skip the newly uploaded one
			const toDelete = allVersions.slice(1).filter((v) => !v.isPinned);

			for (const v of toDelete) {
				try {
					await s3Client.send(
						new DeleteObjectCommand({
							Bucket: BUCKET_NAME,
							Key: v.s3Path
						})
					);
					await prisma.apkVersion.delete({
						where: { id: v.id }
					});
				} catch (e) {
					console.error(`Failed to delete old version ${v.version}:`, e);
				}
			}

			return { success: 'APK uploaded successfully' };
		} catch (error: any) {
			console.error('Error uploading APK:', error);
			return fail(500, { error: 'Failed to upload APK' });
		}
	},

	togglePin: async ({ request, locals }) => {
		const session = await locals.auth();
		if (session?.user?.role !== 'ADMIN') {
			return fail(403, { error: 'You are not authorized to perform this action.' });
		}

		const formData = await request.formData();
		const id = formData.get('id') as string;
		const pinned = formData.get('pinned') === 'true';

		try {
			await prisma.apkVersion.update({
				where: { id },
				data: { isPinned: pinned }
			});
			return { success: true };
		} catch (error) {
			return fail(500, { error: 'Failed to toggle pin status' });
		}
	},

	delete: async ({ request, locals }) => {
		const session = await locals.auth();
		if (session?.user?.role !== 'ADMIN') {
			return fail(403, { error: 'You are not authorized to perform this action.' });
		}

		const formData = await request.formData();
		const id = formData.get('id') as string;

		try {
			const version = await prisma.apkVersion.findUnique({
				where: { id }
			});

			if (version) {
				await s3Client.send(
					new DeleteObjectCommand({
						Bucket: BUCKET_NAME,
						Key: version.s3Path
					})
				);

				await prisma.apkVersion.delete({
					where: { id }
				});
			}
			return { success: 'Version deleted' };
		} catch (error) {
			return fail(500, { error: 'Failed to delete version' });
		}
	}
};
