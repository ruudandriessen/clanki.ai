import { useState, type ComponentType, type SVGProps } from "react";
import { ChevronRight } from "lucide-react";
import type { TaskStreamActivityItem } from "@/components/task-stream-activity";
import { cn } from "@/lib/utils";

type ActivityIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function TaskStreamActivityRow({
  icon: Icon,
  item,
}: {
  icon: ActivityIcon;
  item: TaskStreamActivityItem;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasExpandableDetails =
    (item.detailSections?.length ?? 0) > 0 || (item.details?.length ?? 0) > 0;
  const { action, details } = splitActivityLabel(item.label);

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border/50 bg-muted/25 px-2.5 py-2 text-xs">
      <Icon
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          item.spinning ? "animate-spin" : "",
          item.tone === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
          <span className="text-[11px] font-medium text-muted-foreground">{action}</span>
          {item.summary ? null : details ? (
            <span className="text-muted-foreground">{details}</span>
          ) : null}
        </div>
        {item.summary ? (
          hasExpandableDetails ? (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
              className="mt-0.5 flex min-w-0 items-start gap-1 text-left text-foreground transition-colors hover:text-foreground/80"
            >
              <ChevronRight
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  expanded && "rotate-90",
                )}
              />
              <span className="min-w-0 whitespace-pre-wrap break-words font-medium">
                {item.summary}
              </span>
            </button>
          ) : (
            <div className="mt-0.5 whitespace-pre-wrap break-words font-medium text-foreground">
              {item.summary}
            </div>
          )
        ) : null}
        {item.badges && item.badges.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {item.badges.map((badge) => (
              <span
                key={`${item.id}-${badge}`}
                className="rounded-sm border border-border/60 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        {!item.summary && item.details && item.details.length > 0 ? (
          <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {item.details.map((detail) => (
              <div
                key={`${item.id}-${detail}`}
                className={cn(
                  "whitespace-pre-wrap break-words",
                  item.tone === "error" && "text-destructive/80",
                )}
              >
                {detail}
              </div>
            ))}
          </div>
        ) : null}
        {item.summary && hasExpandableDetails && expanded ? (
          <div className="mt-2 space-y-2 rounded-sm border border-border/60 bg-background/80 p-2">
            {item.detailSections?.map((section) => (
              <div key={`${item.id}-${section.label}`} className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {section.label}
                </div>
                <div
                  className={cn(
                    "whitespace-pre-wrap break-words text-[11px] text-foreground",
                    section.code && "overflow-x-auto rounded-sm bg-muted/40 px-2 py-1 font-mono",
                  )}
                >
                  {section.value}
                </div>
              </div>
            ))}
            {item.details?.map((detail) => (
              <div
                key={`${item.id}-${detail}`}
                className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground"
              >
                {detail}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function splitActivityLabel(label: string): { action: string; details: string } {
  const normalized = label.trim();
  if (normalized.length === 0) {
    return { action: "", details: "" };
  }

  const colonIndex = normalized.indexOf(":");
  if (colonIndex > 0) {
    return {
      action: toSentenceCase(normalized.slice(0, colonIndex).trim()),
      details: normalized.slice(colonIndex + 1).trim(),
    };
  }

  const [firstWord, ...rest] = normalized.split(" ");
  return {
    action: toSentenceCase(firstWord),
    details: rest.join(" "),
  };
}

function toSentenceCase(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
