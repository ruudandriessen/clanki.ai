import { AlertCircle, CheckCircle2, Loader2, Terminal, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { GhCliStatus } from "@/lib/external-clis/gh";
import type { OpencodeCliStatus } from "@/lib/external-clis/opencode";
import { cn } from "@/lib/utils";

type CliStatusRowProps = {
  description: string;
  name: string;
  status: GhCliStatus | OpencodeCliStatus;
};

function getStatusPresentation(status: GhCliStatus | OpencodeCliStatus): {
  detail: string;
  icon: typeof CheckCircle2;
  label: string;
  tone: "muted" | "success" | "warning" | "danger";
} {
  switch (status.status) {
    case "setup":
      return {
        detail: `Version ${status.version}`,
        icon: CheckCircle2,
        label: "Setup",
        tone: "success",
      };
    case "setup-no-auth":
      return {
        detail: `Version ${status.version} · run \`gh auth login\` to authenticate`,
        icon: AlertCircle,
        label: "Setup, not authenticated",
        tone: "warning",
      };
    case "not-setup":
      return {
        detail: "Not installed or not on PATH",
        icon: XCircle,
        label: "Not setup",
        tone: "danger",
      };
  }
}

const toneClasses = {
  danger: "text-destructive",
  muted: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
} as const;

function CliStatusRow({ description, name, status }: CliStatusRowProps) {
  const presentation = getStatusPresentation(status);
  const Icon = presentation.icon;

  return (
    <div className="flex items-start gap-3">
      <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium">{name}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              toneClasses[presentation.tone],
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {presentation.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        <p className="mt-1 text-xs text-muted-foreground">{presentation.detail}</p>
      </div>
    </div>
  );
}

type CliStatusSectionProps = {
  gh: GhCliStatus | undefined;
  isLoading: boolean;
  opencode: OpencodeCliStatus | undefined;
};

export function CliStatusSection({ gh, isLoading, opencode }: CliStatusSectionProps) {
  return (
    <section>
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-bold tracking-widest text-foreground uppercase">CLI Tools</h3>
        <p className="text-sm text-muted-foreground">
          Local command-line tools Clanki depends on for GitHub access and agent execution.
        </p>
      </div>

      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking CLI tools…
            </div>
          ) : (
            <div className="space-y-4">
              <CliStatusRow
                name="GitHub CLI (gh)"
                description="Used to list repositories and pull requests from GitHub."
                status={gh ?? { status: "not-setup" }}
              />
              <CliStatusRow
                name="OpenCode CLI (opencode)"
                description="Used by the local runner to execute agent sessions."
                status={opencode ?? { status: "not-setup" }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
