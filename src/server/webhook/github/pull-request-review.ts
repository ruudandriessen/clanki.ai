import { and, eq, isNull, lte, or } from "drizzle-orm";
import { pullRequests } from "../../db/schema";

import type { AppDb } from "../../db/client";
import type { EmitterWebhookEvent } from "@octokit/webhooks";

export async function handlePullRequestReview(
    event: EmitterWebhookEvent<"pull_request_review">,
    db: AppDb,
): Promise<void> {
    const { action, pull_request: pr, repository, review } = event.payload;

    let reviewState: string;
    switch (action) {
        case "submitted":
        case "edited":
            reviewState = review.state.toLowerCase();
            break;
        case "dismissed":
            reviewState = review.state?.toLowerCase() ?? "dismissed";
            break;
        default:
            return;
    }

    console.log(`PR #${pr.number} review ${action}: ${reviewState}`);

    const reviewEventAt =
        toMsTimestamp(("submitted_at" in review ? review.submitted_at : undefined) ?? undefined) ??
        toMsTimestamp(("updated_at" in review ? review.updated_at : undefined) ?? undefined) ??
        Date.now();
    const reviewWhere = and(
        eq(pullRequests.repository, repository.full_name),
        eq(pullRequests.prNumber, pr.number),
        or(isNull(pullRequests.reviewUpdatedAt), lte(pullRequests.reviewUpdatedAt, reviewEventAt)),
    );

    const updated = await db
        .update(pullRequests)
        .set({
            branch: pr.head.ref,
            reviewState,
            reviewUpdatedAt: reviewEventAt,
        })
        .where(reviewWhere)
        .returning({ id: pullRequests.id });

    if (updated.length > 0) {
        return;
    }

    if (!("installation" in event.payload) || event.payload.installation == null) {
        return;
    }

    await db
        .insert(pullRequests)
        .values({
            id: crypto.randomUUID(),
            installationId: event.payload.installation.id,
            repository: repository.full_name,
            branch: pr.head.ref,
            prNumber: pr.number,
            openedAt: reviewEventAt,
            readyAt: pr.draft ? null : reviewEventAt,
        })
        .onConflictDoNothing({
            target: [pullRequests.repository, pullRequests.prNumber],
        });

    await db
        .update(pullRequests)
        .set({
            branch: pr.head.ref,
            reviewState,
            reviewUpdatedAt: reviewEventAt,
        })
        .where(reviewWhere);
}

function toMsTimestamp(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
