import { useState, type ComponentProps } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectsCollection, tasksCollection } from "@/lib/collections";
import { createDesktopRunnerSession } from "@/lib/desktop-runner";

type ButtonProps = ComponentProps<typeof Button>;

type NewTaskButtonProps = Omit<ButtonProps, "children" | "disabled" | "onClick"> & {
  iconOnly?: boolean;
};

export function NewTaskButton({ iconOnly = false, title, ...props }: NewTaskButtonProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: projects } = useLiveQuery((query) =>
    query.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );

  const [defaultProject] = projects;

  async function handleNewTask() {
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

  return (
    <Button
      type="button"
      title={title ?? "New task"}
      disabled={creating || !defaultProject}
      onClick={() => void handleNewTask()}
      {...props}
    >
      {creating ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Plus className="w-3.5 h-3.5" />
      )}
      {iconOnly ? null : <span>New task</span>}
    </Button>
  );
}
