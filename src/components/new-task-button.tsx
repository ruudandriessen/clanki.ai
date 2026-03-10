import { useLiveQuery } from "@tanstack/react-db";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { projectsCollection, tasksCollection } from "@/lib/collections";
import { createDesktopRunnerSession } from "@/lib/desktop-runner";
import { hotkeys } from "@/lib/hotkeys";

type ButtonProps = ComponentProps<typeof Button>;

type NewTaskButtonProps = Omit<ButtonProps, "children" | "disabled" | "onClick"> & {
  iconOnly?: boolean;
  hotkeyEnabled?: boolean;
};

export function NewTaskButton({
  iconOnly = false,
  hotkeyEnabled = false,
  ...props
}: NewTaskButtonProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: projects } = useLiveQuery((query) =>
    query.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );

  const [defaultProject] = projects;

  useHotkey(hotkeys.newTask.keys, () => handleNewTask(), { enabled: hotkeyEnabled });

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

  const icon = creating ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
  ) : (
    <Plus className="w-3.5 h-3.5" />
  );

  const button = (
    <Button
      type="button"
      disabled={creating || !defaultProject}
      onClick={() => handleNewTask()}
      {...props}
    >
      {icon}
      {iconOnly ? null : (
        <>
          <span>New task</span>
          <Kbd keys={hotkeys.newTask.keys} />
        </>
      )}
    </Button>
  );

  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <span className="flex items-center gap-2">
            {hotkeys.newTask.label}
            <Kbd keys={hotkeys.newTask.keys} />
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
