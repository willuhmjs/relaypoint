// src/routes/(protected)/dash/displays/[id]/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma/prismaConnection';
import {
	broadcastUpdate,
	broadcastReload,
	broadcastSwUpdate,
	sendUpdateToClient,
	sendReloadToClient,
	sendDebugToggle,
	getConnectedClientsForDisplay,
	updateClientFriendlyName
} from '$lib/server/webSocketHandler';
import { s3Client, BUCKET_NAME } from '$lib/server/s3';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { actionHelper } from '$lib/server/actionHelper';
import { convertPdfToImages, convertOfficeToPdf } from '$lib/server/conversion';
import { getVideoDurationFromBuffer } from '$lib/server/videoDuration';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import JSZip from 'jszip';
import { assertCanEditDisplay, assertSessionForDisplayGroup } from '$lib/server/displayAuth';
import { sanitizeFilename } from '$lib/server/slideMime';

const OFFICE_PRESENTATION_MIME_TYPES = new Set([
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/vnd.ms-powerpoint'
]);

export const load = async (event) => {
	const { params } = event;
	const displayId = parseInt(params.id, 10);
	if (isNaN(displayId)) throw redirect(303, '/dash');

	const display = await prisma.display.findUnique({
		where: { id: displayId },
		include: {
			slides: {
				orderBy: { order: 'asc' }
			},
			assets: true,
			presentationSources: true
		}
	});

	if (!display) throw redirect(303, '/dash');

	await assertSessionForDisplayGroup(event, display.displayGroupId);

	return { display };
};

