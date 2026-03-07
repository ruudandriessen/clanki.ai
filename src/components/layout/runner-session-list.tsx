import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertCircle, FolderTree, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunnerSessions } from "@/lib/runner-sessions";
import { cn } from "@/lib/utils";

export function RunnerSessionList() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const {
    createSession,
    error,
    isCreating,
    isDesktopApp,
    isLoading,
    sessions,
    workspaceDirectory,
  } = useRunnerSessions();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const nextTitle = `Task ${sessions.length + 1}`;

  async function handleCreateSession() {
    const trimmedTitle = title.trim() || nextTitle;
    const response = await createSession(trimmedTitle);
    setCreateDialogOpen(false);
    setTitle("");
    navigate({
      to: "/runner/$sessionId",
      params: { sessionId: response.sessionId },
    });
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/90">
              Sessions
            </p>
            {workspaceDirectory ? (
              <p
                className="mt-1 truncate text-[11px] text-muted-foreground"
                title={workspaceDirectory}
              >
                {formatWorkspaceLabel(workspaceDirectory)}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setTitle(nextTitle);
              setCreateDialogOpen(true);
            }}
            disabled={!isDesktopApp || isCreating}
            className="text-muted-foreground shadow-none hover:border-transparent hover:shadow-none"
            title="New session"
          >
            {isCreating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        <nav className="neo-scroll flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2 pb-24 md:pb-2">
          {isLoading ? (
            <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Loading runner sessions…</span>
            </div>
          ) : null}

          {!isLoading && error ? (
            <div className="rounded-[var(--radius-sm)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          {!isLoading && !error && sessions.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No runner sessions yet.
            </div>
          ) : null}

          {!isLoading && !error
            ? sessions.map((session) => {
                const isActive = pathname === `/runner/${session.id}`;

                return (
                  <Link
                    key={session.id}
                    to="/runner/$sessionId"
                    params={{ sessionId: session.id }}
                    className={cn(
                      "block rounded-[var(--radius-sm)] border px-3 py-2 transition-colors",
                      isActive
                        ? "border-border bg-accent shadow-[3px_3px_0_0_var(--color-border)]"
                        : "border-transparent hover:border-border hover:bg-accent/60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <FolderTree className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {session.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          Updated {formatRelativeTime(session.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            : null}
        </nav>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Runner Session</DialogTitle>
            <DialogDescription>
              This creates a new OpenCode session in the local runner for the current workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Task title
            </label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={nextTitle}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreateSession()} disabled={isCreating}>
              {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Start session</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return `${Math.floor(diffHours / 24)}d ago`;
}

function formatWorkspaceLabel(workspaceDirectory: string): string {
  const segments = workspaceDirectory.split("/").filter(Boolean);
  if (segments.length <= 2) {
    return workspaceDirectory;
  }

  return `.../${segments.slice(-2).join("/")}`;
}
