import type { ComponentProps } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateNewTask } from "@/lib/use-create-new-task";

type ButtonProps = ComponentProps<typeof Button>;

type NewTaskButtonProps = Omit<ButtonProps, "children" | "disabled" | "onClick"> & {
  iconOnly?: boolean;
};

export function NewTaskButton({ iconOnly = false, title, ...props }: NewTaskButtonProps) {
  const { canCreateTask, createNewTask, creating } = useCreateNewTask();

  return (
    <Button
      type="button"
      title={title ?? "New task (Cmd/Ctrl+N)"}
      disabled={!canCreateTask}
      onClick={() => void createNewTask()}
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
