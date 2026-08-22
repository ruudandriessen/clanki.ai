import { eq } from "drizzle-orm";
import type { RunRecord } from "@tanstack/ai";
import { reapDetachedRuns, type RunExitProbe } from "@tanstack/ai-sandbox";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { taskChatPersistence } from "@/server/lib/ai-persistence";
import {
  driveTaskChatRun,
  durabilityForRunId,
  readTaskWorkspacePath,
  taskChatLocks,
} from "@/server/lib/task-chat";

const RESTART_INTERRUPT_MESSAGE = "Run interrupted by app restart";
const DETACHED_RUN_TTL_MS = 30 * 60 * 1000;
const REAPER_INTERVAL_MS = 60_000;

type GlobalWithReaper = typeof globalThis & {
  __clankiTaskChatReaperScheduled?: boolean;
};

const globalWithReaper = globalThis as GlobalWithReaper;

export async function terminalizeOrphanedRunsOnStartup(db: AppDb): Promise<number> {
  const runningRuns = await db.query.aiRuns.findMany({
    where: eq(schema.aiRuns.status, "running"),
    columns: { runId: true },
  });

  if (runningRuns.length === 0) {
    return 0;
  }

  const now = Date.now();
  for (const run of runningRuns) {
    await db
      .update(schema.aiRuns)
      .set({
        status: "interrupted",
        finishedAt: now,
        error: RESTART_INTERRUPT_MESSAGE,
      })
      .where(eq(schema.aiRuns.runId, run.runId));

    await db
      .update(schema.aiStreamLogs)
      .set({ complete: 1, completedAt: now })
      .where(eq(schema.aiStreamLogs.runId, run.runId));
  }

  return runningRuns.length;
}

async function hasFinished(_record: RunRecord): Promise<RunExitProbe> {
  return { state: "unknown" };
}

async function sweepDetachedTaskChatRuns(): Promise<void> {
  await reapDetachedRuns({
    runs: taskChatPersistence.stores.runs,
    locks: taskChatLocks,
    durability: durabilityForRunId,
    hasFinished,
    drive: async function* ({ runId, threadId, signal }) {
      const workspacePath = await readTaskWorkspacePath(threadId);
      if (!workspacePath) {
        throw new Error("Task workspace is not ready");
      }

      yield* driveTaskChatRun({
        runId,
        threadId,
        signal,
        workspacePath,
        durability: durabilityForRunId(runId),
      });
    },
    now: Date.now(),
    detachedRunTtlMs: DETACHED_RUN_TTL_MS,
  });
}

export async function initializeTaskChatRunLifecycle(db: AppDb): Promise<void> {
  await terminalizeOrphanedRunsOnStartup(db);
  await sweepDetachedTaskChatRuns();
}

export function scheduleTaskChatReaper(): void {
  if (globalWithReaper.__clankiTaskChatReaperScheduled) {
    return;
  }

  globalWithReaper.__clankiTaskChatReaperScheduled = true;
  let inFlight = false;

  setInterval(() => {
    if (inFlight) {
      return;
    }

    inFlight = true;
    void sweepDetachedTaskChatRuns()
      .catch((error) => {
        console.error("task chat reaper failed", error);
      })
      .finally(() => {
        inFlight = false;
      });
  }, REAPER_INTERVAL_MS);
}
