import { useState, type ComponentProps } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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
import { createDesktopRunnerSession } from "@/lib/desktop-runner";
import { hotkeys } from "@/lib/hotkeys";
import { useProjects } from "@/lib/use-projects";
import { TASKS_QUERY_KEY, useTasks } from "@/lib/use-tasks";
import { createTask, updateTask } from "@/server/functions/tasks";

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
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: projects = [] } = useProjects();
  const { data: tasks = [] } = useTasks();

  const [defaultProject] = projects;
  const hasProjects = projects.length > 0;
  const hasMultipleProjects = projects.length > 1;
  const singleProject = hasMultipleProjects ? undefined : defaultProject;
  const currentTaskId = pathname.startsWith("/tasks/") ? pathname.split("/")[2] : undefined;
  const currentTask = currentTaskId ? tasks.find((task) => task.id === currentTaskId) : undefined;
  const currentProject = currentTask?.project_id
    ? projects.find((project) => project.id === currentTask.project_id)
    : undefined;
  const hotkeyProject = currentProject ?? defaultProject;

  useHotkey(hotkeys.newTask.keys, () => handleNewTask(hotkeyProject), { enabled: hotkeyEnabled });

  function handleNewTask(project = defaultProject) {
    const repoUrl = project?.repo_url;
    if (creating || !project || !repoUrl) {
      return;
    }

    setCreating(true);

    const taskTitle = "New task";
    const taskId = crypto.randomUUID();

    void createTask({
      data: {
        id: taskId,
        title: taskTitle,
        projectId: project.id,
      },
    })
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
        navigate({ to: "/tasks/$taskId", params: { taskId } });
        setCreating(false);

        try {
          const response = await createDesktopRunnerSession(taskTitle, repoUrl);
          await updateTask({
            data: {
              taskId,
              runnerType: response.runnerType,
              workspacePath: response.workspaceDirectory,
              workspaceError: null,
              ...(response.sessionId.trim().length > 0
                ? { runnerSessionId: response.sessionId }
                : {}),
            },
          });
        } catch (err) {
          await updateTask({
            data: {
              taskId,
              workspaceError: err instanceof Error ? err.message : "Failed to create workspace",
            },
          });
        }

        await queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      })
      .catch(() => {
        setCreating(false);
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
