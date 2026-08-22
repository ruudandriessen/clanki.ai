import { and, desc, eq, inArray } from "drizzle-orm";
import type { TaskExecutionState } from "@/lib/task";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

export type TaskThreadSnapshot = {
  hasActiveRun: boolean;
  latestChatError: string | null;
};

export function resolveTaskExecutionState(args: {
  workspaceError: string | null;
  thread: TaskThreadSnapshot;
}): TaskExecutionState {
  if (args.thread.hasActiveRun) {
    return { kind: "running" };
  }

  const workspaceMessage = args.workspaceError?.trim();
  if (workspaceMessage) {
    return { kind: "blocked", message: workspaceMessage };
  }

  const chatMessage = args.thread.latestChatError?.trim();
  if (chatMessage) {
    return { kind: "failed", message: chatMessage };
  }

  return { kind: "idle" };
}

export async function loadTaskThreadSnapshots(
  db: AppDb,
  taskIds: string[],
): Promise<Map<string, TaskThreadSnapshot>> {
  const snapshots = new Map<string, TaskThreadSnapshot>();
  if (taskIds.length === 0) {
    return snapshots;
  }

  for (const taskId of taskIds) {
    snapshots.set(taskId, { hasActiveRun: false, latestChatError: null });
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
    const snapshot = snapshots.get(run.threadId);
    if (snapshot) {
      snapshot.hasActiveRun = true;
    }
  }

  const seenThreads = new Set<string>();
  for (const run of recentRuns) {
    if (seenThreads.has(run.threadId)) {
      continue;
    }
    seenThreads.add(run.threadId);

    const snapshot = snapshots.get(run.threadId);
    if (!snapshot) {
      continue;
    }

    if (run.status === "failed" && run.error) {
      snapshot.latestChatError = run.error;
    }
  }

  return snapshots;
}
