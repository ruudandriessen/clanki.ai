import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { CircleAlert, Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "../../lib/utils";
import { projectsCollection, pullRequestsCollection, tasksCollection } from "../../lib/collections";
import {
  extractOrgRepoFromUrl,
  getPullRequestStatus,
  type PullRequestStatus,
} from "../../lib/pull-request";

type TaskSidebarGroup = "merged" | "needsAction" | "openNoPr" | "awaitingReview" | "running";

const SIDEBAR_GROUPS: Array<{ key: TaskSidebarGroup; label: string }> = [
  { key: "merged", label: "Merged" },
  { key: "needsAction", label: "Needs action" },
  { key: "openNoPr", label: "Open (no PR)" },
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
  taskStatus: string;
  pullRequestStatus: PullRequestStatus | null;
  reviewState: string | null | undefined;
  checksConclusion: string | null | undefined;
  hasError: boolean;
}): TaskSidebarGroup {
  const { taskStatus, pullRequestStatus, reviewState, checksConclusion, hasError } = params;

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

export function TaskList() {
  const { data: tasks, isLoading: isTasksLoading } = useLiveQuery((query) =>
    query.from({ t: tasksCollection }).orderBy(({ t }) => t.updated_at, "desc"),
  );
  const { data: projects } = useLiveQuery((query) =>
    query.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );
  const { data: pullRequests, isLoading: isPullRequestsLoading } = useLiveQuery((query) =>
    query.from({ pr: pullRequestsCollection }).orderBy(({ pr }) => pr.opened_at, "desc"),
  );
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [creating, setCreating] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isSidebarLoading = isTasksLoading || isPullRequestsLoading;

  const [defaultProject] = projects;
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const latestPullRequestByKey = new Map<string, (typeof pullRequests)[number]>();

  for (const pullRequest of pullRequests) {
    if (!pullRequest.branch) {
      continue;
    }

    const pullRequestKey = `${pullRequest.repository}::${pullRequest.branch}`;
    if (!latestPullRequestByKey.has(pullRequestKey)) {
      latestPullRequestByKey.set(pullRequestKey, pullRequest);
    }
  }

  const groupedTasks: Record<TaskSidebarGroup, Array<(typeof tasks)[number]>> = {
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

  async function handleNewTask() {
    if (creating || !defaultProject) return;
    setCreating(true);
    try {
      const now = Date.now();
      const task = {
        id: crypto.randomUUID(),
        organization_id: defaultProject.organization_id,
        project_id: defaultProject.id,
        title: "New task",
        status: "open",
        stream_id: null,
        branch: null,
        error: null,
        created_at: BigInt(now),
        updated_at: BigInt(now),
      };

      const tx = tasksCollection.insert(task);
      navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
      await tx.isPersisted.promise;
    } finally {
      setCreating(false);
    }
  }

  function handleDeleteDialogOpenChange(open: boolean) {
    if (deletingTask) {
      return;
    }

    if (!open) {
      setTaskToDelete(null);
      setDeleteError(null);
    }
  }

  async function handleDeleteTask(task?: { id: string }) {
    const targetTask = task ?? taskToDelete;

    if (!targetTask || deletingTask) {
      return;
    }

    const deletingTaskId = targetTask.id;

    setDeletingTask(true);
    setDeleteError(null);

    try {
      tasksCollection.delete(deletingTaskId);
      setTaskToDelete((currentTask) => (currentTask?.id === deletingTaskId ? null : currentTask));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setDeletingTask(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-3">
        <p className="text-[11px] font-bold text-foreground/90 uppercase tracking-[0.08em]">
          Tasks
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleNewTask}
          disabled={creating || !defaultProject}
          className="text-muted-foreground shadow-none hover:border-transparent hover:shadow-none"
          title="New task"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      <nav className="neo-scroll flex-1 space-y-3 overflow-y-auto px-2 pb-2">
        {SIDEBAR_GROUPS.map((group) => {
          const tasksInGroup = groupedTasks[group.key];

          return (
            <div key={group.key} className="space-y-1">
              <p className="px-2.5 py-1 text-[10px] font-bold text-muted-foreground/90 uppercase tracking-[0.08em]">
                {group.label}
              </p>
              {isSidebarLoading
                ? Array.from({ length: 2 }).map((_, index) => (
                    <div
                      key={`${group.key}-skeleton-${index}`}
                      className="mx-2.5 flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2"
                    >
                      <div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-sm bg-muted" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="h-3 w-3/4 animate-pulse rounded-sm bg-muted" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded-sm bg-muted/80" />
                      </div>
                    </div>
                  ))
                : tasksInGroup.map((task) => {
                    const isActive = pathname === `/tasks/${task.id}`;
                    const projectName = task.project_id
                      ? projectsById.get(task.project_id)?.name
                      : null;
                    const taskLabel = task.branch ?? task.title;
                    const secondaryLabel = projectName ?? null;
                    const hasError = (task.error?.trim().length ?? 0) > 0;

                    const shouldSkipDeleteConfirmation = group.key === "merged";

                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "group flex items-center gap-1 rounded-[var(--radius-sm)] transition-colors",
                          isActive
                            ? "bg-accent/70 text-accent-foreground"
                            : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                        )}
                      >
                        <Link
                          to="/tasks/$taskId"
                          params={{ taskId: task.id }}
                          className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-sm"
                        >
                          {hasError ? (
                            <CircleAlert className="mt-0.5 w-3.5 h-3.5 shrink-0 text-destructive" />
                          ) : task.status === "running" ? (
                            <Loader2 className="mt-0.5 w-3.5 h-3.5 shrink-0 animate-spin" />
                          ) : (
                            <MessageSquare className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{taskLabel}</p>
                            {secondaryLabel ? (
                              <p
                                className={cn(
                                  "truncate text-[11px]",
                                  isActive ? "text-accent-foreground/80" : "text-muted-foreground",
                                )}
                              >
                                {secondaryLabel}
                              </p>
                            ) : null}
                          </div>
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className={cn(
                            "mr-1 shrink-0 text-muted-foreground shadow-none hover:border-transparent hover:text-destructive hover:shadow-none",
                            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                          )}
                          onClick={() => {
                            if (shouldSkipDeleteConfirmation) {
                              void handleDeleteTask({ id: task.id });
                              return;
                            }

                            setTaskToDelete({ id: task.id, title: taskLabel });
                            setDeleteError(null);
                          }}
                          title={`Delete ${taskLabel}`}
                          disabled={deletingTask}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })}
            </div>
          );
        })}
        {!isSidebarLoading && tasks.length === 0 ? (
          <div className="px-2 py-3 text-center">
            <p className="text-xs text-muted-foreground">No tasks yet</p>
          </div>
        ) : null}
      </nav>

      <Dialog open={taskToDelete !== null} onOpenChange={handleDeleteDialogOpenChange}>
        <DialogContent className="max-w-md" showCloseButton={!deletingTask}>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">
                {taskToDelete?.title ?? "this task"}
              </span>{" "}
              and all related messages and runs.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-xs text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTaskToDelete(null)}
              disabled={deletingTask}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteTask()}
              disabled={deletingTask}
            >
              {deletingTask ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Delete task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
