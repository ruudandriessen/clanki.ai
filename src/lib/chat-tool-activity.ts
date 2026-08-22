import type { TaskStreamActivityIcon } from "@/components/task-stream-activity";

export function getToolActivityIcon(toolName: string): TaskStreamActivityIcon {
  const normalized = toolName.toLowerCase();

  if (
    normalized.includes("read") ||
    normalized.includes("file") ||
    normalized.includes("glob") ||
    normalized.includes("grep") ||
    normalized.includes("find") ||
    normalized.includes("ls")
  ) {
    return "file";
  }

  if (normalized.includes("web") || normalized.includes("search") || normalized.includes("fetch")) {
    return "web";
  }

  if (
    normalized.includes("command") ||
    normalized.includes("exec") ||
    normalized.includes("bash") ||
    normalized.includes("shell")
  ) {
    return "terminal";
  }

  return "tool";
}
