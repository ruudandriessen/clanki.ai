/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { parseGithubPullRequest } from "./parse-github-pull-request";

describe("parseGithubPullRequest", () => {
  test("maps an open draft pull request with failing checks", () => {
    const pullRequest = parseGithubPullRequest("acme/widgets", {
      number: 12,
      url: "https://github.com/acme/widgets/pull/12",
      state: "OPEN",
      isDraft: true,
      headRefName: "fix/login",
      reviewDecision: "CHANGES_REQUESTED",
      statusCheckRollup: [
        { status: "COMPLETED", conclusion: "FAILURE" },
        { status: "IN_PROGRESS", conclusion: null },
      ],
      createdAt: "2026-01-02T00:00:00.000Z",
      mergedAt: null,
    });

    expect(pullRequest).toEqual({
      repository: "acme/widgets",
      branch: "fix/login",
      pr_number: 12,
      url: "https://github.com/acme/widgets/pull/12",
      state: "draft",
      review_state: "changes_requested",
      checks_count: 2,
      checks_completed_count: 1,
      checks_state: "in_progress",
      checks_conclusion: "failure",
      opened_at: Date.parse("2026-01-02T00:00:00.000Z"),
      merged_at: null,
    });
  });
});
