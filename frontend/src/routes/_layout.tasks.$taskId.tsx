import { createFileRoute } from "@tanstack/react-router";
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
    const {
      data: [result],
    } = useLiveQuery(
      (q) =>
        q
          .from({ task: tasksCollection })
          .join({ project: projectsCollection }, ({ project, task }) =>
            eq(project.id, task.project_id),
          ),
      [taskId],
    );

    return (
      <TaskPage
        key={taskId}
        taskId={taskId}
        title={result.task.title}
        projectName={result.project?.name ?? "No project"}
      />
    );
  },
});
