import { Navigate, createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/pages/task-page";
import { eq, useLiveQuery } from "@tanstack/react-db";
import {
  projectsCollection,
  pullRequestsCollection,
  taskMessagesCollection,
  tasksCollection,
} from "@/lib/collections";

type PullRequestStatus = "open" | "merged" | "closed" | "draft";

function getPullRequestStatus(pr: {
  state?: string;
  merged_at: bigint | null;
  ready_at: bigint | null;
}): PullRequestStatus {
  switch (pr.state) {
    case "draft":
      return "draft";
    case "closed":
      return "closed";
    case "merged":
      return "merged";
    case "open":
      return "open";
    default: {
      if (pr.merged_at !== null) {
        return "merged";
      }
      return pr.ready_at === null ? "draft" : "open";
    }
  }
}

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  loader: () =>
    Promise.all([
      tasksCollection.preload(),
      projectsCollection.preload(),
      pullRequestsCollection.preload(),
      taskMessagesCollection.preload(),
    ]),
  component: () => {
    const { taskId } = Route.useParams();
    const { data: taskRows, isLoading } = useLiveQuery(
      (q) =>
        q
          .from({ task: tasksCollection })
          .where(({ task }) => eq(task.id, taskId))
          .join({ project: projectsCollection }, ({ project, task }) =>
            eq(project.id, task.project_id),
          ),
      [taskId],
    );
    const openedTask = taskRows[0];
    const taskBranch = openedTask?.task.branch ?? null;
    const { data: pullRequestMatches } = useLiveQuery(
      (q) =>
        q
          .from({ pr: pullRequestsCollection })
          .where(({ pr }) => (taskBranch ? eq(pr.branch, taskBranch) : eq(pr.id, "")))
          .orderBy(({ pr }) => pr.opened_at, "desc"),
      [taskBranch],
    );

    const pullRequest = pullRequestMatches[0];
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
        pullRequest={
          pullRequest
            ? {
                prNumber: pullRequest.pr_number,
                url: `https://github.com/${pullRequest.repository}/pull/${pullRequest.pr_number}`,
                status: getPullRequestStatus(pullRequest),
              }
            : null
        }
        error={openedTask.task.error ?? null}
        isRunning={openedTask.task.status === "running"}
      />
    );
  },
});
