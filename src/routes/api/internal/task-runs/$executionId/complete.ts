import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { isSupportedOpencodeProvider, type SupportedOpencodeProvider } from "@/server/lib/opencode";
import { upsertProviderAuthCredential } from "@/server/lib/provider-credentials";
import { completeTask, insertAssistantTaskMessage } from "@/server/lib/task-execution/helpers";
import { verifyTaskRunCallback } from "@/server/lib/task-run-callback";

export const Route = createFileRoute("/api/internal/task-runs/$executionId/complete")({
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

                let body: {
                    assistantOutput?: string;
                    refreshedAuth?: { provider?: string; auth?: unknown };
                };
                try {
                    body = await request.json();
                } catch {
                    body = {};
                }

                const env = getEnv();
                const db = getDb(env);

                if (
                    body.assistantOutput &&
                    typeof body.assistantOutput === "string" &&
                    body.assistantOutput.trim().length > 0
                ) {
                    try {
                        await insertAssistantTaskMessage({
                            db,
                            organizationId: callback.organizationId,
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

                if (body.refreshedAuth?.provider && body.refreshedAuth.auth) {
                    const provider = String(body.refreshedAuth.provider);
                    if (isSupportedOpencodeProvider(provider)) {
                        try {
                            await upsertProviderAuthCredential(
                                db,
                                env,
                                callback.userId,
                                provider as SupportedOpencodeProvider,
                                body.refreshedAuth.auth as Parameters<
                                    typeof upsertProviderAuthCredential
                                >[4],
                            );
                        } catch {}
                    }
                }

                await completeTask({ db, taskId: callback.taskId });

                return Response.json({ ok: true });
            },
        },
    },
});
