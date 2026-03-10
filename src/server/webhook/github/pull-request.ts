import { and, eq, isNull, lte, or } from "drizzle-orm";
import { pullRequests } from "../../db/schema";
import { resetPullRequestCheckRuns } from "./pull-request-check-runs";

import type { AppDb } from "../../db/client";
import type { EmitterWebhookEvent } from "@octokit/webhooks";

export async function handlePullRequest(
    event: EmitterWebhookEvent<"pull_request">,
    db: AppDb,
): Promise<void> {
    const { action, pull_request: pr, repository } = event.payload;
    const branch = pr.head.ref;
    const pullRequestEventAt = toMsTimestamp(pr.updated_at) ?? Date.now();
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
                        state: "merged",
                    })
                    .where(pullRequestWhere);

                return;
            }

            console.log(`PR #${pr.number} closed without merge: ${pr.title}`);
            await db.update(pullRequests).set({ branch, state: "closed" }).where(pullRequestWhere);
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
                    state: pr.draft ? "draft" : "open",
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
                        state: pr.draft ? "draft" : "open",
                        mergedAt: null,
                        mergedBy: null,
                        reviewState: null,
                        reviewUpdatedAt: null,
                        checksCount: null,
                        checksCompletedCount: null,
                        checksState: null,
                        checksConclusion: null,
                        checksUpdatedAt: null,
                    },
                });
            await resetPullRequestCheckRuns({
                db,
                repository: repository.full_name,
                prNumbers: [pr.number],
            });
            break;
        }

        case "ready_for_review": {
            console.log(`PR #${pr.number} ready for review: ${pr.title}`);
            await db
                .update(pullRequests)
                .set({ readyAt: Date.now(), branch, state: "open" })
                .where(pullRequestWhere);
            break;
        }

        case "synchronize": {
            console.log(`PR #${pr.number} synchronized: ${pr.title}`);
            await db
                .update(pullRequests)
                .set({
                    branch,
                    state: pr.draft ? "draft" : "open",
                })
                .where(pullRequestWhere);

            await db
                .update(pullRequests)
                .set({
                    reviewState: null,
                    reviewUpdatedAt: pullRequestEventAt,
                })
                .where(
                    and(
                        pullRequestWhere,
                        or(
                            isNull(pullRequests.reviewUpdatedAt),
                            lte(pullRequests.reviewUpdatedAt, pullRequestEventAt),
                        ),
                    ),
                );

            await db
                .update(pullRequests)
                .set({
                    checksCount: null,
                    checksCompletedCount: null,
                    checksState: null,
                    checksConclusion: null,
                    checksUpdatedAt: pullRequestEventAt,
                })
                .where(
                    and(
                        pullRequestWhere,
                        or(
                            isNull(pullRequests.checksUpdatedAt),
                            lte(pullRequests.checksUpdatedAt, pullRequestEventAt),
                        ),
                    ),
                );
            await resetPullRequestCheckRuns({
                db,
                repository: repository.full_name,
                prNumbers: [pr.number],
            });
            break;
        }

        case "converted_to_draft": {
            console.log(`PR #${pr.number} converted to draft: ${pr.title}`);
            await db
                .update(pullRequests)
                .set({
                    branch,
                    readyAt: null,
                    state: "draft",
                    mergedAt: null,
                    mergedBy: null,
                    reviewState: null,
                    reviewUpdatedAt: Date.now(),
                    checksCount: null,
                    checksCompletedCount: null,
                    checksState: null,
                    checksConclusion: null,
                    checksUpdatedAt: Date.now(),
                })
                .where(pullRequestWhere);
            await resetPullRequestCheckRuns({
                db,
                repository: repository.full_name,
                prNumbers: [pr.number],
            });
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
                    state: pr.draft ? "draft" : "open",
                    reviewState: null,
                    reviewUpdatedAt: Date.now(),
                    checksCount: null,
                    checksCompletedCount: null,
                    checksState: null,
                    checksConclusion: null,
                    checksUpdatedAt: Date.now(),
                })
                .where(pullRequestWhere);
            await resetPullRequestCheckRuns({
                db,
                repository: repository.full_name,
                prNumbers: [pr.number],
            });
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

function toMsTimestamp(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}
