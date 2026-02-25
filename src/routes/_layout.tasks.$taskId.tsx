import { Navigate, createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/pages/task-page";
import { and, eq, useLiveQuery } from "@tanstack/react-db";
import {
  projectsCollection,
  pullRequestsCollection,
  taskMessagesCollection,
  tasksCollection,
} from "@/lib/collections";
import { extractOrgRepoFromUrl, getPullRequestStatus } from "@/lib/pull-request";

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  loader: () => {
    if (typeof window === "undefined") {
      return;
    }

    return Promise.all([
      tasksCollection.preload(),
      projectsCollection.preload(),
      pullRequestsCollection.preload(),
      taskMessagesCollection.preload(),
    ]);
  },
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
    const taskRepository = openedTask?.project?.repo_url
      ? extractOrgRepoFromUrl(openedTask?.project?.repo_url)
      : null;

    const { data: pullRequestMatches, isLoading: isPullRequestLoading } = useLiveQuery(
      (q) =>
        q
          .from({ pr: pullRequestsCollection })
          .where(({ pr }) =>
            taskBranch && taskRepository
              ? and(eq(pr.branch, taskBranch), eq(pr.repository, taskRepository))
              : eq(pr.id, ""),
          )
          .orderBy(({ pr }) => pr.opened_at, "desc"),
      [taskBranch, taskRepository],
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
        streamId={openedTask.task.stream_id ?? null}
        pullRequest={
          pullRequest
            ? {
                prNumber: pullRequest.pr_number,
                url: `https://github.com/${pullRequest.repository}/pull/${pullRequest.pr_number}`,
                status: getPullRequestStatus(pullRequest),
                reviewState: pullRequest.review_state ?? null,
                checksState: pullRequest.checks_state ?? null,
                checksConclusion: pullRequest.checks_conclusion ?? null,
              }
            : null
        }
        error={openedTask.task.error ?? null}
        isRunning={openedTask.task.status === "running"}
        isPullRequestLoading={isPullRequestLoading}
      />
    );
  },
});
