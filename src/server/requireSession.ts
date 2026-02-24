import { createAuth } from "./auth";
import { getEnv } from "./env";
import { SessionContext } from "./middleware";

/**
 * Standalone session helper for API routes (not server functions).
 * Returns the session context or throws a 401 Response.
 */
export async function requireSession(request: Request): Promise<SessionContext> {
  const env = getEnv();
  const auth = createAuth(env, request);
  const result = await auth.api.getSession({ headers: request.headers });

  if (!result) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return {
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
}
