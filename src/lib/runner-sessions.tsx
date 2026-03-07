import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createDesktopRunnerSession, listDesktopRunnerSessions } from "@/lib/desktop-runner";
import type { RunnerSessionSummary } from "@/shared/runner-session";

type RunnerSessionsContextValue = {
  createSession: (title: string) => Promise<{ sessionId: string }>;
  error: string | null;
  isCreating: boolean;
  isDesktopApp: boolean;
  isLoading: boolean;
  refreshSessions: () => Promise<void>;
  sessions: RunnerSessionSummary[];
  workspaceDirectory: string | null;
};

const RunnerSessionsContext = createContext<RunnerSessionsContextValue | null>(null);

export function RunnerSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<RunnerSessionSummary[]>([]);
  const [workspaceDirectory, setWorkspaceDirectory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDesktopApp = detectDesktopApp();
  const loadSessions = useEffectEvent(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await listDesktopRunnerSessions();
      startTransition(() => {
        setSessions(response.sessions);
        setWorkspaceDirectory(response.workspaceDirectory);
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load runner sessions");
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    if (!isDesktopApp) {
      setSessions([]);
      setWorkspaceDirectory(null);
      setError("Runner sessions are only available in the desktop app.");
      setIsLoading(false);
      return;
    }

    void loadSessions();
  }, [isDesktopApp]);

  async function refreshSessions(): Promise<void> {
    if (!isDesktopApp) {
      return;
    }

    await loadSessions();
  }

  async function createSession(title: string): Promise<{ sessionId: string }> {
    setIsCreating(true);
    setError(null);

    try {
      const response = await createDesktopRunnerSession(title);
      await refreshSessions();
      return response;
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Failed to create runner session";
      setError(message);
      throw createError;
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <RunnerSessionsContext.Provider
      value={{
        createSession,
        error,
        isCreating,
        isDesktopApp,
        isLoading,
        refreshSessions,
        sessions,
        workspaceDirectory,
      }}
    >
      {children}
    </RunnerSessionsContext.Provider>
  );
}

export function useRunnerSessions() {
  const context = useContext(RunnerSessionsContext);
  if (!context) {
    throw new Error("useRunnerSessions must be used within RunnerSessionsProvider");
  }

  return context;
}

function detectDesktopApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return "__TAURI_INTERNALS__" in (window as Window & { __TAURI_INTERNALS__?: unknown });
}
