import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/server/db/client";
import { verifyTaskRunCallback } from "@/server/lib/task-run-callback";
import { completeTask, insertAssistantTaskMessage } from "@/server/lib/task-execution/helpers";

export const Route = createFileRoute("/api/internal/task-runs/$executionId/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { executionId: string } }) => {
        const callback = verifyTaskRunCallback(request, params.executionId);
        if (!callback) {
          return Response.json({ error: "Invalid callback token" }, { status: 401 });
        }

        let body: { assistantOutput?: string };
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const db = await getDb();

        if (
          body.assistantOutput &&
          typeof body.assistantOutput === "string" &&
          body.assistantOutput.trim().length > 0
        ) {
          try {
            await insertAssistantTaskMessage({
              db,
              taskId: callback.taskId,
              content: body.assistantOutput.trim(),
            });
          } catch (error) {
            console.warn("Failed to persist assistant output on complete callback", {
              executionId: params.executionId,
              taskId: callback.taskId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        await completeTask({ db, taskId: callback.taskId });
        return Response.json({ ok: true });
      },
    },
  },
});
