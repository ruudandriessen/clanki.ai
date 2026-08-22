import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { appendTaskEvent } from "@/server/lib/task-events";
import { verifyTaskRunCallback } from "@/server/lib/task-run-callback";
import type { TaskStreamEvent } from "@/shared/task-stream-events";

export const Route = createFileRoute("/api/internal/task-runs/$executionId/event")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { executionId: string } }) => {
        const callback = verifyTaskRunCallback(request, params.executionId);
        if (!callback) {
          return Response.json({ error: "Invalid callback token" }, { status: 401 });
        }

        let body: { event?: OpenCodeEvent };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (!body.event || typeof body.event.type !== "string") {
          return Response.json({ error: "event is required" }, { status: 400 });
        }

        const db = await getDb();
        const task = await db.query.tasks.findFirst({
          where: eq(schema.tasks.id, callback.taskId),
          columns: { id: true },
        });

        if (!task) {
          return Response.json({ error: "Task not found" }, { status: 404 });
        }

        const streamEvent: TaskStreamEvent = {
          id: crypto.randomUUID(),
          taskId: task.id,
          runId: params.executionId,
          createdAt: Date.now(),
          kind: `opencode.${body.event.type}`,
          payload: JSON.stringify(body.event),
        };

        await appendTaskEvent(db, streamEvent);
        return Response.json({ ok: true });
      },
    },
  },
});
