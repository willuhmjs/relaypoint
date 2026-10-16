import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { actionHelper } from '$lib/server/actionHelper';
import { buildAuthProviders } from '$lib/server/authProviders';
import {
	createLocalSession,
	createLocalUser,
	isLocalAuthEnabled,
	localSignUpAllowed,
	verifyLocalCredentials
} from '$lib/server/localAuth';

// This `load` function runs before the page is rendered.
export const load: PageServerLoad = async ({ url }) => {
	// Get the 'redirectTo' query parameter from the URL
	const redirectTo = url.searchParams.get('redirectTo');

	const providers = (await buildAuthProviders()).map((provider) => ({
		id: provider.id,
		name: provider.name
	}));

	return {
		redirectTo: redirectTo ?? undefined,
		providers,
		localAuthEnabled: isLocalAuthEnabled(),
		localSignUpAllowed: await localSignUpAllowed()
	};
};

/** Only allow same-origin redirect targets (guards against open redirects). */
function safeRedirect(value: unknown): string {
	if (typeof value !== 'string' || value.length === 0) return '/dash';
	let target = value;
	try {
		target = decodeURIComponent(value);
	} catch {
		/* keep raw value */
	}
	if (target.startsWith('/') && !target.startsWith('//')) return target;
	return '/dash';
}

const credentialsSchema = z.object({
	email: z.string().min(3).max(320),
	password: z.string().min(1).max(500),
	redirectTo: z.string().optional()
});

async function startLocalSession(userId: string, event: RequestEvent) {
	const session = await createLocalSession(userId, event.url);
	event.cookies.set(session.cookieName, session.token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: session.secure,
		expires: session.expires
	});
}

export const actions: Actions = {
	localLogin: async (event) => {
		if (!isLocalAuthEnabled()) {
			return fail(403, { error: 'Local sign-in is not enabled on this instance.' });
		}
		return actionHelper(credentialsSchema, async ({ email, password, redirectTo }, e) => {
			const user = await verifyLocalCredentials(email, password);
			if (!user) {
				return fail(401, { error: 'Invalid email or password.' });
			}
			await startLocalSession(user.id, e);
			throw redirect(303, safeRedirect(redirectTo));
		})(event);
	},

	localSignUp: async (event) => {
		if (!isLocalAuthEnabled()) {
			return fail(403, { error: 'Local accounts are not enabled on this instance.' });
		}
		if (!(await localSignUpAllowed())) {
			return fail(403, { error: 'Sign-ups are disabled on this instance.' });
		}
		return actionHelper(
			credentialsSchema.extend({
				name: z.string().min(1).max(100),
				password: z.string().min(8).max(500)
			}),
			async ({ name, email, password }, e) => {
				try {
					await createLocalUser({ name, email, password });
				} catch (err) {
					const message =
						err instanceof Error && err.message.includes('already exists')
							? err.message
							: 'Could not create the account. Try a different email address.';
					return fail(400, { error: message });
				}
				const user = await verifyLocalCredentials(email, password);
				if (!user) {
					return fail(500, { error: 'Account created, but sign-in failed. Try logging in.' });
				}
				await startLocalSession(user.id, e);
				throw redirect(303, '/dash');
			}
		)(event);
	}
};
