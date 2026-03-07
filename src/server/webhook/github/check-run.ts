import type { EmitterWebhookEvent } from "@octokit/webhooks";
import type { AppDb } from "../../db/client";
import { pullRequests } from "../../db/schema";
import { upsertPullRequestCheckRunCounts } from "./pull-request-check-runs";

export async function handleCheckRun(
  event: EmitterWebhookEvent<"check_run">,
  db: AppDb,
): Promise<void> {
  const { action, check_run: checkRun, repository } = event.payload;

  switch (action) {
    case "created":
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

  const prNumbers = checkRun.pull_requests.map((pr) => pr.number);
  if (prNumbers.length === 0) {
    return;
  }

  console.log(`PR checks updated via check_run (${action}) for ${repository.full_name}`);

  const now = Date.now();
  await db
    .insert(pullRequests)
    .values(
      prNumbers.map((prNumber) => ({
        id: crypto.randomUUID(),
        installationId: installation.id,
        repository: repository.full_name,
        prNumber,
        openedAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [pullRequests.repository, pullRequests.prNumber],
    });

  await upsertPullRequestCheckRunCounts({
    db,
    repository: repository.full_name,
    prNumbers,
    checkRunId: checkRun.id,
    conclusion: checkRun.conclusion,
    status: checkRun.status,
  });
}
