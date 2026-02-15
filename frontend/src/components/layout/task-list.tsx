import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";
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

function getTaskLabel(task: { title: string; branch?: string | null }): string {
  const branch = task.branch?.trim();
  if (branch && branch.length > 0) {
    return branch;
  }

  return task.title;
}

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
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; label: string } | null>(null);
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
        branch: null,
        status: "open",
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
    const isDeletingActiveTask = pathname === `/tasks/${deletingTaskId}`;

    setDeletingTask(true);
    setDeleteError(null);

    try {
      const tx = tasksCollection.delete(deletingTaskId);
      await tx.isPersisted.promise;

      if (isDeletingActiveTask) {
        navigate({ to: "/", replace: true });
      }
      setTaskToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Failed to delete task");
    } finally {
      setDeletingTask(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Tasks
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleNewTask}
          disabled={creating || !defaultProject}
          className="text-muted-foreground"
          title="New task"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
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
            const taskLabel = getTaskLabel(task);
            return (
              <div
                key={task.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Link
                  to="/tasks/$taskId"
                  params={{ taskId: task.id }}
                  className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-sm"
                >
                  {task.status === "running" ? (
                    <Loader2 className="mt-0.5 w-3.5 h-3.5 shrink-0 animate-spin" />
                  ) : (
                    <MessageSquare className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{taskLabel}</p>
                    {projectName ? (
                      <p
                        className={cn(
                          "truncate text-[11px]",
                          isActive ? "text-accent-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {projectName}
                      </p>
                    ) : null}
                  </div>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    "mr-1 shrink-0 text-muted-foreground hover:text-destructive",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                  onClick={() => {
                    setTaskToDelete({ id: task.id, label: taskLabel });
                    setDeleteError(null);
                  }}
                  title={`Delete ${taskLabel}`}
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
                {taskToDelete?.label ?? "this task"}
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
