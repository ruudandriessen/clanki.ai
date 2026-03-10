import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createAuth } from "./auth";
import { getDb } from "./db/client";
import { getEnv } from "./env";
import { toSessionErrorResponse } from "./session-error-response";

export type SessionContext = {
    session: { userId: string; activeOrganizationId?: string | null };
    user: { id: string; name: string; email: string; image?: string | null };
};

export const authMiddleware = createMiddleware().server(async ({ next }) => {
    const request = getRequest();
    const env = getEnv();
    const auth = createAuth(env, request);
    let result: Awaited<ReturnType<typeof auth.api.getSession>>;
    try {
        result = await auth.api.getSession({ headers: request.headers });
    } catch (error) {
        throw toSessionErrorResponse(error);
    }

    if (!result) {
        throw new Response("Unauthorized", { status: 401 });
    }

    const session: SessionContext = {
        session: {
            userId: result.session.userId,
            activeOrganizationId: result.session.activeOrganizationId,
        },
        user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            image: result.user.image,
        },
    };

    const requestOrigin = new URL(request.url).origin;
    return next({ context: { session, db: getDb(env), env, requestOrigin } });
});
