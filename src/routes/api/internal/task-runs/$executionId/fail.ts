import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getDb } from "@/server/db/client";
import type { TaskRunner } from "@/server/lib/task-runner";
import { markTaskFailed } from "@/server/lib/task-execution/helpers";

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

export const Route = createFileRoute("/api/internal/task-runs/$executionId/fail")({
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

        let body: { error?: string };
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const errorMessage =
          typeof body.error === "string" && body.error.trim().length > 0
            ? body.error.trim()
            : "Task failed (reported by sandbox)";

        const db = getDb(env);
        await markTaskFailed({ db, taskId: context.taskId, message: errorMessage });
        await runner.clearCallback();

        return Response.json({ ok: true });
      },
    },
  },
});
