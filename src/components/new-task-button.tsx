import { useState, type ComponentProps } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const hasProjects = projects.length > 0;
  const hasMultipleProjects = projects.length > 1;
  const singleProject = hasMultipleProjects ? undefined : defaultProject;

  useHotkey(hotkeys.newTask.keys, () => handleNewTask(), { enabled: hotkeyEnabled });

  function handleNewTask(project = defaultProject) {
    const repoUrl = project?.repo_url;
    if (creating || !project || !repoUrl) {
      return;
    }

    setCreating(true);

    const taskTitle = "New task";
    const now = Date.now();
    const taskId = crypto.randomUUID();
    tasksCollection.insert({
      id: taskId,
      organization_id: project.organization_id,
      project_id: project.id,
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
      disabled={creating || !hasProjects || (!hasMultipleProjects && !singleProject?.repo_url)}
      onClick={hasMultipleProjects ? undefined : () => handleNewTask(singleProject)}
      {...props}
    >
      {icon}
      {iconOnly ? null : (
        <>
          <span>New task</span>
          {hasMultipleProjects ? <ChevronDown className="w-3.5 h-3.5" /> : null}
          {hasMultipleProjects ? null : <Kbd keys={hotkeys.newTask.keys} />}
        </>
      )}
    </Button>
  );

  if (hasMultipleProjects) {
    const content = (
      <DropdownMenuContent align={iconOnly ? "end" : "start"} className="min-w-56">
        <DropdownMenuLabel>Select project</DropdownMenuLabel>
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            disabled={creating || !project.repo_url}
            onSelect={() => handleNewTask(project)}
          >
            {project.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    );

    if (iconOnly) {
      return (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <span className="flex items-center gap-2">
                {hotkeys.newTask.label}
                <Kbd keys={hotkeys.newTask.keys} />
              </span>
            </TooltipContent>
          </Tooltip>
          {content}
        </DropdownMenu>
      );
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
        {content}
      </DropdownMenu>
    );
  }

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
