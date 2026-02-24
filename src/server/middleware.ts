import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createAuth } from "./auth";
import { getDb } from "./db/client";

export type SessionContext = {
  session: { userId: string; activeOrganizationId?: string | null };
  user: { id: string; name: string; email: string; image?: string | null };
};

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  // TODO properly type env
  const auth = createAuth(env as any, request);
  const result = await auth.api.getSession({ headers: request.headers });

  if (!result) {
    throw new Error("Unauthorized");
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
  // TODO properly type env
  return next({ context: { session, db: getDb(env as any), env, requestOrigin } });
});
