import type {
  ArchitectureDiffEdgeStatus,
  ArchitectureDiffFileStatus,
} from "@/lib/architecture-diff";

export function architectureFileNodeClass(status: ArchitectureDiffFileStatus): string {
  switch (status) {
    case "added":
      return "fill-emerald-500/10 stroke-emerald-600";
    case "removed":
      return "fill-destructive/10 stroke-destructive";
    case "modified":
      return "fill-primary/10 stroke-primary";
    case "unchanged":
      return "fill-muted/60 stroke-border";
  }
}

export function architectureEdgeStatusClass(status: ArchitectureDiffEdgeStatus): string {
  switch (status) {
    case "added":
      return "stroke-emerald-600";
    case "removed":
      return "stroke-destructive";
    case "unchanged":
      return "stroke-border";
  }
}

export function architectureStatusToneClass(
  status: ArchitectureDiffFileStatus | ArchitectureDiffEdgeStatus,
): string {
  switch (status) {
    case "added":
      return "text-emerald-700 dark:text-emerald-400";
    case "removed":
      return "text-destructive";
    case "modified":
      return "text-primary";
    case "unchanged":
      return "text-muted-foreground";
  }
}

export function architectureStatusLabel(
  status: ArchitectureDiffFileStatus | ArchitectureDiffEdgeStatus,
): string {
  switch (status) {
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "modified":
      return "Modified";
    case "unchanged":
      return "Unchanged";
  }
}
