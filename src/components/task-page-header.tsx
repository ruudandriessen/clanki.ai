import { useHotkey } from "@tanstack/react-hotkeys";
import { ExternalLink } from "lucide-react";
import { OpenEditorDropdown } from "@/components/open-editor-dropdown";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { hotkeys } from "@/lib/hotkeys";
import {
  formatChecksProgress,
  getChecksStatusClasses,
  getPullRequestButtonClasses,
  getReviewStatusClasses,
  humanizePullRequestStatus,
} from "@/lib/pull-request";
import { cn } from "@/lib/utils";

interface TaskPageHeaderProps {
  displayTitle: string;
  projectName: string;
  branchName: string | null;
  pullRequest: {
    prNumber: number;
    url: string;
    status: "open" | "merged" | "closed" | "draft";
    reviewState: string | null;
    checksCount: number | null;
    checksCompletedCount: number | null;
    checksState: string | null;
    checksConclusion: string | null;
  } | null;
  desktopApp: boolean;
  isRunnerBackedTask: boolean;
  workspacePath: string | null;
  sending: boolean;
  isRunning: boolean;
  onError: (error: string | null) => void;
  onCreatePr: () => void;
}

export function TaskPageHeader({
  displayTitle,
  projectName,
  branchName,
  pullRequest,
  desktopApp,
  isRunnerBackedTask,
  workspacePath,
  sending,
  isRunning,
  onError,
  onCreatePr,
}: TaskPageHeaderProps) {
  const canCreatePr = !!branchName && !pullRequest && !sending && !isRunning;
  useHotkey(hotkeys.createPr.keys, () => onCreatePr(), { enabled: canCreatePr });

  const createPrButton = branchName ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={-1}>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={sending || isRunning}
            onClick={onCreatePr}
          >
            Create PR
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-2">
          {hotkeys.createPr.label}
          <Kbd keys={hotkeys.createPr.keys} />
        </span>
      </TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <div className="shrink-0 border-b border-border bg-card px-4 py-3 md:px-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="min-w-0 md:flex md:items-center md:gap-2">
              <div className="flex min-h-8 min-w-0 items-center gap-2">
                <h2 className="m-0 truncate text-sm font-bold tracking-[0.04em] uppercase">
                  {displayTitle}
                </h2>
              </div>
              <p className="truncate text-xs text-muted-foreground">{projectName}</p>
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {desktopApp && isRunnerBackedTask && workspacePath ? (
            <OpenEditorDropdown onError={onError} workspacePath={workspacePath} />
          ) : null}
          {pullRequest ? (
            <div className="space-y-1 text-left md:flex md:items-center md:gap-2 md:space-y-0 md:text-right">
              <Button
                asChild
                variant="outline"
                size="xs"
                className={getPullRequestButtonClasses(pullRequest.status)}
              >
                <a
                  href={pullRequest.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open PR #${pullRequest.prNumber} on GitHub`}
                >
                  PR #{pullRequest.prNumber} {pullRequest.status}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <div className="flex flex-wrap gap-1 md:flex-nowrap md:justify-end">
                {pullRequest.reviewState != null ? (
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] font-medium",
                      getReviewStatusClasses(pullRequest.reviewState),
                    )}
                  >
                    Review: {humanizePullRequestStatus(pullRequest.reviewState)}
                  </span>
                ) : null}
                {pullRequest.checksState != null ||
                pullRequest.checksConclusion != null ||
                pullRequest.checksCount != null ? (
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] font-medium",
                      getChecksStatusClasses(pullRequest.checksState, pullRequest.checksConclusion),
                    )}
                  >
                    Checks:{" "}
                    {formatChecksProgress(
                      pullRequest.checksCompletedCount,
                      pullRequest.checksCount,
                      pullRequest.checksState,
                      pullRequest.checksConclusion,
                    )}
                  </span>
                ) : null}
              </div>
            </div>
          ) : branchName ? (
            <div className="space-y-1 text-right">{createPrButton}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
