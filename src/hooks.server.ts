import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authenticationHandle } from '$lib/server/auth';

// Only the dashboard requires a session; kiosk/view pages are deliberately
// public (they're what the displays themselves load).
async function authorizationHandle({ event, resolve }: Parameters<Handle>[0]) {
	if (event.url.pathname.startsWith('/dash')) {
		const session = await event.locals.auth();
		if (!session) {
			throw redirect(303, '/login');
		}
	}
	return resolve(event);
}

/**
 * Baseline security headers. User-uploaded slide content (HTML/SVG) is served
 * from /content with a sandboxed CSP; every other page is framed by nothing
 * except same-origin dashboard previews.
 */
async function securityHeadersHandle({ event, resolve }: Parameters<Handle>[0]) {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	if (!response.headers.has('Content-Security-Policy')) {
		response.headers.set('Content-Security-Policy', "frame-ancestors 'self'");
	}
	return response;
}

export const handle: Handle = sequence(
	authenticationHandle,
	authorizationHandle,
	securityHeadersHandle
);
