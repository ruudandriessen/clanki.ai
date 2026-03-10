import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { openTaskEventsSse } from "@/server/lib/durable-streams";
import { requireSession } from "@/server/requireSession";

function isValidStreamOffset(value: string): boolean {
    if (value === "-1" || value === "now") {
        return true;
    }

    if (value.length === 0 || value.length > 512) {
        return false;
    }

    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if ((code >= 0 && code <= 31) || code === 127) {
            return false;
        }
    }

    return true;
}

export const Route = createFileRoute("/api/tasks/$taskId/stream")({
    server: {
        handlers: {
            GET: async ({ request, params }: { request: Request; params: { taskId: string } }) => {
                const session = await requireSession(request);
                const orgId = session.session.activeOrganizationId ?? null;

                if (!orgId) {
                    return Response.json({ error: "No active organization" }, { status: 400 });
                }

                const env = getEnv();
                const db = getDb(env);
                const task = await db.query.tasks.findFirst({
                    where: and(
                        eq(schema.tasks.id, params.taskId),
                        eq(schema.tasks.organizationId, orgId),
                    ),
                    columns: { id: true, streamId: true },
                });

                if (!task) {
                    return Response.json({ error: "Task not found" }, { status: 404 });
                }

                const url = new URL(request.url);
                const offset = url.searchParams.get("offset")?.trim() ?? "-1";
                if (!isValidStreamOffset(offset)) {
                    return Response.json(
                        { error: "offset must be -1, now, or a durable stream offset" },
                        { status: 400 },
                    );
                }

                try {
                    const upstream = await openTaskEventsSse({
                        env,
                        streamId: task.streamId,
                        offset,
                    });

                    if (!upstream.ok || !upstream.body) {
                        const details = (await upstream.text()).trim();
                        const status: number =
                            upstream.status === 404
                                ? 404
                                : upstream.status >= 400 && upstream.status < 500
                                  ? 400
                                  : 502;
                        return Response.json(
                            {
                                error: `Failed to open durable task stream (${upstream.status} ${upstream.statusText})${
                                    details.length > 0 ? `: ${details}` : ""
                                }`,
                            },
                            { status },
                        );
                    }

                    return new Response(upstream.body, {
                        status: 200,
                        headers: {
                            "Content-Type":
                                upstream.headers.get("content-type") ?? "text/event-stream",
                            "Cache-Control": "no-cache, no-transform",
                            Connection: "keep-alive",
                        },
                    });
                } catch (error) {
                    return Response.json(
                        {
                            error:
                                error instanceof Error && error.message.trim().length > 0
                                    ? error.message
                                    : "Failed to connect to durable stream",
                        },
                        { status: 502 },
                    );
                }
            },
        },
    },
});
