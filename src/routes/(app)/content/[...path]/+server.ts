// src/routes/(app)/content/[...path]/+server.ts

import { s3Client } from '$lib/server/s3';
import { env as publicEnv } from '$env/dynamic/public';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

const BUCKET_NAME = publicEnv.PUBLIC_S3_BUCKET_NAME;

/**
 * Only slide media and slide assets may be fetched through this public proxy.
 * Everything else in the bucket (`.../sources/` originals, `apks/`, ...) must
 * be served through authenticated routes instead.
 */
const ALLOWED_KEY = /^displays\/\d+\/(slides|assets)\/[\w.()-]+$/;

/**
 * Uploaded HTML/SVG slides are untrusted-ish content authored by team users.
 * Serve them inside a CSP sandbox (opaque origin): scripts still run, which
 * keeps animated HTML slides working on kiosk displays, but the document can
 * no longer read the application's cookies or act on a viewer's session.
 */
const SANDBOXED_CONTENT_TYPES = new Set(['text/html', 'image/svg+xml']);
const SANDBOX_CSP = 'sandbox allow-scripts allow-forms allow-popups';

const EXTENSION_TYPES: Record<string, string> = {
	html: 'text/html',
	htm: 'text/html',
	css: 'text/css',
	js: 'application/javascript',
	json: 'application/json',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	pdf: 'application/pdf',
	webp: 'image/webp',
	webm: 'video/webm',
	mp4: 'video/mp4'
};

/**
 * A SvelteKit server route that acts as a secure proxy to an S3 bucket.
 * It handles requests for files, fetches them from the bucket, and streams
 * them back to the client.
 */
export const GET: RequestHandler = async ({ params }) => {
	let fileKey = params.path;

	// Sanitize the file key: remove leading slashes and 'content/' prefix if present
	// This handles cases where the URL might be constructed incorrectly (e.g., /content/content/...)
	if (fileKey) {
		fileKey = fileKey.replace(/^\/+/, ''); // Remove leading slashes
		if (fileKey.startsWith('content/')) {
			fileKey = fileKey.substring('content/'.length); // Remove 'content/' prefix
		}
	}

	if (!BUCKET_NAME) {
		console.error('S3 bucket name is not configured on the server.');
		throw error(500, 'S3 bucket name is not configured on the server.');
	}

	if (!fileKey) {
		throw error(400, 'File path is missing.');
	}

	if (!ALLOWED_KEY.test(fileKey)) {
		throw error(404, 'File not found');
	}

	const getObjectCommand = new GetObjectCommand({
		Bucket: BUCKET_NAME,
		Key: fileKey
	});

	try {
		const s3Response = await s3Client.send(getObjectCommand);

		// The AWS SDK v3 can return different stream types depending on the environment (Node.js vs. Edge).
		// We just need to check if the body exists, not what type of stream it is.
		const body = s3Response.Body;

		if (!body) {
			throw error(500, 'Failed to retrieve file from S3: Response body was empty.');
		}

		let contentType = s3Response.ContentType || 'application/octet-stream';

		// Fallback: If S3 returns octet-stream (generic) or nothing, try to guess from extension
		if (!contentType || contentType === 'application/octet-stream') {
			const ext = fileKey.split('.').pop()?.toLowerCase();
			contentType = (ext && EXTENSION_TYPES[ext]) || 'application/octet-stream';
		}

		const headers: Record<string, string> = {
			'Content-Type': contentType,
			'Content-Length': s3Response.ContentLength?.toString() || '0',
			'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
			'X-Content-Type-Options': 'nosniff'
		};
		if (SANDBOXED_CONTENT_TYPES.has(contentType)) {
			headers['Content-Security-Policy'] = SANDBOX_CSP;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return new Response(body as any, {
			status: 200,
			headers
		});
	} catch (err) {
		const errorObj = err as { name?: string; message?: string };
		// Handle cases where the file is not found in the bucket.
		if (errorObj.name === 'NoSuchKey') {
			console.warn(`File not found in S3. Bucket: ${BUCKET_NAME}, Key: ${fileKey}`);
			throw error(404, 'File not found');
		}

		// Handle other potential S3 errors.
		console.error(`S3 Error fetching key "${fileKey}":`, err);
		throw error(500, 'Internal Server Error: Could not retrieve file.');
	}
};
