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

  function handleNewTask() {
    const repoUrl = defaultProject?.repo_url;
    if (creating || !defaultProject || !repoUrl) {
      return;
    }

    setCreating(true);

    const taskTitle = "New task";
    const now = Date.now();
    const taskId = crypto.randomUUID();
    tasksCollection.insert({
      id: taskId,
      organization_id: defaultProject.organization_id,
      project_id: defaultProject.id,
      title: taskTitle,
      status: "open",
      stream_id: null,
      branch: null,
      runner_type: null,
      runner_session_id: null,
      workspace_path: null,
      error: null,
      created_at: BigInt(now),
      updated_at: BigInt(now),
    });

    navigate({ to: "/tasks/$taskId", params: { taskId } });
    setCreating(false);

    createDesktopRunnerSession(taskTitle, repoUrl)
      .then((response) => {
        tasksCollection.update(taskId, (draft) => {
          draft.runner_type = response.runnerType;
          draft.runner_session_id = response.sessionId;
          draft.workspace_path = response.workspaceDirectory;
        });
      })
      .catch((err) => {
        tasksCollection.update(taskId, (draft) => {
          draft.error = err instanceof Error ? err.message : "Failed to create workspace";
        });
      });
  }

  return (
    <Button
      type="button"
      title={title ?? "New task"}
      disabled={creating || !defaultProject}
      onClick={() => handleNewTask()}
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
