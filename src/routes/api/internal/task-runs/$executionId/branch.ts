import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import type { TaskRunner } from "@/server/lib/task-runner";

function getCallbackToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  const token = parts[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function getRunner(executionId: string): DurableObjectStub<TaskRunner> {
  const id = env.TaskRunner.idFromName(executionId);
  return env.TaskRunner.get(id);
}

export const Route = createFileRoute("/api/internal/task-runs/$executionId/branch")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { executionId: string } }) => {
        const token = getCallbackToken(request);
        if (!token) {
          return Response.json({ error: "Missing callback token" }, { status: 401 });
        }

        const runner = getRunner(params.executionId);
        const context = await runner.verifyToken(token);
        if (!context) {
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

        const db = getDb(env);
        await db
          .update(schema.tasks)
          .set({ branch, updatedAt: Date.now() })
          .where(
            and(
              eq(schema.tasks.id, context.taskId),
              eq(schema.tasks.organizationId, context.organizationId),
            ),
          );

        return Response.json({ ok: true });
      },
    },
  },
});
