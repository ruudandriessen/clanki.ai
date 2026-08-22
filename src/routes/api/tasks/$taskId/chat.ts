import { createFileRoute } from "@tanstack/react-router";
import { resumeServerSentEventsResponse } from "@tanstack/ai";
import { reconstructChat } from "@tanstack/ai-persistence";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { taskChatPersistence } from "@/server/lib/ai-persistence";
import { runTaskChat } from "@/server/lib/run-task-chat";
import { taskChatDurability } from "@/server/lib/task-chat-durability";

export const Route = createFileRoute("/api/tasks/$taskId/chat")({
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

        const url = new URL(request.url);
        const runId = url.searchParams.get("runId");
        const offset = url.searchParams.get("offset");

        if (runId && offset !== null) {
          return resumeServerSentEventsResponse({
            adapter: taskChatDurability(request),
          });
        }

        url.searchParams.set("threadId", params.taskId);
        return reconstructChat(taskChatPersistence, new Request(url, request));
      },
      POST: async ({ request, params }: { request: Request; params: { taskId: string } }) => {
        return await runTaskChat({ request, taskId: params.taskId });
      },
    },
  },
});
