import { and, eq, inArray } from "drizzle-orm";
import { pullRequests } from "../../db/schema";
import { resetPullRequestCheckRuns } from "./pull-request-check-runs";

import type { AppDb } from "../../db/client";
import type { EmitterWebhookEvent } from "@octokit/webhooks";

export async function handleCheckSuite(
    event: EmitterWebhookEvent<"check_suite">,
    db: AppDb,
): Promise<void> {
    const { action, check_suite: checkSuite, repository } = event.payload;

    switch (action) {
        case "requested":
        case "rerequested":
        case "completed":
            break;
        default:
            return;
    }

    if (!("installation" in event.payload) || event.payload.installation == null) {
        throw Error("No installation found");
    }
    const installation = event.payload.installation;

    const prNumbers = checkSuite.pull_requests.map((pr) => pr.number);
    if (prNumbers.length === 0) {
        return;
    }

    console.log(`PR checks updated via check_suite (${action}) for ${repository.full_name}`);

    const now = Date.now();
    if (action === "requested" || action === "rerequested") {
        await resetPullRequestCheckRuns({
            db,
            repository: repository.full_name,
            prNumbers,
        });
    }

    await db
        .insert(pullRequests)
        .values(
            prNumbers.map((prNumber) => ({
                id: crypto.randomUUID(),
                installationId: installation.id,
                repository: repository.full_name,
                branch: checkSuite.head_branch,
                prNumber,
                openedAt: now,
            })),
        )
        .onConflictDoNothing({
            target: [pullRequests.repository, pullRequests.prNumber],
        });

    await db
        .update(pullRequests)
        .set({
            branch: checkSuite.head_branch ?? undefined,
            checksCount: checkSuite.latest_check_runs_count,
            checksCompletedCount:
                action === "completed" && checkSuite.latest_check_runs_count != null
                    ? checkSuite.latest_check_runs_count
                    : action === "requested" || action === "rerequested"
                      ? null
                      : undefined,
            checksState: checkSuite.status,
            checksConclusion: checkSuite.conclusion,
            checksUpdatedAt: now,
        })
        .where(
            and(
                eq(pullRequests.repository, repository.full_name),
                inArray(pullRequests.prNumber, prNumbers),
            ),
        );
}
