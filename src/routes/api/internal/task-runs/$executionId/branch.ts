import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { verifyTaskRunCallback } from "@/server/lib/task-run-callback";

export const Route = createFileRoute("/api/internal/task-runs/$executionId/branch")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { executionId: string } }) => {
        const callback = verifyTaskRunCallback(request, params.executionId);
        if (!callback) {
          return Response.json({ error: "Invalid callback token" }, { status: 401 });
        }

        let body: { branch?: string | null };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        let branch: string | null = null;
        if (body.branch !== null && body.branch !== undefined) {
          if (typeof body.branch !== "string") {
            return Response.json({ error: "branch must be a string or null" }, { status: 400 });
          }

          const normalizedBranch = body.branch.trim();
          if (normalizedBranch.length > 255) {
            return Response.json(
              { error: "branch must be at most 255 characters" },
              { status: 400 },
            );
          }

          branch = normalizedBranch.length > 0 ? normalizedBranch : null;
        }

        const db = getDb(getEnv());
        await db
          .update(schema.tasks)
          .set({ branch, updatedAt: Date.now() })
          .where(
            and(
              eq(schema.tasks.id, callback.taskId),
              eq(schema.tasks.organizationId, callback.organizationId),
            ),
          );

        return Response.json({ ok: true });
      },
    },
  },
});
