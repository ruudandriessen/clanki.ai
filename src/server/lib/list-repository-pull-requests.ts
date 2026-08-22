import type { PullRequest } from "@/lib/pull-request";
import { runGhJson } from "./gh";
import { parseGithubPullRequest, type GithubPullRequestJson } from "./parse-github-pull-request";

export function listRepositoryPullRequests(repository: string): PullRequest[] {
  const pullRequests = runGhJson<GithubPullRequestJson[]>([
    "pr",
    "list",
    "--repo",
    repository,
    "--state",
    "all",
    "--limit",
    "50",
    "--json",
    "number,url,state,isDraft,headRefName,reviewDecision,statusCheckRollup,createdAt,mergedAt",
  ]);

  return pullRequests
    .map((pullRequest) => parseGithubPullRequest(repository, pullRequest))
    .filter((pullRequest): pullRequest is PullRequest => pullRequest !== null);
}
