import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { projectsCollection, tasksCollection } from "@/lib/collections";
import { createDesktopRunnerSession } from "@/lib/desktop-runner";
import { isDesktopApp } from "@/lib/is-desktop-app";
import type { RunnerSessionSummary } from "@/shared/runner-session";

type RunnerSessionsContextValue = {
  createSession: (title: string) => Promise<{ sessionId: string; taskId: string }>;
  error: string | null;
  isCreating: boolean;
  isDesktopApp: boolean;
  isLoading: boolean;
  refreshSessions: () => Promise<void>;
  sessions: RunnerSessionSummary[];
  workspaceDirectory: string | null;
};

const RunnerSessionsContext = createContext<RunnerSessionsContextValue | null>(null);
const refreshRunnerSessions = async (): Promise<void> => {};

export function RunnerSessionsProvider({ children }: { children: ReactNode }) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: projects, isLoading: isProjectLoading } = useLiveQuery((q) =>
    q.from({ project: projectsCollection }).orderBy(({ project }) => project.created_at, "asc"),
  );
  const desktopApp = isDesktopApp();
  const activeProject = projects.find((project) => project.repo_url) ?? null;
  const repoUrl = activeProject?.repo_url ?? null;

  async function createSession(title: string): Promise<{ sessionId: string; taskId: string }> {
    if (!repoUrl || !activeProject) {
      const message = "Add a project with a repository URL before creating a runner session.";
      setError(message);
      throw new Error(message);
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await createDesktopRunnerSession(title, repoUrl);
      const createdAt = BigInt(Date.now());
      const taskId = crypto.randomUUID();
      const taskInsert = tasksCollection.insert({
        id: taskId,
        organization_id: activeProject.organization_id,
        project_id: activeProject.id,
        title: title.trim(),
        status: "open",
        runner_type: response.runnerType,
        runner_session_id: response.sessionId,
        stream_id: null,
        workspace_path: response.workspaceDirectory,
        branch: null,
        error: null,
        created_at: createdAt,
        updated_at: createdAt,
      });

      await taskInsert.isPersisted.promise;
      return {
        sessionId: response.sessionId,
        taskId,
      };
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
        isDesktopApp: desktopApp,
        isLoading: isProjectLoading,
        refreshSessions: refreshRunnerSessions,
        sessions: [] satisfies RunnerSessionSummary[],
        workspaceDirectory: null,
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
