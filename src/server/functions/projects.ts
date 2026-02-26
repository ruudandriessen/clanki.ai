import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { withTransaction } from "@/server/db/transaction";
import { authMiddleware } from "../middleware";
import {
  badRequest,
  conflict,
  getOrgId,
  notFound,
  parseOptionalId,
  parseOptionalTimestamp,
} from "./common";

export const createProjects = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      repos: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string(),
            repoUrl: z.string(),
            installationId: z.number(),
            createdAt: z.number().optional(),
            updatedAt: z.number().optional(),
          }),
        )
        .min(1),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const result = await withTransaction(db, async (tx, txid) => {
      const repoUrls = input.repos.map((repo) => repo.repoUrl);
      const existing = await tx.query.projects.findMany({
        where: and(
          eq(schema.projects.organizationId, orgId),
          inArray(schema.projects.repoUrl, repoUrls),
        ),
        columns: { repoUrl: true },
      });
      const existingUrls = new Set(existing.map((project) => project.repoUrl));

      const newRepos = input.repos.filter((repo) => !existingUrls.has(repo.repoUrl));
      if (newRepos.length === 0) {
        return { conflict: true as const };
      }

      const now = Date.now();
      const created = newRepos.map((repo) => {
        const createdAt = parseOptionalTimestamp(repo.createdAt) ?? now;
        const updatedAt = parseOptionalTimestamp(repo.updatedAt) ?? createdAt;

        return {
          id: parseOptionalId(repo.id) ?? crypto.randomUUID(),
          organizationId: orgId,
          name: repo.name,
          repoUrl: repo.repoUrl,
          installationId: repo.installationId,
          setupCommand: null,
          runCommand: null,
          runPort: null,
          createdAt,
          updatedAt,
        };
      });

      await tx.insert(schema.projects).values(created);
      return { data: created, txid };
    });

    if ("conflict" in result) {
      conflict("All selected repos already have projects");
    }

    return result;
  });

export const updateProjectSetupCommand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      projectId: z.string(),
      setupCommand: z.string().nullable(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const setupCommand =
      typeof input.setupCommand === "string" && input.setupCommand.trim().length > 0
        ? input.setupCommand.trim()
        : null;

    const result = await withTransaction(db, async (tx, txid) => {
      const existing = await tx.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, orgId),
        ),
        columns: { id: true },
      });

      if (!existing) {
        return { notFound: true as const };
      }

      const updatedAt = Date.now();
      await tx
        .update(schema.projects)
        .set({ setupCommand, updatedAt })
        .where(
          and(eq(schema.projects.id, input.projectId), eq(schema.projects.organizationId, orgId)),
        );

      const updated = await tx.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, orgId),
        ),
      });

      if (!updated) {
        return { notFound: true as const };
      }

      return { data: updated, txid };
    });

    if ("notFound" in result) {
      notFound("Project not found");
    }

    return result;
  });

export const updateProjectRunCommand = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      projectId: z.string(),
      runCommand: z.string().nullable(),
      runPort: z.number().int().min(1).max(65535).nullable(),
    }),
  )
  .handler(async ({ data: input, context }) => {
    const db = context.db;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const runCommand =
      typeof input.runCommand === "string" && input.runCommand.trim().length > 0
        ? input.runCommand.trim()
        : null;
    const runPort = input.runPort ?? null;

    if ((runCommand === null) !== (runPort === null)) {
      badRequest("Run command and run port must both be provided");
    }

    const result = await withTransaction(db, async (tx, txid) => {
      const existing = await tx.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, orgId),
        ),
        columns: { id: true },
      });

      if (!existing) {
        return { notFound: true as const };
      }

      const updatedAt = Date.now();
      await tx
        .update(schema.projects)
        .set({ runCommand, runPort, updatedAt })
        .where(
          and(eq(schema.projects.id, input.projectId), eq(schema.projects.organizationId, orgId)),
        );

      const updated = await tx.query.projects.findFirst({
        where: and(
          eq(schema.projects.id, input.projectId),
          eq(schema.projects.organizationId, orgId),
        ),
      });

      if (!updated) {
        return { notFound: true as const };
      }

      return { data: updated, txid };
    });

    if ("notFound" in result) {
      notFound("Project not found");
    }

    return result;
  });
