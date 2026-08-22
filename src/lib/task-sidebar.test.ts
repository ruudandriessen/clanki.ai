/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import type { Project } from "./project";
import type { PullRequest } from "./pull-request";
import type { Task } from "./task";
import { buildOrderedSidebarTasks, partitionSidebarTasks } from "./task-sidebar";

const project: Project = {
  id: "project-1",
  name: "Clanki",
  repo_url: "https://github.com/acme/clanki",
  setup_command: null,
  run_command: null,
  run_port: null,
  created_at: 0,
  updated_at: 0,
};

function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    project_id: "project-1",
    title: overrides.id,
    execution: { kind: "idle" },
    runner_type: null,
    runner_session_id: null,
    workspace_path: null,
    branch: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function makePullRequest(
  overrides: Partial<PullRequest> & Pick<PullRequest, "branch">,
): PullRequest {
  return {
    repository: "acme/clanki",
    pr_number: 1,
    url: "https://github.com/acme/clanki/pull/1",
    state: "open",
    review_state: null,
    checks_count: null,
    checks_completed_count: null,
    checks_state: null,
    checks_conclusion: null,
    opened_at: 0,
    merged_at: null,
    ...overrides,
  };
}

describe("partitionSidebarTasks", () => {
  test("keeps idle no-PR tasks visible while snoozing running and review-waiting tasks", () => {
    const tasks = [
      makeTask({ id: "idle-no-pr" }),
      makeTask({ id: "running", execution: { kind: "running" }, branch: "feature/running" }),
      makeTask({
        id: "awaiting-review",
        branch: "feature/review",
      }),
      makeTask({
        id: "needs-action",
        execution: { kind: "failed", message: "Model unavailable" },
        branch: "feature/broken",
      }),
    ];
    const pullRequests = [
      makePullRequest({ branch: "feature/running" }),
      makePullRequest({ branch: "feature/review" }),
      makePullRequest({ branch: "feature/broken" }),
    ];

    const orderedTasks = buildOrderedSidebarTasks({ tasks, projects: [project], pullRequests });
    const { visibleTasks, snoozedTasks } = partitionSidebarTasks(orderedTasks, null);

    expect(visibleTasks.map((entry) => entry.task.id)).toEqual(["needs-action", "idle-no-pr"]);
    expect(snoozedTasks.map((entry) => entry.task.id)).toEqual(["awaiting-review", "running"]);
  });

  test("promotes the active snoozed task into the visible list without duplicating it", () => {
    const tasks = [
      makeTask({ id: "idle-no-pr" }),
      makeTask({ id: "running", execution: { kind: "running" }, branch: "feature/running" }),
    ];
    const pullRequests = [makePullRequest({ branch: "feature/running" })];
    const orderedTasks = buildOrderedSidebarTasks({ tasks, projects: [project], pullRequests });
    const { visibleTasks, snoozedTasks } = partitionSidebarTasks(orderedTasks, "running");

    expect(visibleTasks.map((entry) => entry.task.id)).toEqual(["idle-no-pr", "running"]);
    expect(snoozedTasks.map((entry) => entry.task.id)).toEqual([]);
  });
});
