import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getDb } from "@/server/db/client";
import type { TaskRunner } from "@/server/lib/task-runner";
import { insertAssistantTaskMessage } from "@/server/lib/task-execution/helpers";

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

export const Route = createFileRoute("/api/internal/task-runs/$executionId/message")({
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

        let body: { content?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
          return Response.json({ error: "content is required" }, { status: 400 });
        }

        const db = getDb(env);
        const taskMessageId = await insertAssistantTaskMessage({
          db,
          organizationId: context.organizationId,
          taskId: context.taskId,
          content: body.content.trim(),
        });

        return Response.json({ id: taskMessageId }, { status: 201 });
      },
    },
  },
});
