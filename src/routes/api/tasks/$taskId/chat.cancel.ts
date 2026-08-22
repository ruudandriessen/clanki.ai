import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { cancelTaskChatRun } from "@/server/lib/task-chat";

export const Route = createFileRoute("/api/tasks/$taskId/chat/cancel")({
  server: {
    handlers: {
      POST: async ({ params }: { params: { taskId: string } }) => {
        const db = await getDb();
        const task = await db.query.tasks.findFirst({
          where: eq(schema.tasks.id, params.taskId),
          columns: { id: true },
        });

        if (!task) {
          return Response.json({ error: "Task not found" }, { status: 404 });
        }

        return cancelTaskChatRun(params.taskId);
      },
    },
  },
});
