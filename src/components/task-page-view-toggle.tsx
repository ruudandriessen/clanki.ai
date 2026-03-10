import { Code2, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TaskPageViewToggleProps {
  onViewModeChange: (mode: "chat" | "code") => void;
  showCodeMode: boolean;
  viewMode: "chat" | "code";
}

export function TaskPageViewToggle({
  onViewModeChange,
  showCodeMode,
  viewMode,
}: TaskPageViewToggleProps) {
  if (!showCodeMode) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-border bg-muted/55 p-1">
      <Button
        type="button"
        variant={viewMode === "chat" ? "secondary" : "ghost"}
        size="xs"
        className={cn(
          "h-7 rounded-[calc(var(--radius-sm)-2px)] px-2.5 shadow-none",
          viewMode !== "chat" &&
            "border-transparent hover:border-transparent hover:bg-background/70",
        )}
        onClick={() => onViewModeChange("chat")}
      >
        <MessagesSquare className="h-3 w-3" />
        Chat
      </Button>
      <Button
        type="button"
        variant={viewMode === "code" ? "secondary" : "ghost"}
        size="xs"
        className={cn(
          "h-7 rounded-[calc(var(--radius-sm)-2px)] px-2.5 shadow-none",
          viewMode !== "code" &&
            "border-transparent hover:border-transparent hover:bg-background/70",
        )}
        onClick={() => onViewModeChange("code")}
      >
        <Code2 className="h-3 w-3" />
        Code
      </Button>
    </div>
  );
}
