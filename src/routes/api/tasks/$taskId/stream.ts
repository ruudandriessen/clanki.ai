import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { listTaskEvents, subscribeTaskEvents } from "@/server/lib/task-events";
import type { TaskStreamEvent } from "@/shared/task-stream-events";

export const Route = createFileRoute("/api/tasks/$taskId/stream")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { taskId: string } }) => {
        const db = await getDb();
        const task = await db.query.tasks.findFirst({
          where: eq(schema.tasks.id, params.taskId),
          columns: { id: true },
        });

        if (!task) {
          return Response.json({ error: "Task not found" }, { status: 404 });
        }

        const lastEventId = request.headers.get("last-event-id")?.trim() ?? "";
        const backlog = await listTaskEvents(db, params.taskId);
        const startIndex = lastEventId
          ? backlog.findIndex((event) => event.id === lastEventId) + 1
          : 0;
        const pendingEvents = startIndex > 0 ? backlog.slice(startIndex) : backlog;

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const send = (event: TaskStreamEvent) => {
              controller.enqueue(
                encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`),
              );
            };

            for (const event of pendingEvents) {
              send(event);
            }

            const unsubscribe = subscribeTaskEvents(params.taskId, send);
            const abort = () => {
              unsubscribe();
              controller.close();
            };

            request.signal.addEventListener("abort", abort, { once: true });
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
