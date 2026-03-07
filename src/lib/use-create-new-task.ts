import { useState } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { projectsCollection, tasksCollection } from "@/lib/collections";
import { createDesktopRunnerSession } from "@/lib/desktop-runner";

export const NEW_TASK_HOTKEY = "Mod+N";

export function useCreateNewTask() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: projects } = useLiveQuery((query) =>
    query.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );

  const [defaultProject] = projects;
  const canCreateTask = !creating && Boolean(defaultProject?.repo_url);

  async function createNewTask() {
    const repoUrl = defaultProject?.repo_url;
    if (creating || !defaultProject || !repoUrl) {
      return;
    }

    setCreating(true);

    try {
      const taskTitle = "New task";
      const response = await createDesktopRunnerSession(taskTitle, repoUrl);
      const now = Date.now();
      const taskId = crypto.randomUUID();
      const tx = tasksCollection.insert({
        id: taskId,
        organization_id: defaultProject.organization_id,
        project_id: defaultProject.id,
        title: taskTitle,
        status: "open",
        stream_id: null,
        branch: null,
        runner_type: response.runnerType,
        runner_session_id: response.sessionId,
        workspace_path: response.workspaceDirectory,
        error: null,
        created_at: BigInt(now),
        updated_at: BigInt(now),
      });

      navigate({ to: "/tasks/$taskId", params: { taskId } });
      await tx.isPersisted.promise;
    } finally {
      setCreating(false);
    }
  }

  return {
    canCreateTask,
    createNewTask,
    creating,
  };
}
