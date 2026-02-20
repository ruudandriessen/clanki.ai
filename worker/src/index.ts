import { Hono } from "hono";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import type { Sandbox } from "@cloudflare/sandbox";
import type { AppDb } from "./db/client";
import { getDb } from "./db/client";
import { createAuth } from "./auth";
import { requireAuth } from "./middleware/requireAuth";
import { orpcRouter } from "./orpc/router";
import { projects } from "./routes/projects";
import { tasks } from "./routes/tasks";
import { handleGitHubWebhook } from "./webhook/github";
import type { TaskRunner } from "./lib/task-runner";
import { internalTasks } from "./routes/internal-tasks";

type Bindings = {
  ASSETS: Fetcher;
  HYPERDRIVE: Hyperdrive;
  DATABASE_URL?: string;
  ENVIRONMENT?: string;
  ELECTRIC_SOURCE_ID?: string;
  ELECTRIC_SECRET: string;
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_WEBHOOK_SECRET: string;
  CREDENTIALS_ENCRYPTION_KEY: string;
  DURABLE_STREAMS_SERVICE_ID?: string;
  DURABLE_STREAMS_SECRET?: string;
  WORKER_CALLBACK_ORIGIN?: string;
  Sandbox: DurableObjectNamespace<Sandbox>;
  TaskRunner: DurableObjectNamespace<TaskRunner>;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
};

type Variables = {
  db: AppDb;
  session: {
    session: { userId: string; activeOrganizationId?: string | null };
    user: { id: string; name: string; email: string; image?: string | null };
  };
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const rpcHandler = new RPCHandler(orpcRouter);

app.use(
  "/api/auth/*",
  cors({
    origin: (origin) => origin,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
    maxAge: 600,
  }),
);

app.use("/*", cors());

app.use("/api/*", async (c, next) => {
  c.set("db", getDb(c.env));
  await next();
});

app.use("/webhook", async (c, next) => {
  c.set("db", getDb(c.env));
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.req.raw);
  return auth.handler(c.req.raw);
});

// Auth guard for data API routes
app.use("/api/projects/*", requireAuth);
app.use("/api/tasks/*", requireAuth);
app.use("/api/rpc/*", requireAuth);

// Internal callback routes (token-based auth, not session auth)
app.route("/api/internal", internalTasks);

// Data API routes
app.route("/api/projects", projects);
app.route("/api/tasks", tasks);
app.all("/api/rpc/*", async (c) => {
  const result = await rpcHandler.handle(c.req.raw, {
    prefix: "/api/rpc",
    context: {
      db: c.get("db"),
      env: c.env,
      session: c.get("session"),
      executionCtx: c.executionCtx,
      requestOrigin: new URL(c.req.url).origin,
    },
  });

  if (!result.matched) {
    return c.notFound();
  }

  return result.response;
});

app.post("/webhook", (c) => handleGitHubWebhook(c));

// SPA fallback — serve index.html for all non-API routes
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(new URL("/index.html", c.req.url));
});

export { Sandbox } from "@cloudflare/sandbox";
export { TaskRunner } from "./lib/task-runner";

export default {
  fetch: app.fetch,
};
