import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
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

export const Route = createFileRoute("/api/internal/task-runs/$executionId/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { executionId: string } }) => {
        const token = getCallbackToken(request);
        if (!token) {
          return Response.json({ error: "Missing callback token" }, { status: 401 });
        }

        const runner = getRunner(params.executionId);

        try {
          const ok = await runner.recordHeartbeat(token);
          if (!ok) {
            return Response.json({ error: "Invalid callback token" }, { status: 401 });
          }
          return Response.json({ ok: true });
        } catch {
          return Response.json({ error: "Failed to record heartbeat" }, { status: 500 });
        }
      },
    },
  },
});
