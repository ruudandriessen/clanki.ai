import type { Context, Next } from "hono";
import { createAuth } from "../auth";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    BETTER_AUTH_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  };
  Variables: {
    session: {
      session: { userId: string };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

export async function requireAuth(c: Context<Env>, next: Next) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("session", session);
  await next();
}
