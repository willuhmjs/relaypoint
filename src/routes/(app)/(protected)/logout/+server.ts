import { redirect } from '@sveltejs/kit';
import { signOut } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

export async function POST(event) {
	const session = await event.locals.auth();

	// Only attempt a full identity-provider logout when an OIDC issuer is
	// configured (e.g. Keycloak). Providers without a back-channel logout
	// endpoint (or deployments with no OAuth provider at all) just clear the
	// local Auth.js session.
	const issuer = env.AUTH_KEYCLOAK_ISSUER;
	let redirectTo = '/';

	if (issuer) {
		const logOutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);

		if (session?.id_token) {
			logOutUrl.searchParams.set('id_token_hint', session.id_token);
		}

		if (env.APP_URL) {
			logOutUrl.searchParams.set('post_logout_redirect_uri', env.APP_URL);
		}

		redirectTo = logOutUrl.toString();
	}

	// Sign out of the local Auth.js session
	await signOut(event);

	// Redirect to the identity provider (when configured) to complete the logout
	throw redirect(303, redirectTo);
}
