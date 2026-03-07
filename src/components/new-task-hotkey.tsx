import { useHotkey } from "@tanstack/react-hotkeys";
import { NEW_TASK_HOTKEY, useCreateNewTask } from "@/lib/use-create-new-task";

export function NewTaskHotkey() {
  const { canCreateTask, createNewTask } = useCreateNewTask();

  useHotkey(
    NEW_TASK_HOTKEY,
    () => {
      void createNewTask();
    },
    {
      enabled: canCreateTask,
      requireReset: true,
    },
  );

  return null;
}
