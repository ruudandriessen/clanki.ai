import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getDb } from "@/server/db/client";
import type { TaskRunner } from "@/server/lib/task-runner";
import { completeTask, insertAssistantTaskMessage } from "@/server/lib/task-execution/helpers";
import { upsertProviderAuthCredential } from "@/server/lib/provider-credentials";
import { isSupportedOpencodeProvider, type SupportedOpencodeProvider } from "@/server/lib/opencode";

function getCallbackToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  const token = parts[1]?.trim();
  return token && token.length > 0 ? token : null;
}

function getRunner(executionId: string): DurableObjectStub<TaskRunner> {
  const id = env.TaskRunner.idFromName(executionId);
  return env.TaskRunner.get(id);
}

export const Route = createFileRoute("/api/internal/task-runs/$executionId/complete")({
  server: {
    handlers: {
      POST: async ({ request, params }: { request: Request; params: { executionId: string } }) => {
        const token = getCallbackToken(request);
        if (!token) {
          return Response.json({ error: "Missing callback token" }, { status: 401 });
        }

        const runner = getRunner(params.executionId);
        const context = await runner.verifyToken(token);
        if (!context) {
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

        const db = getDb(env);

        if (
          body.assistantOutput &&
          typeof body.assistantOutput === "string" &&
          body.assistantOutput.trim().length > 0
        ) {
          try {
            await insertAssistantTaskMessage({
              db,
              organizationId: context.organizationId,
              taskId: context.taskId,
              content: body.assistantOutput.trim(),
            });
          } catch (error) {
            console.warn("Failed to persist assistant output on complete callback", {
              executionId: params.executionId,
              taskId: context.taskId,
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
                context.userId,
                provider as SupportedOpencodeProvider,
                body.refreshedAuth.auth as Parameters<typeof upsertProviderAuthCredential>[4],
              );
            } catch {}
          }
        }

        await completeTask({ db, taskId: context.taskId });
        await runner.clearCallback();

        return Response.json({ ok: true });
      },
    },
  },
});
