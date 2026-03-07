import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { verifyTaskRunCallback } from "@/server/lib/task-run-callback";
import { markTaskFailed } from "@/server/lib/task-execution/helpers";

export const Route = createFileRoute("/api/internal/task-runs/$executionId/fail")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { executionId: string } }) => {
        const callback = verifyTaskRunCallback(request, params.executionId);
        if (!callback) {
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
            : "Task failed (reported by runner)";

        const db = getDb(getEnv());
        await markTaskFailed({ db, taskId: callback.taskId, message: errorMessage });

        return Response.json({ ok: true });
      },
    },
  },
});
