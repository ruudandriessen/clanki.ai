import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Sandbox } from "@cloudflare/sandbox";
import type { AppDb } from "./db/client";
import { getDb } from "./db/client";
import { createAuth } from "./auth";
import { handleAnalysisResults } from "./api/snapshot-results";
import { requireAuth } from "./middleware/requireAuth";
import { installations } from "./routes/installations";
import { electric } from "./routes/electric";
import { projects } from "./routes/projects";
import { settings } from "./routes/settings";
import { snapshots } from "./routes/snapshots";
import { tasks } from "./routes/tasks";
import { handleGitHubWebhook } from "./webhook/github";

type Bindings = {
  ASSETS: Fetcher;
  DATABASE_URL: string;
  ELECTRIC_URL: string;
  ELECTRIC_SOURCE_ID?: string;
  ELECTRIC_SOURCE_SECRET?: string;
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_WEBHOOK_SECRET: string;
  CREDENTIALS_ENCRYPTION_KEY: string;
  Sandbox: DurableObjectNamespace<Sandbox>;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
};

type Variables = {
  db: AppDb;
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

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/api/analysis/results", (c) => handleAnalysisResults(c));

// Auth guard for data API routes
app.use("/api/installations/*", requireAuth);
app.use("/api/projects/*", requireAuth);
app.use("/api/tasks/*", requireAuth);
app.use("/api/tasks", requireAuth);
app.use("/api/settings/*", requireAuth);
app.use("/api/electric/*", requireAuth);

// Data API routes
app.route("/api/installations", installations);
app.route("/api/projects", projects);
app.route("/api/projects/:projectId/snapshots", snapshots);
app.route("/api/tasks", tasks);
app.route("/api/settings", settings);
app.route("/api/electric", electric);

app.post("/webhook", (c) => handleGitHubWebhook(c));

// SPA fallback — serve index.html for all non-API routes
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(new URL("/index.html", c.req.url));
});

export { Sandbox } from "@cloudflare/sandbox";

export default {
  fetch: app.fetch,
};