export const actions = {
	sendClientUpdate: actionHelper(
		z.object({
			displayId: z.string().transform(Number),
			clientId: z.string().uuid()
		}),
		async ({ displayId, clientId }, event) => {
			await assertCanEditDisplay(event, displayId);
			sendUpdateToClient(displayId, clientId);
			return { success: true, message: 'Update signal sent.' };
		}
	),

	forceClientRefresh: actionHelper(
		z.object({
			displayId: z.string().transform(Number),
			clientId: z.string().uuid()
		}),
		async ({ displayId, clientId }, event) => {
			await assertCanEditDisplay(event, displayId);
			sendReloadToClient(displayId, clientId);
			return { success: true, message: 'Refresh signal sent.' };
		}
	),

	setClientFriendlyName: actionHelper(
		z.object({
			clientId: z.string().uuid(),
			name: z.string().max(50).optional()
		}),
		async ({ clientId, name }, event) => {
			const client = await prisma.displayClient.findUnique({ where: { id: clientId } });
			if (!client) return fail(404, { message: 'Client not found.' });
			await assertCanEditDisplay(event, client.displayId);

			const friendlyName = name && name.trim() !== '' ? name.trim() : null;
			const updatedClient = await prisma.displayClient.update({
				where: { id: clientId },
				data: { friendlyName }
			});
			updateClientFriendlyName(updatedClient.displayId, clientId, friendlyName);
			return { success: true, message: 'Friendly name updated.', updatedClient };
		}
	),

	toggleClientDebug: actionHelper(
		z.object({
			displayId: z.string().transform(Number),
			clientId: z.string().uuid(),
			enabled: z.string().transform((v) => v === 'true')
		}),
		async ({ displayId, clientId, enabled }, event) => {
			await assertCanEditDisplay(event, displayId);
			sendDebugToggle(displayId, clientId, enabled);
			return { success: true, message: `Debug mode ${enabled ? 'enabled' : 'disabled'}.` };
		}
	),

	deleteClient: actionHelper(
		z.object({
			clientId: z.string().uuid()
		}),
		async ({ clientId }, event) => {
			const client = await prisma.displayClient.findUnique({ where: { id: clientId } });
			if (!client) return fail(404, { message: 'Client not found.' });
			await assertCanEditDisplay(event, client.displayId);

			await prisma.displayClient.delete({
				where: { id: clientId }
			});
			return { success: true, message: 'Client record deleted.' };
		}
	),

	clearClientHistory: actionHelper(
		z.object({
			displayId: z.string().transform(Number)
		}),
		async ({ displayId }, event) => {
			await assertCanEditDisplay(event, displayId);
			const connectedClients = getConnectedClientsForDisplay(displayId);
			const connectedClientIds = connectedClients.map((c) => c.id);

			const { count } = await prisma.displayClient.deleteMany({
				where: {
					displayId: displayId,
					id: {
						notIn: connectedClientIds
					}
				}
			});
			return { success: true, message: `${count} historical client records cleared.` };
		}
	),

	forceReloadDisplay: actionHelper(
		z.object({
			displayId: z.string().transform(Number)
		}),
		async ({ displayId }, event) => {
			await assertCanEditDisplay(event, displayId);
			broadcastReload(displayId);
			return { success: true, message: 'Reload signal sent to display.' };
		}
	),

	forceSwUpdate: actionHelper(
		z.object({
			displayId: z.string().transform(Number)
		}),
		async ({ displayId }, event) => {
			await assertCanEditDisplay(event, displayId);
			broadcastSwUpdate(displayId);
			return { success: true, message: 'Service worker update signal sent to display.' };
		}
	),

	restartPresentation: actionHelper(
		z.object({
			displayId: z.string().transform(Number)
		}),
		async ({ displayId }, event) => {
			const display = await prisma.display.findUnique({
				where: { id: displayId },
				include: { displayGroup: true }
			});

			if (!display) {
				return fail(404, { message: 'Display not found.' });
			}

			await assertSessionForDisplayGroup(event, display.displayGroupId);

			const isGroupSynced = display.displayGroup?.useSharedTimeline;

			if (isGroupSynced) {
				const groupId = display.displayGroupId;
				if (!groupId) {
					return fail(400, { message: 'Display is not in a group.' });
				}
				await prisma.displayGroup.update({
					where: { id: groupId },
					data: { timelineBasisTime: new Date() }
				});

				const displaysInGroup = await prisma.display.findMany({
					where: { displayGroupId: groupId },
					select: { id: true }
				});

				for (const d of displaysInGroup) {
					broadcastUpdate(d.id, 'GROUP_RESTARTED');
				}
				return { success: true, message: 'Synchronized group restarted.' };
			} else {
				await prisma.display.update({
					where: { id: displayId },
					data: { timelineBasisTime: new Date() }
				});
				broadcastUpdate(displayId, 'PRESENTATION_RESTARTED');
				return { success: true, message: 'Presentation restarted.' };
			}
		}
	),

	uploadFile: actionHelper(
		z.object({
			displayId: z.string(),
			file: z.instanceof(File)
		}),
		async ({ displayId, file }, event) => {
			const id = parseInt(displayId, 10);
			if (file.size === 0) return fail(400, { message: 'Empty file uploaded' });
			const display = await prisma.display.findUnique({ where: { id } });
			if (!display) return fail(404, { message: 'Display not found' });
			await assertSessionForDisplayGroup(event, display.displayGroupId);

			const fileBuffer = Buffer.from(await file.arrayBuffer());
			const fileType = file.type;
			const fileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
			let uploadWarning: string | undefined = undefined;
			const uploadTimestamp = Date.now();

			const newSlideIds: number[] = [];
			const newSlideKeys: string[] = [];
			const newAssetIds: string[] = [];
			const newAssetKeys: string[] = [];
			const newSourceIds: string[] = [];
			const newSourceKeys: string[] = [];
			let pendingSettings: { transitionType: string; transitionDuration: number } | null = null;

			async function rollback(reason: string, err: unknown): Promise<ReturnType<typeof fail>> {
				console.error(`[uploadFile] rollback (${reason}):`, err);
				await Promise.allSettled([
					...newSlideKeys.map((Key) =>
						s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key }))
					),
					...newAssetKeys.map((Key) =>
						s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key }))
					),
					...newSourceKeys.map((Key) =>
						s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key }))
					)
				]);
				if (newSlideIds.length > 0) {
					await prisma.slide.deleteMany({ where: { id: { in: newSlideIds } } });
				}
				if (newAssetIds.length > 0) {
					await prisma.displayAsset.deleteMany({ where: { id: { in: newAssetIds } } });
				}
				if (newSourceIds.length > 0) {
					await prisma.presentationSource.deleteMany({ where: { id: { in: newSourceIds } } });
				}
				return fail(500, { message: `Failed to process file (${reason}).` });
			}

			const currentMaxOrder = await prisma.slide.aggregate({
				where: { displayId: id },
				_max: { order: true }
			});
			let stagingOrder = (currentMaxOrder._max.order ?? -1) + 1;

			try {
				if (fileType === 'application/zip' || fileType === 'application/x-zip-compressed') {
					const zip = await JSZip.loadAsync(fileBuffer);
					const settingsFile = zip.file('settings.json');
					if (!settingsFile) {
						return fail(400, { message: 'Imported zip is missing settings.json.' });
					}
					const settings = JSON.parse(await settingsFile.async('string'));

					const assetFolder = zip.folder('assets');
					if (assetFolder) {
						const assetEntries: { relativePath: string; file: JSZip.JSZipObject }[] = [];
						assetFolder.forEach((relativePath, f) => {
							if (!f.dir) assetEntries.push({ relativePath, file: f });
						});
						for (const { relativePath, file: zf } of assetEntries) {
							const assetBuffer = await zf.async('nodebuffer');
							const safeAssetName = sanitizeFilename(relativePath);
							const s3Key = `displays/${id}/assets/${uploadTimestamp}-${safeAssetName}`;
							const asset = await prisma.displayAsset.create({
								data: {
									displayId: id,
									filename: `${uploadTimestamp}-${safeAssetName}`,
									s3Path: s3Key
								}
							});
							newAssetIds.push(asset.id);
							await s3Client.send(
								new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: assetBuffer })
							);
							newAssetKeys.push(s3Key);
						}
					}

					const slideFiles = zip.folder('slides');
					if (slideFiles) {
						for (const slideSetting of settings.slides) {
							const slideFile = zip.file(`slides/${slideSetting.filename}`);
							if (!slideFile) continue;
							const slideBuffer = await slideFile.async('nodebuffer');
							const safeSlideFilename = sanitizeFilename(slideSetting.filename);
							const s3Key = `displays/${id}/slides/${uploadTimestamp}-${safeSlideFilename}`;
							const slide = await prisma.slide.create({
								data: {
									displayId: id,
									order: stagingOrder,
									type: slideSetting.type,
									contentUrl: s3Key,
									duration: slideSetting.duration,
									isHidden: true,
									linkUrl: slideSetting.linkUrl || null
								}
							});
							newSlideIds.push(slide.id);
							stagingOrder += 1;
							await s3Client.send(
								new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: slideBuffer })
							);
							newSlideKeys.push(s3Key);
						}
					}

					pendingSettings = {
						transitionType: settings.display.transitionType,
						transitionDuration: settings.display.transitionDuration
					};
				} else if (fileType === 'application/pdf') {
					const images = await convertPdfToImages(
						fileBuffer,
						`display-${id}-slide-${uploadTimestamp}`
					);
					for (const [index, imageBuffer] of images.entries()) {
						const s3Key = `displays/${id}/slides/${uploadTimestamp}-page-${index + 1}.png`;
						const slide = await prisma.slide.create({
							data: {
								displayId: id,
								order: stagingOrder,
								type: 'IMAGE',
								contentUrl: s3Key,
								duration: 10,
								isHidden: true
							}
						});
						newSlideIds.push(slide.id);
						stagingOrder += 1;
						await s3Client.send(
							new PutObjectCommand({
								Bucket: BUCKET_NAME,
								Key: s3Key,
								Body: imageBuffer,
								ContentType: 'image/png'
							})
						);
						newSlideKeys.push(s3Key);
					}
				} else if (OFFICE_PRESENTATION_MIME_TYPES.has(fileType)) {
					const pdfBuffer = await convertOfficeToPdf(fileBuffer, fileName);
					const images = await convertPdfToImages(
						pdfBuffer,
						`display-${id}-slide-${uploadTimestamp}`
					);
					for (const [index, imageBuffer] of images.entries()) {
						const s3Key = `displays/${id}/slides/${uploadTimestamp}-page-${index + 1}.png`;
						const slide = await prisma.slide.create({
							data: {
								displayId: id,
								order: stagingOrder,
								type: 'IMAGE',
								contentUrl: s3Key,
								duration: 10,
								isHidden: true
							}
						});
						newSlideIds.push(slide.id);
						stagingOrder += 1;
						await s3Client.send(
							new PutObjectCommand({
								Bucket: BUCKET_NAME,
								Key: s3Key,
								Body: imageBuffer,
								ContentType: 'image/png'
							})
						);
						newSlideKeys.push(s3Key);
					}

					const sourceKey = `displays/${id}/sources/${uploadTimestamp}-${fileName}`;
					const source = await prisma.presentationSource.create({
						data: { displayId: id, filename: fileName, s3Path: sourceKey, mimeType: fileType }
					});
					newSourceIds.push(source.id);
					await s3Client.send(
						new PutObjectCommand({
							Bucket: BUCKET_NAME,
							Key: sourceKey,
							Body: fileBuffer,
							ContentType: fileType
						})
					);
					newSourceKeys.push(sourceKey);
				} else if (fileType.startsWith('image/')) {
					const s3Key = `displays/${id}/slides/${uploadTimestamp}-${fileName}`;
					const slide = await prisma.slide.create({
						data: {
							displayId: id,
							order: stagingOrder,
							type: 'IMAGE',
							contentUrl: s3Key,
							duration: 10,
							isHidden: true
						}
					});
					newSlideIds.push(slide.id);
					stagingOrder += 1;
					await s3Client.send(
						new PutObjectCommand({
							Bucket: BUCKET_NAME,
							Key: s3Key,
							Body: fileBuffer,
							ContentType: fileType
						})
					);
					newSlideKeys.push(s3Key);
				} else if (fileType.startsWith('video/')) {
					const s3Key = `displays/${id}/slides/${uploadTimestamp}-${fileName}`;
					let duration = 10;
					try {
						duration = await getVideoDurationFromBuffer(fileBuffer);
					} catch (err) {
						console.error('Could not get video duration during uploadFile:', err);
					}
					const slide = await prisma.slide.create({
						data: {
							displayId: id,
							order: stagingOrder,
							type: 'VIDEO',
							contentUrl: s3Key,
							duration,
							isHidden: true
						}
					});
					newSlideIds.push(slide.id);
					stagingOrder += 1;
					await s3Client.send(
						new PutObjectCommand({
							Bucket: BUCKET_NAME,
							Key: s3Key,
							Body: fileBuffer,
							ContentType: fileType
						})
					);
					newSlideKeys.push(s3Key);
				} else if (fileType === 'text/html') {
					const htmlContent = fileBuffer.toString('utf-8');
					const relativeLinkRegex = /(?:href|src)=["'](?!(?:https?:|\/\/|data:|#))([^"']+?)["']/gi;
					if (relativeLinkRegex.test(htmlContent)) {
						uploadWarning =
							'The uploaded HTML file appears to contain relative links. These assets may not load correctly. For best results, use absolute URLs.';
					}
					const s3Key = `displays/${id}/slides/${uploadTimestamp}-${fileName}`;
					const slide = await prisma.slide.create({
						data: {
							displayId: id,
							order: stagingOrder,
							type: 'HTML',
							contentUrl: s3Key,
							duration: 10,
							isHidden: true
						}
					});
					newSlideIds.push(slide.id);
					stagingOrder += 1;
					await s3Client.send(
						new PutObjectCommand({
							Bucket: BUCKET_NAME,
							Key: s3Key,
							Body: fileBuffer,
							ContentType: 'text/html'
						})
					);
					newSlideKeys.push(s3Key);
				} else {
					return fail(400, {
						message:
							'Unsupported file type. Please upload images, videos, PDFs, PowerPoint presentations, HTML, or .zip files.'
					});
				}

				if (newSlideIds.length === 0) {
					return fail(400, { message: 'No slides were extracted from the upload.' });
				}

				const swapResult = await prisma.$transaction(async (tx) => {
					const oldSlides = await tx.slide.findMany({
						where: { displayId: id, id: { notIn: newSlideIds } },
						select: { id: true, contentUrl: true, order: true }
					});
					const oldAssets = await tx.displayAsset.findMany({
						where: { displayId: id, id: { notIn: newAssetIds } },
						select: { id: true, s3Path: true }
					});
					const oldSources = await tx.presentationSource.findMany({
						where: { displayId: id, id: { notIn: newSourceIds } },
						select: { id: true, s3Path: true }
					});
					const orderedNew = await tx.slide.findMany({
						where: { id: { in: newSlideIds } },
						orderBy: { order: 'asc' },
						select: { id: true }
					});

					for (const [i, s] of oldSlides.entries()) {
						await tx.slide.update({
							where: { id: s.id },
							data: { order: -(i + 1) - newSlideIds.length }
						});
					}
					for (const [i, s] of orderedNew.entries()) {
						await tx.slide.update({ where: { id: s.id }, data: { order: -(i + 1) } });
					}
					await tx.slide.deleteMany({ where: { id: { in: oldSlides.map((s) => s.id) } } });
					await tx.displayAsset.deleteMany({
						where: { id: { in: oldAssets.map((a) => a.id) } }
					});
					await tx.presentationSource.deleteMany({
						where: { id: { in: oldSources.map((s) => s.id) } }
					});
					for (const [i, s] of orderedNew.entries()) {
						await tx.slide.update({ where: { id: s.id }, data: { order: i, isHidden: false } });
					}
					if (pendingSettings) {
						await tx.display.update({
							where: { id },
							data: {
								transitionType: pendingSettings.transitionType,
								transitionDuration: pendingSettings.transitionDuration
							}
						});
					}

					return { oldSlides, oldAssets, oldSources };
				});

				await Promise.allSettled([
					...swapResult.oldSlides.map((s) =>
						s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s.contentUrl }))
					),
					...swapResult.oldAssets.map((a) =>
						s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: a.s3Path }))
					),
					...swapResult.oldSources.map((s) =>
						s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s.s3Path }))
					)
				]);

				broadcastUpdate(id, 'PRESENTATION_REPLACED');
			} catch (err) {
				return rollback('processing or transaction error', err);
			}

			return {
				success: true,
				message: 'Existing slides replaced successfully.',
				warning: uploadWarning
			};
		}
	),

	addSlide: async (event) => {
		const { request, params } = event;
		const displayId = parseInt(params.id, 10);
		if (isNaN(displayId)) {
			return fail(400, { message: 'Invalid Display ID' });
		}

		const formData = await request.formData();
		const files = formData.getAll('file') as File[];
		const validFiles = files.filter((f) => f.size > 0);

		if (validFiles.length === 0) {
			return fail(400, { message: 'No files selected for upload.' });
		}

		const display = await prisma.display.findUnique({
			where: { id: displayId },
			include: { slides: { select: { order: true } } }
		});
		if (!display) {
			return fail(404, { message: 'Display not found' });
		}
		await assertSessionForDisplayGroup(event, display.displayGroupId);

		const maxOrder = display.slides.reduce((max, slide) => Math.max(max, slide.order), -1);
		let currentOrder = maxOrder + 1;

		const createdSlideIds: number[] = [];
		const createdS3Keys: string[] = [];
		const createdSourceIds: string[] = [];

		async function rollback(
			failedFilename: string,
			err: unknown
		): Promise<ReturnType<typeof fail>> {
			console.error(`[addSlide] rollback after failure on "${failedFilename}":`, err);
			await Promise.allSettled(
				createdS3Keys.map((Key) =>
					s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key }))
				)
			);
			if (createdSlideIds.length > 0) {
				await prisma.slide.deleteMany({ where: { id: { in: createdSlideIds } } });
			}
			if (createdSourceIds.length > 0) {
				await prisma.presentationSource.deleteMany({ where: { id: { in: createdSourceIds } } });
			}
			return fail(500, {
				message: `Upload failed at "${failedFilename}". All ${validFiles.length} slide(s) in this batch were rolled back.`
			});
		}

		for (const file of validFiles) {
			const fileBuffer = Buffer.from(await file.arrayBuffer());
			const fileType = file.type;
			const fileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
			const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

			try {
				if (fileType === 'application/pdf') {
					const images = await convertPdfToImages(
						fileBuffer,
						`display-${displayId}-slide-${uniqueSuffix}`
					);
					for (const [index, imageBuffer] of images.entries()) {
						const s3Key = `displays/${displayId}/slides/${uniqueSuffix}-page-${index + 1}.png`;
						const slide = await prisma.slide.create({
							data: {
								displayId,
								order: currentOrder,
								type: 'IMAGE',
								contentUrl: s3Key,
								duration: 10,
								isHidden: true
							}
						});
						createdSlideIds.push(slide.id);
						await s3Client.send(
							new PutObjectCommand({
								Bucket: BUCKET_NAME,
								Key: s3Key,
								Body: imageBuffer,
								ContentType: 'image/png'
							})
						);
						createdS3Keys.push(s3Key);
						await prisma.slide.update({ where: { id: slide.id }, data: { isHidden: false } });
						currentOrder++;
					}
				} else if (OFFICE_PRESENTATION_MIME_TYPES.has(fileType)) {
					const pdfBuffer = await convertOfficeToPdf(fileBuffer, fileName);
					const images = await convertPdfToImages(
						pdfBuffer,
						`display-${displayId}-slide-${uniqueSuffix}`
					);
					for (const [index, imageBuffer] of images.entries()) {
						const s3Key = `displays/${displayId}/slides/${uniqueSuffix}-page-${index + 1}.png`;
						const slide = await prisma.slide.create({
							data: {
								displayId,
								order: currentOrder,
								type: 'IMAGE',
								contentUrl: s3Key,
								duration: 10,
								isHidden: true
							}
						});
						createdSlideIds.push(slide.id);
						await s3Client.send(
							new PutObjectCommand({
								Bucket: BUCKET_NAME,
								Key: s3Key,
								Body: imageBuffer,
								ContentType: 'image/png'
							})
						);
						createdS3Keys.push(s3Key);
						await prisma.slide.update({ where: { id: slide.id }, data: { isHidden: false } });
						currentOrder++;
					}

					const sourceKey = `displays/${displayId}/sources/${uniqueSuffix}-${fileName}`;
					const source = await prisma.presentationSource.create({
						data: { displayId, filename: fileName, s3Path: sourceKey, mimeType: fileType }
					});
					createdSourceIds.push(source.id);
					await s3Client.send(
						new PutObjectCommand({
							Bucket: BUCKET_NAME,
							Key: sourceKey,
							Body: fileBuffer,
							ContentType: fileType
						})
					);
					createdS3Keys.push(sourceKey);
				} else if (
					fileType.startsWith('image/') ||
					fileType.startsWith('video/') ||
					fileType === 'text/html'
				) {
					let slideType: 'IMAGE' | 'VIDEO' | 'HTML';
					if (fileType.startsWith('image/')) slideType = 'IMAGE';
					else if (fileType.startsWith('video/')) slideType = 'VIDEO';
					else slideType = 'HTML';

					const s3Key = `displays/${displayId}/slides/${uniqueSuffix}-${fileName}`;

					let duration = 10;
					if (slideType === 'VIDEO') {
						try {
							duration = await getVideoDurationFromBuffer(fileBuffer);
						} catch (err) {
							console.error(`[addSlide] could not get video duration for ${fileName}:`, err);
						}
					}

					const slide = await prisma.slide.create({
						data: {
							displayId,
							order: currentOrder,
							type: slideType,
							contentUrl: s3Key,
							duration,
							isHidden: true
						}
					});
					createdSlideIds.push(slide.id);
					await s3Client.send(
						new PutObjectCommand({
							Bucket: BUCKET_NAME,
							Key: s3Key,
							Body: fileBuffer,
							ContentType: slideType === 'HTML' ? 'text/html' : fileType
						})
					);
					createdS3Keys.push(s3Key);
					await prisma.slide.update({ where: { id: slide.id }, data: { isHidden: false } });
					currentOrder++;
				} else {
					console.warn(`[addSlide] skipping unsupported file type: ${fileType} for ${fileName}`);
					continue;
				}
			} catch (err) {
				return rollback(file.name, err);
			}
		}

		if (createdSlideIds.length === 0) {
			return fail(400, { message: 'No valid files were uploaded.' });
		}

		broadcastUpdate(displayId, 'SLIDE_ADDED');
		return { success: true, message: `${createdSlideIds.length} slide(s) added successfully.` };
	},

	updateSettings: async (event) => {
		const { request, params } = event;
		const displayId = parseInt(params.id, 10);
		const formData = await request.formData();
		const transitionType = formData.get('transitionType') as 'fade' | 'slide' | 'none';
		const transitionDuration = formData.get('transitionDuration');
		const showQrCode = formData.get('showQrCode') === 'true';

		if (isNaN(displayId) || !transitionType) {
			return fail(400, { message: 'Invalid data provided.' });
		}

		const display = await prisma.display.findUnique({
			where: { id: displayId },
			select: { displayGroupId: true }
		});
		if (!display) {
			return fail(404, { message: 'Display not found.' });
		}
		await assertSessionForDisplayGroup(event, display.displayGroupId);

		try {
			await prisma.display.update({
				where: { id: displayId },
				data: {
					transitionType,
					transitionDuration: transitionDuration
						? parseInt(transitionDuration.toString(), 10)
						: 500,
					showQrCode
				}
			});
			broadcastUpdate(displayId, 'SETTINGS_UPDATED');
			return { success: true, message: 'Settings saved and updated!' };
		} catch (error) {
			console.error('Error updating display settings:', error);
			return fail(500, { message: 'Failed to save settings.' });
		}
	},

	updateSlideLink: actionHelper(
		z.object({
			slideId: z.string().transform(Number),
			linkUrl: z.string().nullable().optional()
		}),
		async ({ slideId, linkUrl }, event) => {
			const existingSlide = await prisma.slide.findUnique({ where: { id: slideId } });
			if (!existingSlide) return fail(404, { message: 'Slide not found.' });
			await assertCanEditDisplay(event, existingSlide.displayId);

			const slide = await prisma.slide.update({
				where: { id: slideId },
				data: { linkUrl }
			});
			broadcastUpdate(slide.displayId, 'SLIDE_LINK_UPDATED');
			return { success: true, message: 'Link updated.' };
		}
	),

	updateSlideDuration: actionHelper(
		z.object({
			slideId: z.string().transform(Number),
			duration: z.string().transform(Number).pipe(z.number().min(1))
		}),
		async ({ slideId, duration }, event) => {
			const existingSlide = await prisma.slide.findUnique({ where: { id: slideId } });
			if (!existingSlide) return fail(404, { message: 'Slide not found.' });
			await assertCanEditDisplay(event, existingSlide.displayId);

			const slide = await prisma.slide.update({
				where: { id: slideId },
				data: { duration }
			});
			broadcastUpdate(slide.displayId, 'SLIDE_DURATION_UPDATED');
			return { success: true, message: 'Duration updated.' };
		}
	),

	updateAllSlideDurations: actionHelper(
		z.object({
			displayId: z.string().transform(Number),
			duration: z.string().transform(Number).pipe(z.number().min(1))
		}),
		async ({ displayId, duration }, event) => {
			await assertCanEditDisplay(event, displayId);
			await prisma.slide.updateMany({
				where: { displayId: displayId },
				data: { duration: duration }
			});
			broadcastUpdate(displayId, 'SLIDE_DURATION_UPDATED');
			return { success: true, message: 'All slide durations updated.' };
		}
	),

	updateSlideOrder: actionHelper(
		z.object({
			displayId: z.string(),
			slideOrder: z.string().transform((val) => JSON.parse(val) as number[])
		}),
		async ({ slideOrder, displayId }, event) => {
			await assertCanEditDisplay(event, parseInt(displayId, 10));
			await prisma.$transaction(async (tx) => {
				const updatesPhase1 = slideOrder.map((slideId, index) =>
					tx.slide.update({
						where: { id: slideId },
						data: { order: -index - 1 }
					})
				);
				await Promise.all(updatesPhase1);

				const updatesPhase2 = slideOrder.map((slideId, index) =>
					tx.slide.update({
						where: { id: slideId },
						data: { order: index }
					})
				);
				await Promise.all(updatesPhase2);
			});

			broadcastUpdate(parseInt(displayId, 10), 'SLIDE_ORDER_UPDATED');
			return { success: true, message: 'Slide order updated.' };
		}
	),

	deleteSlide: actionHelper(z.object({ slideId: z.string() }), async ({ slideId }, event) => {
		const id = parseInt(slideId, 10);
		const slideToDelete = await prisma.slide.findUnique({ where: { id } });
		if (!slideToDelete) return fail(404, { message: 'Slide not found.' });
		await assertCanEditDisplay(event, slideToDelete.displayId);

		try {
			const s3Key = slideToDelete.contentUrl;
			if (s3Key) {
				await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }));
			}
			await prisma.slide.delete({ where: { id } });

			const displayId = slideToDelete.displayId;
			const remainingSlides = await prisma.slide.findMany({
				where: { displayId },
				orderBy: { order: 'asc' }
			});

			await prisma.$transaction(
				remainingSlides.map((slide, index) =>
					prisma.slide.update({
						where: { id: slide.id },
						data: { order: index }
					})
				)
			);
			broadcastUpdate(displayId, 'SLIDE_DELETED');
			return { success: true, message: 'Slide deleted and order updated.' };
		} catch (error) {
			console.error('Error deleting slide or S3 object:', error);
			return fail(500, { message: 'Failed to delete slide.' });
		}
	}),

	toggleVisibility: actionHelper(z.object({ slideId: z.string() }), async ({ slideId }, event) => {
		const id = parseInt(slideId, 10);
		const slide = await prisma.slide.findUnique({ where: { id } });
		if (!slide) return fail(404, { message: 'Slide not found' });
		await assertCanEditDisplay(event, slide.displayId);

		const updatedSlide = await prisma.slide.update({
			where: { id },
			data: { isHidden: !slide.isHidden }
		});
		broadcastUpdate(updatedSlide.displayId, 'SLIDE_VISIBILITY_UPDATED');
		return { success: true, message: 'Visibility updated' };
	}),

	uploadAsset: actionHelper(
		z.object({
			displayId: z.string().transform(Number),
			file: z.instanceof(File)
		}),
		async ({ displayId, file }, event) => {
			if (file.size === 0) return fail(400, { message: 'Empty file uploaded' });

			const display = await prisma.display.findUnique({ where: { id: displayId } });
			if (!display) return fail(404, { message: 'Display not found' });
			await assertSessionForDisplayGroup(event, display.displayGroupId);

			const fileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
			const s3Key = `displays/${displayId}/assets/${fileName}`;

			try {
				await s3Client.send(
					new PutObjectCommand({
						Bucket: BUCKET_NAME,
						Key: s3Key,
						Body: Buffer.from(await file.arrayBuffer()),
						ContentType: file.type
					})
				);

				await prisma.displayAsset.upsert({
					where: { displayId_filename: { displayId, filename: fileName } },
					update: { s3Path: s3Key },
					create: {
						displayId: displayId,
						filename: fileName,
						s3Path: s3Key
					}
				});

				return { success: true, message: 'Asset uploaded successfully.' };
			} catch (error) {
				console.error('Asset upload failed:', error);
				return fail(500, { message: 'Failed to process file.' });
			}
		}
	),

	deleteAsset: actionHelper(z.object({ assetId: z.string() }), async ({ assetId }, event) => {
		const asset = await prisma.displayAsset.findUnique({ where: { id: assetId } });
		if (!asset) return fail(404, { message: 'Asset not found.' });
		await assertCanEditDisplay(event, asset.displayId);

		try {
			await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: asset.s3Path }));
			await prisma.displayAsset.delete({ where: { id: assetId } });
			return { success: true, message: 'Asset deleted.' };
		} catch (error) {
			console.error('Error deleting asset or S3 object:', error);
			return fail(500, { message: 'Failed to delete asset.' });
		}
	}),

	deleteAllSlides: async (event) => {
		const { params } = event;
		const displayId = parseInt(params.id, 10);
		if (isNaN(displayId)) {
			return fail(400, { message: 'Invalid Display ID' });
		}
		await assertCanEditDisplay(event, displayId);

		const slides = await prisma.slide.findMany({
			where: { displayId }
		});

		if (slides.length === 0) {
			return { success: true, message: 'No slides to delete.' };
		}

		try {
			const deletePromises = slides.map((slide) => {
				const s3Key = slide.contentUrl;
				if (!s3Key) return Promise.resolve();
				return s3Client.send(
					new DeleteObjectCommand({
						Bucket: BUCKET_NAME,
						Key: s3Key
					})
				);
			});
			await Promise.all(deletePromises);

			await prisma.slide.deleteMany({
				where: { displayId }
			});

			broadcastUpdate(displayId, 'PRESENTATION_REPLACED');
			return { success: true, message: 'All slides have been deleted.' };
		} catch (error) {
			console.error('Failed to delete slides:', error);
			return fail(500, { message: 'Could not delete all slides.' });
		}
	}
};
