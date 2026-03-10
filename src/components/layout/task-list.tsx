import { useLiveQuery } from "@tanstack/react-db";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CheckCheck,
  CircleAlert,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { projectsCollection, pullRequestsCollection, tasksCollection } from "../../lib/collections";
import { cn } from "../../lib/utils";
import { NewTaskButton } from "@/components/new-task-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteDesktopRunnerWorkspace } from "@/lib/desktop-runner";
import {
  buildTaskSidebarGroups,
  TASK_SIDEBAR_GROUPS,
  type TaskSidebarGroup,
} from "@/lib/task-sidebar";

const SIDEBAR_LAYOUT_EASE = [0.2, 0.8, 0.2, 1] as const;
const SIDEBAR_ENTER_EASE = [0.16, 1, 0.3, 1] as const;

function renderGroupIcon(group: TaskSidebarGroup) {
  switch (group) {
    case "merged":
      return <CheckCheck className="w-3 h-3" />;
    case "needsAction":
      return <CircleAlert className="w-3 h-3 text-destructive" />;
    case "openNoPr":
      return <MessageSquare className="w-3 h-3" />;
    case "awaitingReview":
      return <GitPullRequest className="w-3 h-3" />;
    case "running":
      return <Loader2 className="w-3 h-3 animate-spin" />;
  }
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

  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const shouldReduceMotion = useReducedMotion();
  const [deletingTask, setDeletingTask] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isSidebarLoading = isTasksLoading || isPullRequestsLoading;

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const groupedTasks = buildTaskSidebarGroups({ tasks, projects, pullRequests });
  const visibleGroups = isSidebarLoading
    ? TASK_SIDEBAR_GROUPS
    : TASK_SIDEBAR_GROUPS.filter((group) => groupedTasks[group.key].length > 0);

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
    const taskRecord = tasks.find((candidateTask) => candidateTask.id === deletingTaskId);
    const workspacePath = taskRecord?.workspace_path?.trim();

    setDeletingTask(true);
    setDeleteError(null);

    try {
      if (taskRecord?.runner_type === "local-worktree" && workspacePath) {
        await deleteDesktopRunnerWorkspace(workspacePath);
      }

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
        <NewTaskButton
          variant="ghost"
          size="icon-xs"
          iconOnly
          hotkeyEnabled
          className="text-muted-foreground shadow-none hover:border-transparent hover:shadow-none"
        />
      </div>

      <LayoutGroup>
        <nav className="neo-scroll flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-2 pb-24 md:pb-2">
          <AnimatePresence initial={false} mode="popLayout">
            {visibleGroups.map((group) => {
              const tasksInGroup = groupedTasks[group.key];

              return (
                <motion.div
                  key={group.key}
                  layout
                  className="space-y-1"
                  initial={shouldReduceMotion ? false : { opacity: 0, x: -14, y: 10 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, x: -10, y: -8 }}
                  transition={{
                    layout: { duration: 0.24, ease: SIDEBAR_LAYOUT_EASE },
                    duration: 0.26,
                    ease: SIDEBAR_ENTER_EASE,
                  }}
                >
                  <motion.p
                    layout="position"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-muted-foreground/90 uppercase tracking-[0.08em]"
                    transition={{ layout: { duration: 0.22, ease: SIDEBAR_LAYOUT_EASE } }}
                  >
                    {renderGroupIcon(group.key)}
                    <span>{group.label}</span>
                  </motion.p>
                  {isSidebarLoading ? (
                    Array.from({ length: 2 }).map((_, index) => (
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
                  ) : (
                    <AnimatePresence initial={false} mode="popLayout">
                      {tasksInGroup.map((task) => {
                        const isActive = pathname === `/tasks/${task.id}`;
                        const projectName = task.project_id
                          ? projectsById.get(task.project_id)?.name
                          : null;
                        const taskLabel = task.branch ?? task.title;
                        const secondaryLabel = projectName ?? null;

                        const shouldSkipDeleteConfirmation = group.key === "merged";

                        return (
                          <motion.div
                            key={task.id}
                            layout
                            layoutId={task.id}
                            className={cn(
                              "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[var(--radius-sm)] pr-1 transition-colors",
                              isActive
                                ? "bg-accent/70 text-accent-foreground"
                                : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                            )}
                            initial={shouldReduceMotion ? false : { opacity: 0, x: -12, y: 8 }}
                            animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
                            exit={shouldReduceMotion ? undefined : { opacity: 0, x: 12, y: -6 }}
                            transition={{
                              layout: { duration: 0.24, ease: SIDEBAR_LAYOUT_EASE },
                              duration: 0.22,
                              ease: SIDEBAR_ENTER_EASE,
                            }}
                          >
                            <Link
                              to="/tasks/$taskId"
                              params={{ taskId: task.id }}
                              className="min-w-0 px-2.5 py-2 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="truncate">{taskLabel}</p>
                                {secondaryLabel ? (
                                  <p
                                    className={cn(
                                      "truncate text-[11px]",
                                      isActive
                                        ? "text-accent-foreground/80"
                                        : "text-muted-foreground",
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
                                "shrink-0 text-muted-foreground shadow-none hover:border-transparent hover:text-destructive hover:shadow-none",
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
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {!isSidebarLoading && tasks.length === 0 ? (
            <div className="px-2 py-3 text-center">
              <p className="text-xs text-muted-foreground">No tasks yet</p>
            </div>
          ) : null}
        </nav>
      </LayoutGroup>

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
