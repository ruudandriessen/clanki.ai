import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../../db/client";
import { pullRequests } from "../../db/schema";

export async function handlePullRequest(
  event: EmitterWebhookEvent<"pull_request">,
  db: AppDb,
): Promise<void> {
  const { action, pull_request: pr, repository } = event.payload;
  const branch = pr.head.ref;
  const pullRequestWhere = and(
    eq(pullRequests.prNumber, pr.number),
    eq(pullRequests.repository, repository.full_name),
  );

  if (!("installation" in event.payload) || event.payload.installation == null) {
    throw Error("No installation found");
  }
  const installation = event.payload.installation;

  switch (action) {
    case "closed": {
      if (pr.merged) {
        console.log(`PR #${pr.number} merged: ${pr.title}`);

        await db
          .update(pullRequests)
          .set({
            mergedAt: pr.merged_at ? new Date(pr.merged_at).getTime() : null,
            mergedBy: pr.merged_by?.login,
            branch,
          })
          .where(pullRequestWhere);

        return;
      }

      console.log(`PR #${pr.number} closed without merge: ${pr.title}`);
      await db.update(pullRequests).set({ branch }).where(pullRequestWhere);
      break;
    }

    case "opened": {
      console.log(`PR #${pr.number} opened: ${pr.title}`);
      const now = Date.now();
      await db
        .insert(pullRequests)
        .values({
          id: crypto.randomUUID(),
          installationId: installation.id,
          repository: repository.full_name,
          branch,
          prNumber: pr.number,
          openedAt: now,
          readyAt: pr.draft ? null : now,
          reviewState: null,
          reviewUpdatedAt: null,
          checksState: null,
          checksConclusion: null,
          checksUpdatedAt: null,
        })
        .onConflictDoUpdate({
          target: [pullRequests.repository, pullRequests.prNumber],
          set: {
            installationId: installation.id,
            branch,
            reviewState: null,
            reviewUpdatedAt: null,
            checksState: null,
            checksConclusion: null,
            checksUpdatedAt: null,
          },
        });
      break;
    }

    case "ready_for_review": {
      console.log(`PR #${pr.number} ready for review: ${pr.title}`);
      await db.update(pullRequests).set({ readyAt: Date.now(), branch }).where(pullRequestWhere);
      break;
    }

    case "synchronize": {
      console.log(`PR #${pr.number} synchronized: ${pr.title}`);
      await db
        .update(pullRequests)
        .set({
          branch,
          reviewState: null,
          reviewUpdatedAt: Date.now(),
          checksState: null,
          checksConclusion: null,
          checksUpdatedAt: Date.now(),
        })
        .where(pullRequestWhere);
      break;
    }

    case "reopened": {
      console.log(`PR #${pr.number} reopened: ${pr.title}`);
      await db
        .update(pullRequests)
        .set({
          mergedAt: null,
          mergedBy: null,
          readyAt: pr.draft ? null : Date.now(),
          branch,
          reviewState: null,
          reviewUpdatedAt: Date.now(),
          checksState: null,
          checksConclusion: null,
          checksUpdatedAt: Date.now(),
        })
        .where(pullRequestWhere);
      break;
    }

    case "converted_to_draft": {
      console.log(`PR #${pr.number} converted to draft: ${pr.title}`);
      await db.update(pullRequests).set({ readyAt: null, branch }).where(pullRequestWhere);
      break;
    }

    case "review_requested":
    case "review_request_removed": {
      console.log(`PR #${pr.number} ${action}: ${pr.title}`);
      await db.update(pullRequests).set({ branch }).where(pullRequestWhere);
      break;
    }
  }
}
