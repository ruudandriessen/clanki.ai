import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2, Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "../../lib/utils";
import { createTask } from "../../lib/api";
import { projectsCollection, queryClient, tasksCollection } from "../../lib/collections";

export function TaskList() {
  const { data: tasks, isLoading } = useLiveQuery((query) => query.from({ t: tasksCollection }));
  const { data: projects } = useLiveQuery((query) => query.from({ p: projectsCollection }));
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [creating, setCreating] = useState(false);

  const defaultProject = projects?.[0];

  async function handleNewTask() {
    if (creating || !defaultProject) return;
    setCreating(true);
    try {
      const task = await createTask("New task", defaultProject.id);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
    } finally {
      setCreating(false);
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
              <Link
                key={task.id}
                to="/tasks/$taskId"
                params={{ taskId: task.id }}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors truncate",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{task.title}</span>
              </Link>
            );
          })
        )}
      </nav>
    </div>
  );
}
