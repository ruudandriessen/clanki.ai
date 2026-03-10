import {
    extractOrgRepoFromUrl,
    getPullRequestStatus,
    type PullRequestStatus,
} from "@/lib/pull-request";

import type { Project, PullRequest, Task } from "@/lib/collections";

export type TaskSidebarGroup = "merged" | "needsAction" | "openNoPr" | "awaitingReview" | "running";

export const TASK_SIDEBAR_GROUPS: Array<{ key: TaskSidebarGroup; label: string }> = [
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
    pullRequestStatus: PullRequestStatus | null;
    reviewState: string | null | undefined;
    taskStatus: string;
}): TaskSidebarGroup {
    const { checksConclusion, hasError, pullRequestStatus, reviewState, taskStatus } = params;

    if (taskStatus === "running") {
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

export function buildTaskSidebarGroups(params: {
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
            task.project_id ? projectsById.get(task.project_id)?.repo_url : null,
        );
        const pullRequest =
            projectRepository && task.branch
                ? (latestPullRequestByKey.get(`${projectRepository}::${task.branch}`) ?? null)
                : null;
        const pullRequestStatus = pullRequest ? getPullRequestStatus(pullRequest) : null;
        const groupKey = getSidebarGroupKey({
            taskStatus: task.status,
            pullRequestStatus,
            reviewState: pullRequest?.review_state,
            checksConclusion: pullRequest?.checks_conclusion,
            hasError: (task.error?.trim().length ?? 0) > 0,
        });
        groupedTasks[groupKey].push(task);
    }

    return groupedTasks;
}

export function getFirstSidebarTaskId(params: {
    projects: Project[];
    pullRequests: PullRequest[];
    tasks: Task[];
}): string | null {
    const groupedTasks = buildTaskSidebarGroups(params);

    for (const group of TASK_SIDEBAR_GROUPS) {
        const firstTask = groupedTasks[group.key][0];
        if (firstTask) {
            return firstTask.id;
        }
    }

    return null;
}
