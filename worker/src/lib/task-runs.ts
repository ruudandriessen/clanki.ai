import { and, desc, eq, isNull, not } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { createInstallationToken, buildAuthenticatedCloneUrl, type GitHubAppEnv } from "./github";
import { getTaskSandbox, getOpenCodeClient, type SandboxEnv } from "./sandbox";

type TaskRunEnv = SandboxEnv & GitHubAppEnv;

export async function executeTaskRun(args: {
  db: DrizzleD1Database<typeof schema>;
  env: TaskRunEnv;
  runId: string;
  taskId: string;
  taskTitle: string;
  prompt: string;
  repoUrl: string | null;
  installationId: number | null;
}): Promise<void> {
  const { db, env, runId, taskId, taskTitle, prompt, repoUrl, installationId } = args;

  try {
    const startedAt = Date.now();
    await db
      .update(schema.taskRuns)
      .set({
        status: "running",
        startedAt,
        updatedAt: startedAt,
        error: null,
      })
      .where(eq(schema.taskRuns.id, runId));

    await appendRunEvent(db, runId, "status", "running", startedAt);

    // Get or resume sandbox for this task
    const sandbox = getTaskSandbox(env, taskId);
    const sandboxId = taskId;

    await db
      .update(schema.taskRuns)
      .set({ sandboxId, updatedAt: Date.now() })
      .where(eq(schema.taskRuns.id, runId));

    // Clone repo on first use (gitCheckout is a no-op if dir already exists on a warm sandbox)
    const repoDir = "/home/user/repo";
    if (repoUrl) {
      const needsClone = !(await sandbox.exists(repoDir)).exists;
      if (needsClone) {
        let cloneUrl = repoUrl;
        if (installationId) {
          const token = await createInstallationToken(env, installationId);
          cloneUrl = buildAuthenticatedCloneUrl(repoUrl, token);
        }
        await sandbox.gitCheckout(cloneUrl, { targetDir: repoDir });
      }
    }

    // Start or connect to the OpenCode server and get a typed client
    const { client } = await getOpenCodeClient(sandbox, env, repoDir);

    // Reuse an existing OpenCode session from a previous run, or create a new one
    const previousRun = await db.query.taskRuns.findFirst({
      where: and(
        eq(schema.taskRuns.taskId, taskId),
        eq(schema.taskRuns.tool, "opencode"),
        not(isNull(schema.taskRuns.sessionId)),
      ),
      columns: { sessionId: true },
      orderBy: desc(schema.taskRuns.createdAt),
    });

    let sessionId = previousRun?.sessionId ?? null;
    if (!sessionId) {
      const { data: session } = await client.session.create({
        body: { title: taskTitle },
      });
      sessionId = session?.id ?? null;
      if (!sessionId) {
        throw new Error("Failed to create OpenCode session");
      }
    }

    // Send the prompt and wait for a response
    const { data: response } = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: prompt }],
      },
    });

    // Extract text from the response parts
    const output = extractTextFromParts(response?.parts).trim();
    const assistantOutput = output.length > 0 ? output : "OpenCode completed without text output.";

    const assistantMessageId = crypto.randomUUID();
    const assistantCreatedAt = await getNextTaskMessageTimestamp(db, taskId);

    await db.insert(schema.taskMessages).values({
      id: assistantMessageId,
      taskId,
      role: "assistant",
      content: assistantOutput,
      createdAt: assistantCreatedAt,
    });

    const finishedAt = Date.now();
    await db
      .update(schema.taskRuns)
      .set({
        status: "succeeded",
        sessionId,
        sandboxId,
        outputMessageId: assistantMessageId,
        finishedAt,
        updatedAt: finishedAt,
        error: null,
      })
      .where(eq(schema.taskRuns.id, runId));

    await db.update(schema.tasks).set({ updatedAt: finishedAt }).where(eq(schema.tasks.id, taskId));

    await appendRunEvent(db, runId, "assistant", assistantOutput);
    await appendRunEvent(db, runId, "status", "succeeded");
  } catch (error) {
    await markRunFailed(db, runId, taskId, getErrorMessage(error));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  const chunks: string[] = [];
  for (const part of parts) {
    if (part && typeof part === "object" && "type" in part && part.type === "text") {
      const text = (part as { text?: string }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        chunks.push(text.trim());
      }
    }
  }
  return chunks.join("\n\n");
}

async function appendRunEvent(
  db: DrizzleD1Database<typeof schema>,
  runId: string,
  kind: string,
  payload: string,
  createdAt = Date.now(),
): Promise<void> {
  await db.insert(schema.taskRunEvents).values({
    id: crypto.randomUUID(),
    runId,
    kind,
    payload,
    createdAt,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown task run failure";
}

async function getNextTaskMessageTimestamp(
  db: DrizzleD1Database<typeof schema>,
  taskId: string,
): Promise<number> {
  const now = Date.now();
  const latest = await db.query.taskMessages.findFirst({
    where: eq(schema.taskMessages.taskId, taskId),
    columns: { createdAt: true },
    orderBy: desc(schema.taskMessages.createdAt),
  });

  if (!latest?.createdAt) {
    return now;
  }

  return latest.createdAt >= now ? latest.createdAt + 1 : now;
}

async function markRunFailed(
  db: DrizzleD1Database<typeof schema>,
  runId: string,
  taskId: string,
  message: string,
): Promise<void> {
  const finishedAt = Date.now();

  try {
    await db
      .update(schema.taskRuns)
      .set({
        status: "failed",
        finishedAt,
        updatedAt: finishedAt,
        error: message,
      })
      .where(eq(schema.taskRuns.id, runId));
  } catch {}

  try {
    await db.update(schema.tasks).set({ updatedAt: finishedAt }).where(eq(schema.tasks.id, taskId));
  } catch {}

  try {
    await appendRunEvent(db, runId, "error", message, finishedAt);
    await appendRunEvent(db, runId, "status", "failed");
  } catch {}
}
