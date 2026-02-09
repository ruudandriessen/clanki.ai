import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";

const PRODUCTION_URL = "https://clanki.ai";

type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
};

export function createAuth(env: AuthEnv, request: Request) {
  const origin = new URL(request.url).origin;
  const db = drizzle(env.DB, { schema });
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        redirectURI: `${PRODUCTION_URL}/api/auth/callback/github`,
      },
    },
    plugins: [
      oAuthProxy({
        productionURL: PRODUCTION_URL,
      }),
      organization(),
    ],
    trustedOrigins: [origin, "http://localhost:5173"],
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (session.activeOrganizationId) return;
            const members = await db
              .select({ organizationId: schema.member.organizationId })
              .from(schema.member)
              .where(eq(schema.member.userId, session.userId))
              .limit(1);
            if (members.length > 0) {
              return {
                data: { ...session, activeOrganizationId: members[0].organizationId },
              };
            }
          },
        },
      },
      user: {
        create: {
          after: async (user) => {
            // Check if this user has any pending invitations.
            // If they do, they signed up via an invite link and should
            // join the existing org instead of getting a new one.
            const pending = await db
              .select({ id: schema.invitation.id })
              .from(schema.invitation)
              .where(
                and(
                  eq(schema.invitation.email, user.email),
                  eq(schema.invitation.status, "pending"),
                ),
              )
              .limit(1);

            if (pending.length > 0) {
              return;
            }

            const slug = user.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "");
            const uniqueSlug = `${slug}-${user.id.slice(0, 8)}`;

            await auth.api.createOrganization({
              body: {
                name: `${user.name}'s Organization`,
                slug: uniqueSlug,
                userId: user.id,
              },
            });
          },
        },
      },
    },
  });
  return auth;
}
