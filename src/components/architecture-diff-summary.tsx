import type { ArchitectureDiff } from "@/lib/architecture-diff";

interface ArchitectureDiffSummaryProps {
  diff: ArchitectureDiff;
}

export function ArchitectureDiffSummary({ diff }: ArchitectureDiffSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="text-emerald-700 dark:text-emerald-400">+{diff.addedFileCount} files</span>
      <span className="text-destructive">−{diff.removedFileCount} files</span>
      <span className="text-emerald-700 dark:text-emerald-400">+{diff.addedEdgeCount} imports</span>
      <span className="text-destructive">−{diff.removedEdgeCount} imports</span>
      <span className="text-muted-foreground">vs default branch</span>
    </div>
  );
}
