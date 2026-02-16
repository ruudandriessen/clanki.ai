import {
  AlertCircle,
  Check,
  FileText,
  Globe,
  Lightbulb,
  Loader2,
  Shield,
  Terminal,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TaskStreamActivityIcon =
  | "thinking"
  | "file"
  | "web"
  | "terminal"
  | "tool"
  | "status"
  | "success"
  | "permission"
  | "error";

export interface TaskStreamActivityItem {
  id: string;
  icon: TaskStreamActivityIcon;
  label: string;
  tone?: "default" | "muted" | "error" | "success";
  spinning?: boolean;
}

export function TaskStreamActivity({ items }: { items: TaskStreamActivityItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = getActivityIcon(item.icon);
          const { action, details } = splitActivityLabel(item.label);
          return (
            <div key={item.id} className="flex items-start gap-2 py-0.5 text-xs">
              <Icon
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  item.spinning ? "animate-spin" : "",
                  item.tone === "error" ? "text-destructive" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "whitespace-pre-wrap",
                  item.tone === "error" ? "text-destructive" : "text-foreground",
                )}
              >
                {action}
              </span>
              {details ? (
                <span
                  className={cn(
                    "whitespace-pre-wrap text-muted-foreground",
                    item.tone === "error" && "text-destructive/80",
                  )}
                >
                  {details}
                </span>
              ) : null}
            </div>
          );
        })}
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
    const action = normalized.slice(0, colonIndex).trim();
    const details = normalized.slice(colonIndex + 1).trim();
    return {
      action: toSentenceCase(action),
      details: details.length > 0 ? ` ${details}` : "",
    };
  }

  const [firstWord, ...rest] = normalized.split(" ");
  return {
    action: toSentenceCase(firstWord),
    details: rest.length > 0 ? ` ${rest.join(" ")}` : "",
  };
}

function toSentenceCase(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function getActivityIcon(kind: TaskStreamActivityIcon) {
  switch (kind) {
    case "thinking":
      return Lightbulb;
    case "file":
      return FileText;
    case "web":
      return Globe;
    case "terminal":
      return Terminal;
    case "permission":
      return Shield;
    case "success":
      return Check;
    case "error":
      return AlertCircle;
    case "status":
      return Loader2;
    case "tool":
    default:
      return Wrench;
  }
}
