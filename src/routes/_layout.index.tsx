import { useEffect } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { NewTaskButton } from "@/components/new-task-button";
import { projectsCollection, pullRequestsCollection, tasksCollection } from "@/lib/collections";
import { getFirstSidebarTaskId } from "@/lib/task-sidebar";

export const Route = createFileRoute("/_layout/")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const { data: tasks, isLoading: isTasksLoading } = useLiveQuery((query) =>
    query.from({ t: tasksCollection }).orderBy(({ t }) => t.updated_at, "desc"),
  );
  const { data: projects } = useLiveQuery((query) =>
    query.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );
  const { data: pullRequests, isLoading: isPullRequestsLoading } = useLiveQuery((query) =>
    query.from({ pr: pullRequestsCollection }).orderBy(({ pr }) => pr.opened_at, "desc"),
  );

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
