import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handle as authenticationHandle } from '$lib/server/auth';

// This handle now only checks for dashboard authorization.
async function authorizationHandle({ event, resolve }: { event: any; resolve: any }) {
    if (event.url.pathname.startsWith('/dash')) {
        const session = await event.locals.auth();
        if (!session) {
            throw redirect(303, '/login');
        }
    }
    return resolve(event);
}

// Your final handle sequences the two auth-related functions.
export const handle: Handle = sequence(authenticationHandle, authorizationHandle);