import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

export type TaskThreadState = {
  isRunning: boolean;
  chatError: string | null;
};

export async function loadTaskThreadStates(
  db: AppDb,
  taskIds: string[],
): Promise<Map<string, TaskThreadState>> {
  const states = new Map<string, TaskThreadState>();
  if (taskIds.length === 0) {
    return states;
  }

  for (const taskId of taskIds) {
    states.set(taskId, { isRunning: false, chatError: null });
  }

  const [activeRuns, recentRuns] = await Promise.all([
    db.query.aiRuns.findMany({
      where: and(inArray(schema.aiRuns.threadId, taskIds), eq(schema.aiRuns.status, "running")),
      columns: { threadId: true },
    }),
    db.query.aiRuns.findMany({
      where: inArray(schema.aiRuns.threadId, taskIds),
      orderBy: [desc(schema.aiRuns.startedAt)],
      columns: { threadId: true, status: true, error: true },
    }),
  ]);

  for (const run of activeRuns) {
    const state = states.get(run.threadId);
    if (state) {
      state.isRunning = true;
    }
  }

  const seenThreads = new Set<string>();
  for (const run of recentRuns) {
    if (seenThreads.has(run.threadId)) {
      continue;
    }
    seenThreads.add(run.threadId);

    const state = states.get(run.threadId);
    if (!state) {
      continue;
    }

    if (run.status === "failed" && run.error) {
      state.chatError = run.error;
    }
  }

  return states;
}
