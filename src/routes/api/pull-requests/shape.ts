import { createFileRoute } from "@tanstack/react-router";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import * as schema from "@/server/db/schema";
import { clauseToString } from "@/server/lib/clause-to-string";
import { electricFn } from "@/server/lib/electric";
import { requireSession } from "@/server/requireSession";

export const Route = createFileRoute("/api/pull-requests/shape")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const session = await requireSession(request);
        const orgId = session.session.activeOrganizationId ?? null;

        if (!orgId) {
          return Response.json({ error: "No active organization" }, { status: 400 });
        }

        const env = getEnv();
        const db = getDb(env);
        const orgProjects = await db.query.projects.findMany({
          where: eq(schema.projects.organizationId, orgId),
          columns: { installationId: true },
        });
        const installationIds = [
          ...new Set(
            orgProjects
              .map((project) => project.installationId)
              .filter((id): id is number => id !== null),
          ),
        ];

        if (installationIds.length === 0) {
          return electricFn({
            request,
            table: "pull_requests",
            where: "1 = 0",
          });
        }

        const whereClause =
          installationIds.length === 1
            ? clauseToString(eq(schema.pullRequests.installationId, installationIds[0]))
            : clauseToString(inArray(schema.pullRequests.installationId, installationIds));

        return electricFn({
          request,
          table: "pull_requests",
          where: whereClause,
        });
      },
    },
  },
});
