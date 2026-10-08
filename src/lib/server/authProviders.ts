import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { OAuthConfig } from '@auth/core/providers';

/**
 * Which OAuth/OIDC providers to enable, and how they're configured, is driven
 * entirely by environment variables so a deployment can plug in any provider
 * from Auth.js's provider catalog (https://authjs.dev/getting-started/providers)
 * without touching this codebase.
 *
 * - `AUTH_PROVIDERS`: comma-separated list of Auth.js provider ids, e.g.
 *   `AUTH_PROVIDERS=keycloak,google,github`. Each id must match the filename
 *   of a provider module under `@auth/core/providers/`.
 * - For each enabled provider, credentials are read using Auth.js's own
 *   env-var convention (see `setEnvDefaults` in `@auth/core`): `AUTH_<ID>_ID`,
 *   `AUTH_<ID>_SECRET`, and (for OIDC providers) `AUTH_<ID>_ISSUER`, where
 *   `<ID>` is the provider id upper-cased with `-` replaced by `_`. For
 *   example, `keycloak` reads `AUTH_KEYCLOAK_ID` / `AUTH_KEYCLOAK_SECRET` /
 *   `AUTH_KEYCLOAK_ISSUER`. Nothing needs to be passed explicitly here.
 * - If `AUTH_PROVIDERS` isn't set at all, this falls back to the legacy
 *   `PUBLIC_AUTH_PROVIDER_KEYCLOAK_ENABLED` flag so existing deployments that
 *   predate this mechanism keep working unchanged.
 * - For an identity provider that isn't in Auth.js's catalog at all (e.g. a
 *   self-hosted/custom OIDC issuer), set `AUTH_CUSTOM_OIDC_ISSUER` (plus
 *   `_ID` / `_SECRET` / optionally `_NAME`) to add a generic OIDC provider.
 */

function enabledProviderIds(): string[] {
	if (env.AUTH_PROVIDERS) {
		return env.AUTH_PROVIDERS.split(',')
			.map((id) => id.trim())
			.filter(Boolean);
	}
	return publicEnv.PUBLIC_AUTH_PROVIDER_KEYCLOAK_ENABLED === 'true' ? ['keycloak'] : [];
}

// Relaypoint reads a `groups` claim off the Keycloak profile to drive the
// "syskids" auto-admin group check in auth.ts. That claim is specific to how
// this deployment's Keycloak realm is configured, so it's only applied to
// the `keycloak` provider, not to other providers users might configure.
function withKeycloakProfileMapping(provider: OAuthConfig<any>): OAuthConfig<any> {
	return {
		...provider,
		profile(profile: any) {
			return {
				id: profile.sub ?? '',
				name: profile.name ?? '',
				email: profile.email ?? '',
				image: profile.image ?? profile.picture ?? '',
				groups: profile.groups,
				// Overwritten unconditionally in CustomAdapter.createUser below;
				// only present here to satisfy the app's `role` type augmentation.
				role: profile.role
			};
		},
		allowDangerousEmailAccountLinking: true
	};
}

async function loadBuiltInProvider(id: string): Promise<OAuthConfig<any> | null> {
	try {
		// Auth.js publishes every built-in provider as its own subpath
		// (`@auth/core/providers/<id>`), so this can load any of them by id
		// without this codebase needing to know about it ahead of time.
		const mod = await import(`@auth/core/providers/${id}`);
		const factory = mod.default;
		if (typeof factory !== 'function') return null;

		// Passing an empty config lets @auth/core's setEnvDefaults fill in
		// clientId/clientSecret/issuer from AUTH_<ID>_ID / AUTH_<ID>_SECRET /
		// AUTH_<ID>_ISSUER once SvelteKitAuth() initializes.
		let provider = factory({});
		if (id === 'keycloak') provider = withKeycloakProfileMapping(provider);
		return provider;
	} catch (err) {
		console.error(`[auth] Unknown or unavailable provider id "${id}" in AUTH_PROVIDERS.`, err);
		return null;
	}
}

function buildCustomOidcProvider(): OAuthConfig<any> | null {
	if (!env.AUTH_CUSTOM_OIDC_ISSUER) return null;
	return {
		id: 'custom-oidc',
		name: env.AUTH_CUSTOM_OIDC_NAME || 'Single Sign-On',
		type: 'oidc',
		issuer: env.AUTH_CUSTOM_OIDC_ISSUER,
		clientId: env.AUTH_CUSTOM_OIDC_ID,
		clientSecret: env.AUTH_CUSTOM_OIDC_SECRET
	};
}

export async function buildAuthProviders(): Promise<OAuthConfig<any>[]> {
	const providers: OAuthConfig<any>[] = [];

	for (const id of enabledProviderIds()) {
		const provider = await loadBuiltInProvider(id);
		if (provider) providers.push(provider);
	}

	const customOidc = buildCustomOidcProvider();
	if (customOidc) providers.push(customOidc);

	return providers;
}
