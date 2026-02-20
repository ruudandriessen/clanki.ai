import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../../db/client";
import { pullRequests } from "../../db/schema";

export async function handlePullRequestReview(
  event: EmitterWebhookEvent<"pull_request_review">,
  db: AppDb,
): Promise<void> {
  const { action, pull_request: pr, repository, review } = event.payload;

  if (!("installation" in event.payload) || event.payload.installation == null) {
    throw Error("No installation found");
  }

  let reviewState: string;
  switch (action) {
    case "submitted":
    case "edited":
      reviewState = review.state;
      break;
    case "dismissed":
      reviewState = review.state ?? "dismissed";
      break;
    default:
      return;
  }

  console.log(`PR #${pr.number} review ${action}: ${reviewState}`);

  const now = Date.now();
  await db
    .insert(pullRequests)
    .values({
      id: crypto.randomUUID(),
      installationId: event.payload.installation.id,
      repository: repository.full_name,
      branch: pr.head.ref,
      prNumber: pr.number,
      openedAt: now,
      readyAt: pr.draft ? null : now,
    })
    .onConflictDoNothing({
      target: [pullRequests.repository, pullRequests.prNumber],
    });

  await db
    .update(pullRequests)
    .set({
      branch: pr.head.ref,
      reviewState,
      reviewUpdatedAt: now,
    })
    .where(
      and(eq(pullRequests.repository, repository.full_name), eq(pullRequests.prNumber, pr.number)),
    );
}
