import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { Hono } from "hono";
import { cors } from "hono/cors";
import * as schema from "./db/schema";
import { createAuth } from "./auth";

type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
};

type Variables = {
  db: DrizzleD1Database<typeof schema>;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use(
  "/api/auth/*",
  cors({
    origin: "http://localhost:5173",
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

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

// SPA fallback — serve index.html for all non-API routes
app.get("*", async (c) => {
  return c.env.ASSETS.fetch(new URL("/index.html", c.req.url));
});

export default app;
