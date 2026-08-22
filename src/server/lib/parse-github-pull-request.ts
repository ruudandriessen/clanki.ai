import type { PullRequest } from "@/lib/pull-request";

const FAILING_CHECK_CONCLUSIONS = new Set([
  "FAILURE",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
]);

export type GithubPullRequestJson = {
  number?: number;
  url?: string;
  state?: string;
  isDraft?: boolean;
  headRefName?: string;
  reviewDecision?: string | null;
  statusCheckRollup?: Array<{
    conclusion?: string | null;
    status?: string | null;
  }> | null;
  createdAt?: string;
  mergedAt?: string | null;
};

export function parseGithubPullRequest(
  repository: string,
  pullRequest: GithubPullRequestJson,
): PullRequest | null {
  const prNumber = pullRequest.number;
  const url = pullRequest.url?.trim();
  const branch = pullRequest.headRefName?.trim();
  if (typeof prNumber !== "number" || !url || !branch) {
    return null;
  }

  const rollup = pullRequest.statusCheckRollup ?? [];
  const checksCount = rollup.length > 0 ? rollup.length : null;
  const checksCompletedCount =
    checksCount === null
      ? null
      : rollup.filter((check) => (check.status ?? "").toUpperCase() === "COMPLETED").length;
  const failingCheck = rollup.find((check) =>
    FAILING_CHECK_CONCLUSIONS.has((check.conclusion ?? "").toUpperCase()),
  );
  const pendingCheck = rollup.find((check) => (check.status ?? "").toUpperCase() !== "COMPLETED");

  return {
    repository,
    branch,
    pr_number: prNumber,
    url,
    state: resolvePullRequestState(pullRequest),
    review_state: toSnakeCase(pullRequest.reviewDecision),
    checks_count: checksCount,
    checks_completed_count: checksCompletedCount,
    checks_state: pendingCheck ? "in_progress" : checksCount === null ? null : "completed",
    checks_conclusion: failingCheck
      ? toSnakeCase(failingCheck.conclusion)
      : pendingCheck
        ? null
        : checksCount === null
          ? null
          : "success",
    opened_at: Date.parse(pullRequest.createdAt ?? "") || Date.now(),
    merged_at: pullRequest.mergedAt ? Date.parse(pullRequest.mergedAt) || null : null,
  };
}

function resolvePullRequestState(pullRequest: GithubPullRequestJson): string {
  if (pullRequest.isDraft) {
    return "draft";
  }

  switch ((pullRequest.state ?? "").toUpperCase()) {
    case "MERGED":
      return "merged";
    case "CLOSED":
      return "closed";
    default:
      return "open";
  }
}

function toSnakeCase(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase().replaceAll(" ", "_");
}
