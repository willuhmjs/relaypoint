// src/auth.ts
import { SvelteKitAuth } from '@auth/sveltekit';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { Role } from '@prisma/client';
import { env as privateEnv } from '$env/dynamic/private';
import { prisma } from './prisma/prismaConnection';
import { buildAuthProviders } from './authProviders';
import type { Adapter, AdapterUser } from '@auth/core/adapters';

declare module '@auth/core/types' {
	interface Session {
		/**
		 * OIDC id_token, kept SERVER-SIDE only (the logout route uses it as an
		 * `id_token_hint` for RP-initiated logout). It is stripped from the
		 * `/auth/session` response before it reaches the browser.
		 */
		id_token?: string;
		user?: {
			role: Role;
		} & AdapterUser;
	}
	interface User {
		role: Role;
	}
}

declare module '@auth/core/adapters' {
	interface AdapterUser {
		groups?: string[];
	}
}

const CustomAdapter: Adapter = {
	...PrismaAdapter(prisma),
	createUser: async (user) => {
		const newUser = await prisma.$transaction(async (tx) => {
			// Serialize concurrent sign-ups so that "am I the first user?"
			// cannot be true for two parallel requests (otherwise two admins
			// get bootstrapped on a fresh instance during a race).
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('relaypoint_first_user'))`;
			const userCount = await tx.user.count();

			return tx.user.create({
				data: {
					...user,
					role: userCount === 0 ? Role.ADMIN : Role.USER
				}
			});
		});

		if (newUser.role === Role.ADMIN && newUser.name) {
			await prisma.team
				.create({
					data: {
						name: `${newUser.name}'s Team`,
						users: {
							create: {
								userId: newUser.id
							}
						}
					}
				})
				.catch(() => undefined); // team creation must not block sign-in
		}

		if (newUser.email) {
			const email = newUser.email.toLowerCase();
			const invites = await prisma.teamInvite.findMany({ where: { email } });

			if (invites.length > 0) {
				await prisma.$transaction([
					prisma.usersOnTeams.createMany({
						data: invites.map((invite) => ({ userId: newUser.id, teamId: invite.teamId })),
						skipDuplicates: true
					}),
					prisma.teamInvite.deleteMany({ where: { email } })
				]);
			}
		}

		return newUser as AdapterUser;
	}
};

/**
 * Optional group-based admin promotion: when AUTH_ADMIN_GROUP names an IdP
 * group (e.g. "relaypoint-admins"), users whose ID token carries that group
 * are promoted to ADMIN. Disabled unless the variable is set. Keycloak-style
 * `groups` and `realm_access.roles` claims are both honored.
 */
const ADMIN_GROUP: string | undefined = privateEnv.AUTH_ADMIN_GROUP?.trim() || undefined;

function tokenGroups(account: {
	id_token?: string | null;
	access_token?: string | null;
}): string[] {
	for (const token of [account.id_token, account.access_token]) {
		if (!token) continue;
		const payloadSegment = token.split('.')[1];
		if (!payloadSegment) continue;
		try {
			const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
			const claim = payload.groups ?? payload.realm_access?.roles;
			if (Array.isArray(claim)) return claim.map(String);
			if (typeof claim === 'string') return [claim];
		} catch {
			// Not a JWT (e.g. opaque token) — try the next one.
		}
	}
	return [];
}

// Loaded once per server process; which providers are enabled and how
// they're configured is entirely env-var driven (see authProviders.ts) so a
// deployment can plug in any OAuth/OIDC provider without touching this file.
const providersPromise = buildAuthProviders();

const auth = SvelteKitAuth(async () => ({
	adapter: CustomAdapter,
	trustHost: true,
	providers: await providersPromise,
	session: {
		strategy: 'database'
	},
	callbacks: {
		async session({ session, user }) {
			// Find the account associated with this user in the database.
			const account = await prisma.account.findFirst({
				where: { userId: user.id }
			});

			// Server-side only; see the Session type note above.
			if (account) {
				session.id_token = account.id_token ?? undefined;
			}

			let role = user.role;
			if (ADMIN_GROUP && role !== Role.ADMIN && account) {
				const lower = ADMIN_GROUP.toLowerCase();
				if (tokenGroups(account).some((group) => group.toLowerCase() === lower)) {
					await prisma.user.update({
						where: { id: user.id },
						data: { role: Role.ADMIN }
					});
					role = Role.ADMIN;
				}
			}

			if (session.user) {
				session.user.role = role;
			}

			return session;
		}
	}
}));

export const { signIn, signOut } = auth;

/**
 * Wraps the Auth.js handler to strip the server-side-only `id_token` from the
 * JSON that the browser fetches from `/auth/session`.
 */
export const handle: typeof auth.handle = async (input) => {
	const response = await auth.handle(input);
	if (input.event.url.pathname === '/auth/session' && response.ok) {
		try {
			const body = (await response.clone().json()) as { session?: { id_token?: string } };
			if (body?.session && 'id_token' in body.session) {
				delete body.session.id_token;
				const headers = new Headers(response.headers);
				headers.delete('content-length');
				return new Response(JSON.stringify(body), {
					status: response.status,
					statusText: response.statusText,
					headers
				});
			}
		} catch {
			// Non-JSON or unexpected shape: pass the original response through.
		}
	}
	return response;
};
