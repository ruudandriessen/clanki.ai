import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { insertAssistantTaskMessage } from "@/server/lib/task-execution/helpers";
import { verifyTaskRunCallback } from "@/server/lib/task-run-callback";

export const Route = createFileRoute("/api/internal/task-runs/$executionId/message")({
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

                let body: { content?: string };
                try {
                    body = await request.json();
                } catch {
                    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
                }

                if (
                    !body.content ||
                    typeof body.content !== "string" ||
                    body.content.trim().length === 0
                ) {
                    return Response.json({ error: "content is required" }, { status: 400 });
                }

                const db = getDb(getEnv());
                const taskMessageId = await insertAssistantTaskMessage({
                    db,
                    organizationId: callback.organizationId,
                    taskId: callback.taskId,
                    content: body.content.trim(),
                });

                return Response.json({ id: taskMessageId }, { status: 201 });
            },
        },
    },
});
