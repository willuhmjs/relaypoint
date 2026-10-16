/**
 * Server-side support for the optional "local" email/password accounts.
 *
 * Local accounts are ordinary User rows with a linked Account row of
 * `provider = "credentials"` whose `refresh_token` column stores the bcrypt
 * password hash. We deliberately do NOT add an Auth.js Credentials provider
 * (it is incompatible with the database session strategy this app uses):
 * signing in locally just creates a Session row plus the same session cookie
 * Auth.js would have issued, so `locals.auth()`, the /dash authorization
 * hook, and sign-out (which deletes the Session row) all keep working
 * unchanged.
 */
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { dev } from '$app/environment';
import { env as privateEnv } from '$env/dynamic/private';
import { prisma } from './prisma/prismaConnection';
import { hasAnyConfiguredProvider } from './authProviders';
import { Role, type User } from '@prisma/client';

const SALT_ROUNDS = 12;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Provider id used on Account rows backing local email/password accounts. */
export const LOCAL_CREDENTIALS_PROVIDER = 'credentials';

/**
 * Explicitly enable/disable with AUTH_LOCAL_ENABLED=true|false. When unset,
 * local accounts turn themselves on only when no OAuth/OIDC provider is
 * configured, so a self-hoster with no IdP can actually get in on first
 * boot, while SSO deployments don't grow a second, weaker front door.
 */
export function isLocalAuthEnabled(): boolean {
	const flag = privateEnv.AUTH_LOCAL_ENABLED;
	if (flag === 'true') return true;
	if (flag === 'false') return false;
	return !hasAnyConfiguredProvider();
}

/**
 * Whether anyone may create a local account via the login page. The very
 * first local account is always allowed (self-hosters claim the instance on
 * first boot, mirroring how CustomAdapter promotes the first OAuth user to
 * ADMIN); afterwards sign-up requires AUTH_LOCAL_ALLOW_SIGNUP="true".
 */
export async function localSignUpAllowed(): Promise<boolean> {
	if (privateEnv.AUTH_LOCAL_ALLOW_SIGNUP === 'true') return true;
	const localAccounts = await prisma.account.count({
		where: { provider: LOCAL_CREDENTIALS_PROVIDER }
	});
	return localAccounts === 0;
}

export async function createLocalUser(input: {
	name: string;
	email: string;
	password: string;
}): Promise<User> {
	const email = input.email.toLowerCase();

	const user = await prisma.$transaction(async (tx) => {
		// Serialize with OAuth sign-ups and each other so the "first user
		// becomes ADMIN" decision cannot be made twice in parallel.
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('relaypoint_first_user'))`;

		const existing = await tx.user.findUnique({ where: { email } });
		if (existing) {
			throw new Error('An account with this email already exists.');
		}

		const isFirstUser = (await tx.user.count()) === 0;
		return tx.user.create({
			data: {
				name: input.name,
				email,
				role: isFirstUser ? Role.ADMIN : Role.USER,
				accounts: {
					create: {
						type: LOCAL_CREDENTIALS_PROVIDER,
						provider: LOCAL_CREDENTIALS_PROVIDER,
						providerAccountId: email,
						refresh_token: await bcrypt.hash(input.password, SALT_ROUNDS)
					}
				}
			}
		});
	});

	if (user.role === Role.ADMIN && user.name) {
		await prisma.team
			.create({
				data: {
					name: `${user.name}'s Team`,
					users: { create: { userId: user.id } }
				}
			})
			.catch(() => undefined);
	}

	// Redeem pending team invites, mirroring CustomAdapter.createUser for OAuth users.
	const invites = await prisma.teamInvite.findMany({ where: { email } });
	if (invites.length > 0) {
		await prisma.$transaction([
			prisma.usersOnTeams.createMany({
				data: invites.map((invite) => ({ userId: user.id, teamId: invite.teamId })),
				skipDuplicates: true
			}),
			prisma.teamInvite.deleteMany({ where: { email } })
		]);
	}

	return user;
}

export async function verifyLocalCredentials(
	email: string,
	password: string
): Promise<User | null> {
	const user = await prisma.user.findUnique({
		where: { email: email.toLowerCase() },
		include: { accounts: { where: { provider: LOCAL_CREDENTIALS_PROVIDER } } }
	});
	const account = user?.accounts[0];
	if (!user || !account?.refresh_token) return null;
	const ok = await bcrypt.compare(password, account.refresh_token);
	return ok ? user : null;
}

export interface LocalSession {
	cookieName: string;
	token: string;
	expires: Date;
	secure: boolean;
}

export async function createLocalSession(userId: string, requestUrl: URL): Promise<LocalSession> {
	const token = randomBytes(32).toString('hex');
	const expires = new Date(Date.now() + SESSION_DURATION_MS);
	await prisma.session.create({ data: { sessionToken: token, userId, expires } });
	// Mirrors Auth.js's cookie naming: __Secure-prefixed when cookies are
	// secure (https in production), plain otherwise.
	const secure = requestUrl.protocol === 'https:' && !dev;
	return {
		cookieName: `${secure ? '__Secure-' : ''}authjs.session-token`,
		token,
		expires,
		secure
	};
}
