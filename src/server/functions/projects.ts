import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { withTransaction } from "@/server/db/transaction";
import { toProject } from "@/server/lib/to-project";
import { dbMiddleware } from "../middleware";
import { badRequest, conflict, notFound, parseOptionalId, parseOptionalTimestamp } from "./common";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const rows = await context.db.query.projects.findMany({
      orderBy: (projects, { asc }) => [asc(projects.createdAt)],
    });
    return rows.map(toProject);
  });

export const createProjects = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(
    z.object({
      repos: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string(),
            repoUrl: z.string(),
            createdAt: z.number().optional(),
            updatedAt: z.number().optional(),
          }),
        )
        .min(1),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const created = await withTransaction(context.db, async (tx) => {
      const repoUrls = input.repos.map((repo) => repo.repoUrl);
      const existing = await tx.query.projects.findMany({
        where: inArray(schema.projects.repoUrl, repoUrls),
        columns: { repoUrl: true },
      });
      const existingUrls = new Set(existing.map((project) => project.repoUrl));
      const newRepos = input.repos.filter((repo) => !existingUrls.has(repo.repoUrl));
      if (newRepos.length === 0) {
        return { conflict: true as const };
      }

      const now = Date.now();
      const rows = newRepos.map((repo) => {
        const createdAt = parseOptionalTimestamp(repo.createdAt) ?? now;
        const updatedAt = parseOptionalTimestamp(repo.updatedAt) ?? createdAt;

        return {
          id: parseOptionalId(repo.id) ?? crypto.randomUUID(),
          name: repo.name,
          repoUrl: repo.repoUrl,
          setupCommand: null,
          runCommand: null,
          runPort: null,
          createdAt,
          updatedAt,
        };
      });

      await tx.insert(schema.projects).values(rows);
      return { rows };
    });

    if ("conflict" in created) {
      conflict("All selected repos already have projects");
    }

    return created.rows.map(toProject);
  });

export const updateProjectSetupCommand = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(
    z.object({
      projectId: z.string(),
      setupCommand: z.string().nullable(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const setupCommand =
      typeof input.setupCommand === "string" && input.setupCommand.trim().length > 0
        ? input.setupCommand.trim()
        : null;

    const updated = await withTransaction(context.db, async (tx) => {
      const existing = await tx.query.projects.findFirst({
        where: eq(schema.projects.id, input.projectId),
        columns: { id: true },
      });

      if (!existing) {
        return { notFound: true as const };
      }

      const updatedAt = Date.now();
      await tx
        .update(schema.projects)
        .set({ setupCommand, updatedAt })
        .where(eq(schema.projects.id, input.projectId));

      return tx.query.projects.findFirst({
        where: eq(schema.projects.id, input.projectId),
      });
    });

    if (!updated || "notFound" in updated) {
      notFound("Project not found");
    }

    return toProject(updated);
  });

export const updateProjectRunCommand = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .inputValidator(
    z.object({
      projectId: z.string(),
      runCommand: z.string().nullable(),
      runPort: z.number().int().min(1).max(65535).nullable(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const runCommand =
      typeof input.runCommand === "string" && input.runCommand.trim().length > 0
        ? input.runCommand.trim()
        : null;
    const runPort = input.runPort ?? null;

    if ((runCommand === null) !== (runPort === null)) {
      badRequest("Run command and run port must both be provided");
    }

    const updated = await withTransaction(context.db, async (tx) => {
      const existing = await tx.query.projects.findFirst({
        where: eq(schema.projects.id, input.projectId),
        columns: { id: true },
      });

      if (!existing) {
        return { notFound: true as const };
      }

      const updatedAt = Date.now();
      await tx
        .update(schema.projects)
        .set({ runCommand, runPort, updatedAt })
        .where(eq(schema.projects.id, input.projectId));

      return tx.query.projects.findFirst({
        where: eq(schema.projects.id, input.projectId),
      });
    });

    if (!updated || "notFound" in updated) {
      notFound("Project not found");
    }

    return toProject(updated);
  });
