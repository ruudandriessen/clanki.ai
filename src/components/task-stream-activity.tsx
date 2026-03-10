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
import { AnimatedStreamItem } from "@/components/animated-stream-item";
import { TaskStreamActivityRow } from "@/components/task-stream-activity-row";

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
  summary?: string;
  badges?: string[];
  details?: string[];
  detailSections?: Array<{
    label: string;
    value: string;
    code?: boolean;
  }>;
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
          return (
            <AnimatedStreamItem key={item.id}>
              <TaskStreamActivityRow item={item} icon={getActivityIcon(item.icon)} />
            </AnimatedStreamItem>
          );
        })}
      </div>
    </div>
  );
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
