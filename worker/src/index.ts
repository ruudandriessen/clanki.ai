import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

app.get("/api/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;
