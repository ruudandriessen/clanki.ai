import { Loader2 } from "lucide-react";
import { ArchitectureDiffChangeList } from "@/components/architecture-diff-change-list";
import { ArchitectureDiffGraph } from "@/components/architecture-diff-graph";
import { ArchitectureDiffSummary } from "@/components/architecture-diff-summary";
import type { ArchitectureDiff } from "@clanki/protocol";
import { hasArchitectureDiffChanges } from "@clanki/protocol";

interface TaskPageArchitectureViewProps {
  diff: ArchitectureDiff | undefined;
  diffErrorMessage: string | null;
  isDiffLoading: boolean;
  isRunnerBackedTask: boolean;
  preparingWorkspace: boolean;
}

export function TaskPageArchitectureView({
  diff,
  diffErrorMessage,
  isDiffLoading,
  isRunnerBackedTask,
  preparingWorkspace,
}: TaskPageArchitectureViewProps) {
  if (preparingWorkspace) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/60">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Setting up worktree</p>
          <p className="text-xs">
            Architecture mode will load as soon as the runner workspace is ready.
          </p>
        </div>
      </div>
    );
  }

  if (!isRunnerBackedTask) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Architecture mode is only available for runner-backed workspaces.
      </div>
    );
  }

  if (isDiffLoading && !diff) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading architecture diff
      </div>
    );
  }

  if (diffErrorMessage) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-destructive">
        {diffErrorMessage}
      </div>
    );
  }

  if (!diff || !hasArchitectureDiffChanges(diff)) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        No architectural changes yet in this workspace.
      </div>
    );
  }

  return (
    <div className="neo-scroll flex-1 overflow-y-auto bg-background px-4 py-4 md:px-6">
      <div className="space-y-4">
        <ArchitectureDiffSummary diff={diff} />
        <ArchitectureDiffGraph diff={diff} />
        <ArchitectureDiffChangeList diff={diff} />
      </div>
    </div>
  );
}
