import { BadgeInfo, FolderTree } from "lucide-react";
import { useRunnerSessions } from "@/lib/runner-sessions";

export function RunnerSessionPage({ sessionId }: { sessionId: string }) {
  const { isLoading, sessions, workspaceDirectory } = useRunnerSessions();
  const session = sessions.find((item) => item.id === sessionId) ?? null;

  if (isLoading) {
    return null;
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="neo-surface max-w-lg rounded-[var(--radius-md)] p-6 text-center">
          <p className="text-base font-semibold text-foreground">Session not found</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick another session from the sidebar or start a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="neo-scroll h-full overflow-y-auto px-4 py-5 md:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <section className="neo-surface rounded-[var(--radius-md)] p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Runner session
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-[0.01em] text-foreground">
            {session.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This route is intentionally basic. It proves the desktop app can list and create local
            runner sessions without going through the existing task backend flow.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="neo-surface rounded-[var(--radius-md)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderTree className="h-4 w-4" />
              <span>Workspace</span>
            </div>
            <p className="mt-3 break-all text-sm text-muted-foreground">
              {workspaceDirectory ?? session.directory}
            </p>
          </div>

          <div className="neo-surface rounded-[var(--radius-md)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BadgeInfo className="h-4 w-4" />
              <span>Session details</span>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Session ID</dt>
                <dd className="break-all text-foreground">{session.id}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-foreground">{formatTimestamp(session.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="text-foreground">{formatTimestamp(session.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
