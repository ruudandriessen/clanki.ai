import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import * as schema from "./db/schema";
import { ensureDefaultOrganizationForUser } from "./lib/ensure-default-organization";
import { USER_ACCESS_STATUS, isApprovedAccessStatus } from "./lib/user-access";

const PRODUCTION_URL = "https://www.clanki.ai";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function resolveOrigin(request: Request): string {
    const requestOrigin = new URL(request.url).origin;
    const originHeader = request.headers.get("origin");

    let origin: string;
    if (originHeader) {
        try {
            origin = isLocalOrigin(new URL(originHeader).origin)
                ? new URL(originHeader).origin
                : requestOrigin;
        } catch {
            origin = requestOrigin;
        }
    } else {
        origin = requestOrigin;
    }

    const proto = request.headers.get("x-forwarded-proto");
    if (proto) {
        const url = new URL(origin);
        url.protocol = `${proto}:`;
        return url.origin;
    }

    return origin;
}

function isLocalOrigin(origin: string): boolean {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
}

function isCallbackPath(path: string): boolean {
    return path.startsWith("/callback") || path.startsWith("/oauth2/callback");
}

type AuthEnv = {
    DATABASE_URL?: string;
    ENVIRONMENT?: string;
    BETTER_AUTH_SECRET?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
};

export function createAuth(env: AuthEnv, request: Request) {
    if (!env.BETTER_AUTH_SECRET) {
        throw new Error("Missing BETTER_AUTH_SECRET");
    }
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        throw new Error("Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET");
    }

    const origin = resolveOrigin(request);
    const isLocal = isLocalOrigin(origin);
    const githubRedirectURI = isLocal
        ? `${origin}/api/auth/callback/github`
        : `${PRODUCTION_URL}/api/auth/callback/github`;
    const db = getDb(env);

    const auth = betterAuth({
        database: drizzleAdapter(db, {
            provider: "pg",
            schema,
        }),
        secret: env.BETTER_AUTH_SECRET,
        baseURL: origin,
        user: {
            additionalFields: {
                accessStatus: {
                    type: "string",
                    required: false,
                    input: false,
                    returned: false,
                    fieldName: "access_status",
                    defaultValue: USER_ACCESS_STATUS.pending,
                },
            },
        },
        socialProviders: {
            github: {
                clientId: env.GITHUB_CLIENT_ID,
                clientSecret: env.GITHUB_CLIENT_SECRET,
                redirectURI: githubRedirectURI,
            },
        },
        plugins: isLocal
            ? [organization()]
            : [
                  oAuthProxy({
                      productionURL: PRODUCTION_URL,
                  }),
                  organization(),
              ],
        trustedOrigins: [origin, "https://localhost:5173", "https://127.0.0.1:5173"],
        databaseHooks: {
            session: {
                create: {
                    before: async (session, ctx) => {
                        const user = await db.query.user.findFirst({
                            where: eq(schema.user.id, session.userId),
                            columns: {
                                id: true,
                                name: true,
                                email: true,
                                accessStatus: true,
                            },
                        });

                        if (!user) {
                            return;
                        }

                        if (!isApprovedAccessStatus(user.accessStatus)) {
                            if (ctx && isCallbackPath(ctx.path)) {
                                const pendingAccessUrl = new URL(
                                    "/pending-access",
                                    origin,
                                ).toString();
                                throw ctx.redirect(pendingAccessUrl);
                            }

                            throw new APIError("FORBIDDEN", {
                                message: "Your account is pending approval.",
                                code: "USER_PENDING_APPROVAL",
                            });
                        }

                        await ensureDefaultOrganizationForUser({ auth, db, user });

                        if (session.activeOrganizationId) return;
                        const members = await db
                            .select({ organizationId: schema.member.organizationId })
                            .from(schema.member)
                            .where(eq(schema.member.userId, session.userId))
                            .limit(1);
                        if (members.length > 0) {
                            return {
                                data: {
                                    ...session,
                                    activeOrganizationId: members[0].organizationId,
                                },
                            };
                        }
                    },
                },
            },
            user: {
                create: {
                    after: async (user) => {
                        const createdUser = await db.query.user.findFirst({
                            where: eq(schema.user.id, user.id),
                            columns: {
                                id: true,
                                name: true,
                                email: true,
                                accessStatus: true,
                            },
                        });

                        if (!createdUser || !isApprovedAccessStatus(createdUser.accessStatus)) {
                            return;
                        }

                        await ensureDefaultOrganizationForUser({ auth, db, user: createdUser });
                    },
                },
            },
        },
    });

    return auth;
}
