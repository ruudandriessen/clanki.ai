import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2 } from "lucide-react";
import { tasksCollection } from "../lib/collections";

export function IndexRedirect() {
  const { data: tasks, isLoading } = useLiveQuery((q) =>
    q.from({ t: tasksCollection }).orderBy(({ t }) => t.updated_at, "desc"),
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (tasks.length > 0) {
      navigate({
        to: "/tasks/$taskId",
        params: { taskId: tasks[0].id },
        replace: true,
      });
    }
    // If no tasks, stay on the index page — sidebar shows "No tasks yet"
  }, [isLoading, tasks, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-muted-foreground">
      <div className="neo-surface max-w-md rounded-[var(--radius-md)] p-5 text-center">
        <p className="text-sm text-foreground">Create a new task to get started</p>
        <p className="mt-2 text-xs">Use the + button in the sidebar to create your first task.</p>
      </div>
    </div>
  );
}
