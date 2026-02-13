import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2 } from "lucide-react";
import { tasksCollection } from "../lib/collections";

export function IndexRedirect() {
  const { data: tasks, isLoading } = useLiveQuery((q) => q.from({ t: tasksCollection }));
  const sortedTasks = tasks
    ? [...tasks].toSorted((a, b) => {
        const updatedDiff = b.updatedAt - a.updatedAt;
        if (updatedDiff !== 0) {
          return updatedDiff;
        }
        return a.id.localeCompare(b.id);
      })
    : tasks;
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (sortedTasks && sortedTasks.length > 0) {
      navigate({
        to: "/tasks/$taskId",
        params: { taskId: sortedTasks[0].id },
        replace: true,
      });
    }
    // If no tasks, stay on the index page — sidebar shows "No tasks yet"
  }, [isLoading, sortedTasks, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-4">
      <p className="text-sm">Create a new task to get started</p>
      <p className="text-xs">Use the + button in the sidebar to create your first task.</p>
    </div>
  );
}
