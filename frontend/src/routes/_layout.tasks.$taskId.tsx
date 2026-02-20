import { Navigate, createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/pages/task-page";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { projectsCollection, taskMessagesCollection, tasksCollection } from "@/lib/collections";

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  loader: () =>
    Promise.all([
      tasksCollection.preload(),
      projectsCollection.preload(),
      taskMessagesCollection.preload(),
    ]),
  component: () => {
    const { taskId } = Route.useParams();
    const { data, isLoading } = useLiveQuery(
      (q) =>
        q
          .from({ task: tasksCollection })
          .where(({ task }) => eq(task.id, taskId))
          .join({ project: projectsCollection }, ({ project, task }) =>
            eq(project.id, task.project_id),
          ),
      [taskId],
    );

    const openedTask = data[0];
    if (isLoading) {
      return null;
    }

    if (!openedTask) {
      return <Navigate to="/" replace />;
    }

    return (
      <TaskPage
        key={taskId}
        taskId={taskId}
        title={openedTask.task.title}
        projectName={openedTask.project?.name ?? "No project"}
        branch={openedTask.task.branch ?? null}
        error={openedTask.task.error ?? null}
        isRunning={openedTask.task.status === "running"}
      />
    );
  },
});
