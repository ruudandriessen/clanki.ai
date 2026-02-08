import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { cors } from "hono/cors";
import * as schema from "./db/schema";
import { createAuth } from "./auth";
import type { QueueMessage } from "./queue/message";
import { processQueueMessage } from "./queue/processMessage";
import { handleGitHubWebhook } from "./webhook/github";
import { handleAnalysisResults } from "./api/snapshot-results";

type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_WEBHOOK_SECRET: string;
  github_webhooks: Queue;
};

type Variables = {
  db: DrizzleD1Database<typeof schema>;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});

app.use("/webhook", async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env, c.req.raw);
  return auth.handler(c.req.raw);
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/api/analysis/results", (c) => handleAnalysisResults(c));

app.post("/webhook", (c) => handleGitHubWebhook(c));

// SPA fallback — serve index.html for all non-API routes
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(new URL("/index.html", c.req.url));
});

export default {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Bindings,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const db = drizzle(env.DB, { schema });
    for (const message of batch.messages) {
      try {
        await processQueueMessage(message.body, db);
        message.ack();
      } catch (error) {
        console.error("Failed to process queue message:", error);
        message.retry();
      }
    }
  },
};
