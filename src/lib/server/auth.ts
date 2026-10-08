// src/auth.ts
import { SvelteKitAuth } from "@auth/sveltekit"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { Role } from "@prisma/client"
import { prisma } from "./prisma/prismaConnection"
import { buildAuthProviders } from "./authProviders"
import type { Adapter, AdapterUser } from "@auth/core/adapters"



declare module '@auth/core/types' {
	interface Session {
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
        groups?: string[]
    }
}

const CustomAdapter: Adapter = {
    ...PrismaAdapter(prisma),
    createUser: async (user) => {
        const userCount = await prisma.user.count();

        const newUser = await prisma.user.create({
            data: {
                ...user,
                role: userCount === 0 ? Role.ADMIN : Role.USER,
            }
        });

        if (userCount === 0 && newUser.name) {
            await prisma.team.create({
                data: {
                    name: `${newUser.name}'s Team`,
                    users: {
                        create: {
                            userId: newUser.id
                        }
                    }
                }
            });
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

// Loaded once per server process; which providers are enabled and how
// they're configured is entirely env-var driven (see authProviders.ts) so a
// deployment can plug in any Auth.js-supported OAuth/OIDC provider without
// touching this file.
const providersPromise = buildAuthProviders();

export const { handle, signIn, signOut } = SvelteKitAuth(async () => ({
    adapter: CustomAdapter,
    trustHost: true,
    providers: await providersPromise,
    session: {
        strategy: "database",
    },
	callbacks: {
		async session({ session, user }) {
			// Find the account associated with this user in the database.
			const account = await prisma.account.findFirst({
				where: { userId: user.id }
			});

			// If the account is found, add the id_token to the session object.
			if (account) {
				session.id_token = account.id_token ?? undefined;
			}

			if (session.user) {
				session.user.role = user.role;
			}

            if (session.user.groups?.includes("syskids")) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        role: Role.ADMIN
                    }
                })
            }

			return session;
		}
	}
}));
