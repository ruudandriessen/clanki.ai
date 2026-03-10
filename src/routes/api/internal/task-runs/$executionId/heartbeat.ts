import { createFileRoute } from "@tanstack/react-router";
import { verifyTaskRunCallback } from "@/server/lib/task-run-callback";

export const Route = createFileRoute("/api/internal/task-runs/$executionId/heartbeat")({
    server: {
        handlers: {
            POST: async ({
                request,
                params,
            }: {
                request: Request;
                params: { executionId: string };
            }) => {
                const callback = verifyTaskRunCallback(request, params.executionId);
                if (!callback) {
                    return Response.json({ error: "Invalid callback token" }, { status: 401 });
                }

                return Response.json({ ok: true });
            },
        },
    },
});
