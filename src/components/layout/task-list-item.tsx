import { Link } from "@tanstack/react-router";
import { motion, type Transition } from "motion/react";
import {
  CheckCheck,
  CircleAlert,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTaskSidebarGroupLabel, type TaskSidebarGroup } from "@/lib/task-sidebar";

const SIDEBAR_LAYOUT_EASE = [0.2, 0.8, 0.2, 1] as const;
const SIDEBAR_ENTER_EASE = [0.16, 1, 0.3, 1] as const;

function renderGroupIcon(group: TaskSidebarGroup) {
  switch (group) {
    case "merged":
      return <CheckCheck className="w-3 h-3" />;
    case "needsAction":
      return <CircleAlert className="w-3 h-3 text-destructive" />;
    case "openNoPr":
      return <MessageSquare className="w-3 h-3" />;
    case "awaitingReview":
      return <GitPullRequest className="w-3 h-3" />;
    case "running":
      return <Loader2 className="w-3 h-3 animate-spin" />;
  }
}

const rowTransition = {
  layout: { duration: 0.24, ease: SIDEBAR_LAYOUT_EASE },
  duration: 0.22,
  ease: SIDEBAR_ENTER_EASE,
} satisfies Transition;

export function TaskListItem({
  deletingTask,
  groupKey,
  isActive,
  onDeleteClick,
  secondaryLabel,
  shouldReduceMotion,
  taskId,
  taskLabel,
}: {
  deletingTask: boolean;
  groupKey: TaskSidebarGroup;
  isActive: boolean;
  onDeleteClick: () => void;
  secondaryLabel: string | null;
  shouldReduceMotion: boolean | null;
  taskId: string;
  taskLabel: string;
}) {
  const statusLabel = getTaskSidebarGroupLabel(groupKey);

  return (
    <motion.div
      layout
      layoutId={taskId}
      className={cn(
        "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-[var(--radius-sm)] pr-1 transition-colors",
        isActive
          ? "bg-accent/70 text-accent-foreground"
          : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
      )}
      initial={shouldReduceMotion ? false : { opacity: 0, x: -12, y: 8 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0, x: 12, y: -6 }}
      transition={rowTransition}
    >
      <Link
        to="/tasks/$taskId"
        params={{ taskId }}
        className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-sm"
      >
        <span
          className={cn(
            "shrink-0",
            isActive ? "text-accent-foreground/80" : "text-muted-foreground/80",
          )}
          title={statusLabel}
          aria-label={statusLabel}
        >
          {renderGroupIcon(groupKey)}
        </span>
        <div className="min-w-0">
          <p className="truncate">{taskLabel}</p>
          {secondaryLabel ? (
            <p
              className={cn(
                "truncate text-[11px]",
                isActive ? "text-accent-foreground/80" : "text-muted-foreground",
              )}
            >
              {secondaryLabel}
            </p>
          ) : null}
        </div>
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          "shrink-0 text-muted-foreground shadow-none hover:border-transparent hover:text-destructive hover:shadow-none",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={onDeleteClick}
        title={`Delete ${taskLabel}`}
        disabled={deletingTask}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </motion.div>
  );
}
