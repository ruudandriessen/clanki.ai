import { and, eq, inArray } from "drizzle-orm";
import { withTransaction } from "../../db/transaction";
import * as schema from "../../db/schema";
import { getOrgId, parseOptionalId, parseOptionalTimestamp } from "./common";
import { badRequest, conflict, notFound } from "./errors";
import { os } from "./context";

export const projectsRouter = {
  create: os.projects.create.handler(async ({ input, context }) => {
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
  }),
  updateSetupCommand: os.projects.updateSetupCommand.handler(async ({ input, context }) => {
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
  }),
};
