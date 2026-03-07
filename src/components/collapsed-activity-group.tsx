import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { TaskStreamActivity, type TaskStreamActivityItem } from "@/components/task-stream-activity";
import { cn } from "@/lib/utils";

export function CollapsedActivityGroup({ items }: { items: TaskStreamActivityItem[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
          />
          <Wrench className="h-3.5 w-3.5 shrink-0" />
          <span>
            {items.length} tool {items.length === 1 ? "call" : "calls"}
          </span>
        </button>
        {expanded ? (
          <div className="mt-1.5 ml-2.5">
            <TaskStreamActivity items={items} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
