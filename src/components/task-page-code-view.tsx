import { MultiFileDiff } from "@pierre/diffs/react";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface TaskPageCodeViewProps {
  diffErrorMessage: string | null;
  diffs:
    | Array<{
        additions: number;
        after: string;
        before: string;
        deletions: number;
        file: string;
      }>
    | undefined;
  isDiffLoading: boolean;
  isRunnerBackedTask: boolean;
  preparingWorkspace: boolean;
}

export function TaskPageCodeView({
  diffErrorMessage,
  diffs,
  isDiffLoading,
  isRunnerBackedTask,
  preparingWorkspace,
}: TaskPageCodeViewProps) {
  const { theme } = useTheme();

  if (preparingWorkspace) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/60">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Setting up worktree</p>
          <p className="text-xs">Code mode will load as soon as the runner workspace is ready.</p>
        </div>
      </div>
    );
  }

  if (!isRunnerBackedTask) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Code mode is only available for runner-backed workspaces.
      </div>
    );
  }

  if (isDiffLoading && !diffs) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading workspace diff
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

  if (!diffs || diffs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
        No code changes yet in this workspace.
      </div>
    );
  }

  return (
    <div className="neo-scroll flex-1 overflow-y-auto bg-background px-4 py-4 md:px-6">
      <div className="space-y-4">
        {diffs.map((diff) => (
          <div
            key={diff.file}
            className="overflow-hidden rounded-[var(--radius-md)] border border-border/70 bg-card/80"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-2 text-xs">
              <span className="font-mono text-foreground">{diff.file}</span>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span>+{diff.additions}</span>
                <span>-{diff.deletions}</span>
              </span>
            </div>
            <MultiFileDiff
              oldFile={{ contents: diff.before, name: diff.file }}
              newFile={{ contents: diff.after, name: diff.file }}
              options={{
                diffStyle: "split",
                lineDiffType: "word",
                overflow: "scroll",
                themeType: theme,
              }}
              className="runner-diff-view"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
