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
import { projectsCollection, tasksCollection } from "../../lib/collections";

export function TaskList() {
  const { data: tasks, isLoading } = useLiveQuery((query) =>
    query.from({ t: tasksCollection }).orderBy(({ t }) => t.updated_at, "desc"),
  );
  const { data: projects } = useLiveQuery((query) =>
    query.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [creating, setCreating] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [defaultProject] = projects;
  const projectsById = new Map(projects.map((project) => [project.id, project]));

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

  async function handleDeleteTask() {
    if (!taskToDelete || deletingTask) {
      return;
    }

    const deletingTaskId = taskToDelete.id;

    setDeletingTask(true);
    setDeleteError(null);

    try {
      tasksCollection.delete(deletingTaskId);
      setTaskToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setDeletingTask(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
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

      <nav className="neo-scroll flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-xs text-muted-foreground">No tasks yet</p>
          </div>
        ) : (
          tasks.map((task) => {
            const isActive = pathname === `/tasks/${task.id}`;
            const projectName = task.project_id ? projectsById.get(task.project_id)?.name : null;
            const secondaryLabel =
              projectName && task.branch
                ? `${projectName} - ${task.branch}`
                : (projectName ?? task.branch);
            const hasError = (task.error?.trim().length ?? 0) > 0;
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
                    <p className="truncate">{task.title}</p>
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
                    setTaskToDelete({ id: task.id, title: task.title });
                    setDeleteError(null);
                  }}
                  title={`Delete ${task.title}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })
        )}
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
