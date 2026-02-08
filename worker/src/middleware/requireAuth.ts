import type { Context, Next } from "hono";
import { createAuth } from "../auth";

type Env = {
  Bindings: {
    DB: D1Database;
    BETTER_AUTH_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
  };
};

export async function requireAuth(c: Context<Env>, next: Next) {
  const auth = createAuth(c.env, c.req.raw);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
}
