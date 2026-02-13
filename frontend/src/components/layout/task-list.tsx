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
import { createTask, deleteTask } from "../../lib/api";
import { projectsCollection, tasksCollection } from "../../lib/collections";

export function TaskList() {
  const { data: tasks, isLoading } = useLiveQuery((query) => query.from({ t: tasksCollection }));
  const { data: projects } = useLiveQuery((query) => query.from({ p: projectsCollection }));
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [creating, setCreating] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const defaultProject = projects?.[0];

  async function handleNewTask() {
    if (creating || !defaultProject) return;
    setCreating(true);
    try {
      const { data: task, txid } = await createTask("New task", defaultProject.id);
      if (txid !== undefined) {
        await tasksCollection.utils.awaitTxId(txid);
      }
      navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
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
      const { txid } = await deleteTask(deletingTaskId);
      if (txid !== undefined) {
        await tasksCollection.utils.awaitTxId(txid);
      }
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
        ) : !tasks || tasks.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-xs text-muted-foreground">No tasks yet</p>
          </div>
        ) : (
          tasks.map((task) => {
            const isActive = pathname === `/tasks/${task.id}`;
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
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-sm"
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{task.title}</span>
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
