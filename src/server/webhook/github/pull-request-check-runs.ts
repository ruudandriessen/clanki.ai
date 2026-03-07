import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../../db/client";
import { pullRequestCheckRuns, pullRequests } from "../../db/schema";

interface ResetPullRequestCheckRunsParams {
  db: AppDb;
  repository: string;
  prNumbers: number[];
}

interface UpsertPullRequestCheckRunParams extends ResetPullRequestCheckRunsParams {
  checkRunId: number;
  conclusion: string | null;
  status: string;
}

export async function resetPullRequestCheckRuns({
  db,
  repository,
  prNumbers,
}: ResetPullRequestCheckRunsParams): Promise<void> {
  if (prNumbers.length === 0) {
    return;
  }

  await db
    .delete(pullRequestCheckRuns)
    .where(
      and(
        eq(pullRequestCheckRuns.repository, repository),
        inArray(pullRequestCheckRuns.prNumber, prNumbers),
      ),
    );
}

export async function upsertPullRequestCheckRunCounts({
  db,
  repository,
  prNumbers,
  checkRunId,
  conclusion,
  status,
}: UpsertPullRequestCheckRunParams): Promise<void> {
  if (prNumbers.length === 0) {
    return;
  }

  const now = Date.now();
  const checkRunIdText = String(checkRunId);

  await db
    .insert(pullRequestCheckRuns)
    .values(
      prNumbers.map((prNumber) => ({
        id: `${repository}:${prNumber}:${checkRunIdText}`,
        repository,
        prNumber,
        checkRunId: checkRunIdText,
        status,
        conclusion,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [
        pullRequestCheckRuns.repository,
        pullRequestCheckRuns.prNumber,
        pullRequestCheckRuns.checkRunId,
      ],
      set: {
        status,
        conclusion,
        updatedAt: now,
      },
    });

  const [checkRunRows, pullRequestRows] = await Promise.all([
    db
      .select({
        prNumber: pullRequestCheckRuns.prNumber,
        status: pullRequestCheckRuns.status,
      })
      .from(pullRequestCheckRuns)
      .where(
        and(
          eq(pullRequestCheckRuns.repository, repository),
          inArray(pullRequestCheckRuns.prNumber, prNumbers),
        ),
      ),
    db
      .select({
        prNumber: pullRequests.prNumber,
        checksCount: pullRequests.checksCount,
      })
      .from(pullRequests)
      .where(
        and(eq(pullRequests.repository, repository), inArray(pullRequests.prNumber, prNumbers)),
      ),
  ]);

  const countsByPrNumber = new Map<number, { completed: number; total: number }>();
  for (const row of checkRunRows) {
    const current = countsByPrNumber.get(row.prNumber) ?? { completed: 0, total: 0 };
    current.total += 1;
    if (row.status === "completed") {
      current.completed += 1;
    }
    countsByPrNumber.set(row.prNumber, current);
  }

  await Promise.all(
    pullRequestRows.map((pullRequestRow) => {
      const counts = countsByPrNumber.get(pullRequestRow.prNumber) ?? { completed: 0, total: 0 };
      const totalChecks = Math.max(pullRequestRow.checksCount ?? 0, counts.total);

      return db
        .update(pullRequests)
        .set({
          checksCompletedCount: counts.completed,
          checksCount: totalChecks > 0 ? totalChecks : null,
          checksConclusion: status === "completed" ? undefined : conclusion,
          checksState: status === "completed" ? undefined : status,
          checksUpdatedAt: now,
        })
        .where(
          and(
            eq(pullRequests.repository, repository),
            eq(pullRequests.prNumber, pullRequestRow.prNumber),
          ),
        );
    }),
  );
}
