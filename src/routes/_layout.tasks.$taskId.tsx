import { Navigate, createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/pages/task-page";
import { extractOrgRepoFromUrl, getPullRequestStatus } from "@/lib/pull-request";
import { useProjectPullRequests } from "@/lib/use-project-pull-requests";
import { useProjects } from "@/lib/use-projects";
import { useTasks } from "@/lib/use-tasks";

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  component: () => {
    const { taskId } = Route.useParams();
    const { data: tasks = [], isLoading: isTasksLoading } = useTasks(3_000);
    const { data: projects = [] } = useProjects();
    const { data: pullRequests = [] } = useProjectPullRequests();
    const task = tasks.find((candidate) => candidate.id === taskId);
    const project = task?.project_id
      ? projects.find((candidate) => candidate.id === task.project_id)
      : undefined;
    const taskRepository = extractOrgRepoFromUrl(project?.repo_url ?? null);
    const pullRequest =
      taskRepository && task?.branch
        ? pullRequests.find(
            (candidate) =>
              candidate.repository === taskRepository && candidate.branch === task.branch,
          )
        : undefined;

    if (!isTasksLoading && !task) {
      return <Navigate to="/" replace />;
    }

    return (
      <TaskPage
        key={taskId}
        taskId={taskId}
        title={task?.title ?? "New task"}
        branchName={task?.branch ?? null}
        projectName={project?.name ?? ""}
        pullRequest={
          pullRequest
            ? {
                prNumber: pullRequest.pr_number,
                url: pullRequest.url,
                status: getPullRequestStatus(pullRequest),
                reviewState: pullRequest.review_state,
                checksCount: pullRequest.checks_count,
                checksCompletedCount: pullRequest.checks_completed_count,
                checksState: pullRequest.checks_state,
                checksConclusion: pullRequest.checks_conclusion,
              }
            : null
        }
        error={task?.error ?? null}
        isRunning={task?.is_running ?? false}
        runnerSessionId={task?.runner_session_id ?? null}
        runnerType={task?.runner_type ?? null}
        workspacePath={task?.workspace_path ?? null}
      />
    );
  },
});
