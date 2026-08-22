import { eq } from "drizzle-orm";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

const RESTART_INTERRUPT_MESSAGE = "Run interrupted by app restart";

export async function reapStaleAiRuns(db: AppDb): Promise<number> {
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
