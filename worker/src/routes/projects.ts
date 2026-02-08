import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import * as schema from "../db/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

type Env = {
  Variables: {
    db: DrizzleD1Database<typeof schema>;
  };
};

const projects = new Hono<Env>();

// GET /api/projects — list all projects
projects.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db.query.projects.findMany({
    orderBy: desc(schema.projects.createdAt),
  });
  return c.json(rows);
});

// GET /api/projects/:projectId — single project
projects.get("/:projectId", async (c) => {
  const db = c.get("db");
  const { projectId } = c.req.param();

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json(project);
});

export { projects };
