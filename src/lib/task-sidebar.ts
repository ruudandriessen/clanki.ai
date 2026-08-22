import type { Project } from "@/lib/project";
import type { PullRequest, PullRequestStatus } from "@/lib/pull-request";
import { extractOrgRepoFromUrl, getPullRequestStatus } from "@/lib/pull-request";
import type { Task } from "@/lib/task";

export type TaskSidebarGroup = "merged" | "needsAction" | "openNoPr" | "awaitingReview" | "running";

const TASK_SIDEBAR_GROUPS: Array<{ key: TaskSidebarGroup; label: string }> = [
  { key: "merged", label: "Merged" },
  { key: "needsAction", label: "Needs action" },
  { key: "openNoPr", label: "Idle" },
  { key: "awaitingReview", label: "Awaiting review" },
  { key: "running", label: "Running" },
];

const FAILING_CHECK_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
  "startup_failure",
  "stale",
]);

function hasFailingChecks(checksConclusion: string | null | undefined): boolean {
  if (!checksConclusion) {
    return false;
  }

  return FAILING_CHECK_CONCLUSIONS.has(checksConclusion);
}

function getSidebarGroupKey(params: {
  checksConclusion: string | null | undefined;
  hasError: boolean;
  isRunning: boolean;
  pullRequestStatus: PullRequestStatus | null;
  reviewState: string | null | undefined;
}): TaskSidebarGroup {
  const { checksConclusion, hasError, isRunning, pullRequestStatus, reviewState } = params;

  if (isRunning) {
    return "running";
  }

  if (pullRequestStatus === "merged") {
    return "merged";
  }

  if (
    hasError ||
    reviewState === "changes_requested" ||
    hasFailingChecks(checksConclusion) ||
    pullRequestStatus === "closed" ||
    pullRequestStatus === "draft"
  ) {
    return "needsAction";
  }

  if (!pullRequestStatus) {
    return "openNoPr";
  }

  return "awaitingReview";
}

function buildTaskSidebarGroups(params: {
  projects: Project[];
  pullRequests: PullRequest[];
  tasks: Task[];
}): Record<TaskSidebarGroup, Task[]> {
  const { projects, pullRequests, tasks } = params;
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const latestPullRequestByKey = new Map<string, PullRequest>();

  for (const pullRequest of pullRequests) {
    if (!pullRequest.branch) {
      continue;
    }

    const pullRequestKey = `${pullRequest.repository}::${pullRequest.branch}`;
    if (!latestPullRequestByKey.has(pullRequestKey)) {
      latestPullRequestByKey.set(pullRequestKey, pullRequest);
    }
  }

  const groupedTasks: Record<TaskSidebarGroup, Task[]> = {
    merged: [],
    needsAction: [],
    openNoPr: [],
    awaitingReview: [],
    running: [],
  };

  for (const task of tasks) {
    const projectRepository = extractOrgRepoFromUrl(
      task.project_id ? (projectsById.get(task.project_id)?.repo_url ?? null) : null,
    );
    const pullRequest =
      projectRepository && task.branch
        ? (latestPullRequestByKey.get(`${projectRepository}::${task.branch}`) ?? null)
        : null;
    const pullRequestStatus = pullRequest ? getPullRequestStatus(pullRequest) : null;
    const groupKey = getSidebarGroupKey({
      isRunning: task.is_running,
      pullRequestStatus,
      reviewState: pullRequest?.review_state,
      checksConclusion: pullRequest?.checks_conclusion,
      hasError: (task.error?.trim().length ?? 0) > 0,
    });
    groupedTasks[groupKey].push(task);
  }

  return groupedTasks;
}

export type OrderedSidebarTask = {
  groupKey: TaskSidebarGroup;
  task: Task;
};

export function buildOrderedSidebarTasks(params: {
  projects: Project[];
  pullRequests: PullRequest[];
  tasks: Task[];
}): OrderedSidebarTask[] {
  const groupedTasks = buildTaskSidebarGroups(params);
  const orderedTasks: OrderedSidebarTask[] = [];

  for (const group of TASK_SIDEBAR_GROUPS) {
    for (const task of groupedTasks[group.key]) {
      orderedTasks.push({ groupKey: group.key, task });
    }
  }

  return orderedTasks;
}

export function getTaskSidebarGroupLabel(groupKey: TaskSidebarGroup): string {
  return TASK_SIDEBAR_GROUPS.find((group) => group.key === groupKey)?.label ?? groupKey;
}

function isSnoozedSidebarGroup(groupKey: TaskSidebarGroup): boolean {
  return groupKey !== "needsAction";
}

export function partitionSidebarTasks(
  orderedTasks: OrderedSidebarTask[],
  activeTaskId: string | null,
): { snoozedTasks: OrderedSidebarTask[]; visibleTasks: OrderedSidebarTask[] } {
  const visibleTasks: OrderedSidebarTask[] = [];
  const snoozedTasks: OrderedSidebarTask[] = [];
  let activeSnoozedTask: OrderedSidebarTask | null = null;

  for (const entry of orderedTasks) {
    if (!isSnoozedSidebarGroup(entry.groupKey)) {
      visibleTasks.push(entry);
      continue;
    }

    if (activeTaskId && entry.task.id === activeTaskId) {
      activeSnoozedTask = entry;
      continue;
    }

    snoozedTasks.push(entry);
  }

  if (activeSnoozedTask) {
    visibleTasks.push(activeSnoozedTask);
  }

  return { snoozedTasks, visibleTasks };
}

export function getFirstSidebarTaskId(params: {
  projects: Project[];
  pullRequests: PullRequest[];
  tasks: Task[];
}): string | null {
  const orderedTasks = buildOrderedSidebarTasks(params);
  const { snoozedTasks, visibleTasks } = partitionSidebarTasks(orderedTasks, null);

  return visibleTasks[0]?.task.id ?? snoozedTasks[0]?.task.id ?? null;
}
