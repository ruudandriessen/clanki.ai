import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { NewTaskButton } from "@/components/new-task-button";
import { getFirstSidebarTaskId } from "@/lib/task-sidebar";
import { useProjectPullRequests } from "@/lib/use-project-pull-requests";
import { useProjects } from "@/lib/use-projects";
import { useTasks } from "@/lib/use-tasks";

export const Route = createFileRoute("/_layout/")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { data: tasks = [], isLoading: isTasksLoading } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: pullRequests = [], isLoading: isPullRequestsLoading } = useProjectPullRequests();

  const isLoading = isTasksLoading || isPullRequestsLoading;
  const firstTaskId = getFirstSidebarTaskId({ tasks, projects, pullRequests });

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!firstTaskId) {
      return;
    }

    navigate({
      to: "/tasks/$taskId",
      params: { taskId: firstTaskId },
      replace: true,
    });
  }, [firstTaskId, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (firstTaskId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="neo-surface rounded-(--radius-md) p-6 text-center">
        <NewTaskButton size="default" />
      </div>
    </div>
  );
}
