import { useEffect, useState } from "react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { BookMarked, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddProjectDialog } from "../components/add-project-dialog";
import { useOrganization } from "../components/layout/use-organization";
import { projectsCollection, providerCredentialsCollection } from "../lib/collections";
import {
  completeProviderOauth,
  deleteProviderCredential,
  startProviderOauth,
  upsertProviderCredential,
} from "@/server/functions/settings";
import { updateProjectRunCommand, updateProjectSetupCommand } from "@/server/functions/projects";

type ProviderOauthStart = {
  attemptId: string;
  url: string;
  instructions: string;
  method: "auto" | "code";
  expiresAt: number;
};

const OPENAI_PROVIDER = "openai";

function formatMsTimestamp(msTimestamp: bigint): string {
  return new Date(Number(msTimestamp)).toLocaleDateString();
}

export function SettingsPage() {
  const { data: projects, isLoading } = useLiveQuery((q) =>
    q.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );
  const { data: openAiCredentialRows, isLoading: isOpenAiCredentialLoading } = useLiveQuery((q) =>
    q
      .from({ credential: providerCredentialsCollection })
      .where(({ credential }) => eq(credential.provider, OPENAI_PROVIDER)),
  );
  const activeOrganization = useOrganization();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [startingOauth, setStartingOauth] = useState(false);
  const [completingOauth, setCompletingOauth] = useState(false);
  const [oauthAttempt, setOauthAttempt] = useState<ProviderOauthStart | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [projectSetupDrafts, setProjectSetupDrafts] = useState<Record<string, string>>({});
  const [projectRunDrafts, setProjectRunDrafts] = useState<Record<string, string>>({});
  const [projectRunPortDrafts, setProjectRunPortDrafts] = useState<Record<string, string>>({});
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [savingProjectRunId, setSavingProjectRunId] = useState<string | null>(null);
  const [projectSetupErrors, setProjectSetupErrors] = useState<Record<string, string>>({});
  const [projectRunErrors, setProjectRunErrors] = useState<Record<string, string>>({});
  const openAiCredential = openAiCredentialRows[0] ?? null;
  const openAiAuthType = openAiCredential?.auth_type ?? null;
  const openAiUpdatedAt = openAiCredential ? Number(openAiCredential.updated_at) : null;

  useEffect(() => {
    setProjectSetupDrafts((previous) => {
      const next: Record<string, string> = {};
      for (const project of projects) {
        next[project.id] = previous[project.id] ?? project.setup_command ?? "";
      }
      return next;
    });

    setProjectRunDrafts((previous) => {
      const next: Record<string, string> = {};
      for (const project of projects) {
        next[project.id] = previous[project.id] ?? project.run_command ?? "";
      }
      return next;
    });

    setProjectRunPortDrafts((previous) => {
      const next: Record<string, string> = {};
      for (const project of projects) {
        next[project.id] =
          previous[project.id] ??
          (project.run_port === null || project.run_port === undefined
            ? ""
            : String(project.run_port));
      }
      return next;
    });
  }, [projects]);

  async function handleSaveOpenAiKey() {
    const apiKey = openaiApiKey.trim();
    if (apiKey.length === 0 || savingKey) {
      return;
    }

    setSavingKey(true);
    setProviderError(null);
    try {
      await upsertProviderCredential({
        data: { provider: OPENAI_PROVIDER, apiKey },
      });
      setOpenaiApiKey("");
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Failed to save OpenAI key");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleDeleteOpenAiKey() {
    if (!openAiCredential || removingKey) {
      return;
    }

    setRemovingKey(true);
    setProviderError(null);
    try {
      await deleteProviderCredential({ data: { provider: OPENAI_PROVIDER } });
      setOauthAttempt(null);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Failed to remove OpenAI key");
    } finally {
      setRemovingKey(false);
    }
  }

  async function handleStartOauth() {
    if (startingOauth) {
      return;
    }

    setStartingOauth(true);
    setProviderError(null);
    try {
      const attempt = await startProviderOauth({ data: { provider: OPENAI_PROVIDER } });
      setOauthAttempt(attempt);
      window.open(attempt.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Failed to start OAuth flow");
    } finally {
      setStartingOauth(false);
    }
  }

  async function handleCompleteOauth() {
    if (!oauthAttempt || completingOauth) {
      return;
    }

    setCompletingOauth(true);
    setProviderError(null);
    try {
      await completeProviderOauth({
        data: { provider: OPENAI_PROVIDER, attemptId: oauthAttempt.attemptId },
      });
      setOauthAttempt(null);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "OAuth flow is not complete yet");
    } finally {
      setCompletingOauth(false);
    }
  }

  async function handleSaveProjectSetupCommand(projectId: string) {
    if (savingProjectId) {
      return;
    }

    const draftValue = projectSetupDrafts[projectId] ?? "";
    const setupCommand = draftValue.trim().length > 0 ? draftValue.trim() : null;

    setSavingProjectId(projectId);
    setProjectSetupErrors((previous) => {
      const next = { ...previous };
      delete next[projectId];
      return next;
    });

    try {
      await updateProjectSetupCommand({ data: { projectId, setupCommand } });
      setProjectSetupDrafts((previous) => ({
        ...previous,
        [projectId]: setupCommand ?? "",
      }));
    } catch (error) {
      setProjectSetupErrors((previous) => ({
        ...previous,
        [projectId]:
          error instanceof Error ? error.message : "Failed to save project setup command",
      }));
    } finally {
      setSavingProjectId(null);
    }
  }

  async function handleSaveProjectRunCommand(projectId: string) {
    if (savingProjectRunId) {
      return;
    }

    const draftRunCommand = projectRunDrafts[projectId] ?? "";
    const draftRunPort = projectRunPortDrafts[projectId] ?? "";
    const runCommand = draftRunCommand.trim().length > 0 ? draftRunCommand.trim() : null;
    const runPortInput = draftRunPort.trim();
    const runPort = runPortInput.length > 0 ? Number(runPortInput) : null;

    if ((runCommand === null) !== (runPort === null)) {
      setProjectRunErrors((previous) => ({
        ...previous,
        [projectId]: "Run command and run port must both be provided",
      }));
      return;
    }

    if (runPort !== null && (!Number.isInteger(runPort) || runPort < 1 || runPort > 65535)) {
      setProjectRunErrors((previous) => ({
        ...previous,
        [projectId]: "Run port must be an integer between 1 and 65535",
      }));
      return;
    }

    setSavingProjectRunId(projectId);
    setProjectRunErrors((previous) => {
      const next = { ...previous };
      delete next[projectId];
      return next;
    });

    try {
      await updateProjectRunCommand({ data: { projectId, runCommand, runPort } });
      setProjectRunDrafts((previous) => ({
        ...previous,
        [projectId]: runCommand ?? "",
      }));
      setProjectRunPortDrafts((previous) => ({
        ...previous,
        [projectId]: runPort === null ? "" : String(runPort),
      }));
    } catch (error) {
      setProjectRunErrors((previous) => ({
        ...previous,
        [projectId]: error instanceof Error ? error.message : "Failed to save project run command",
      }));
    } finally {
      setSavingProjectRunId(null);
    }
  }

  return (
    <div className="neo-enter neo-scroll mx-auto h-full max-w-3xl overflow-y-auto p-6">
      <h2 className="mb-6 text-2xl tracking-[0.08em] uppercase">Settings</h2>

      <div className="neo-stagger space-y-6">
        <section>
          <h3 className="mb-4 text-sm font-bold tracking-[0.1em] text-foreground uppercase">
            AI Providers
          </h3>

          <div className="neo-surface space-y-3 rounded-[var(--radius-md)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">OpenAI (Codex)</p>
                {isOpenAiCredentialLoading ? (
                  <p className="text-xs text-muted-foreground">Loading configuration...</p>
                ) : openAiCredential ? (
                  <p className="text-xs text-muted-foreground">
                    Configured
                    {openAiAuthType === "oauth" ? " via ChatGPT Plus/Pro" : " via API key"}
                    {openAiUpdatedAt !== null
                      ? ` · Updated ${new Date(openAiUpdatedAt).toLocaleString()}`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No credentials configured</p>
                )}
              </div>
              {isOpenAiCredentialLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1"
              />
              <Button
                type="button"
                onClick={() => void handleSaveOpenAiKey()}
                disabled={savingKey || openaiApiKey.trim().length === 0}
              >
                {savingKey ? "Saving..." : "Save key"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDeleteOpenAiKey()}
                disabled={removingKey || !openAiCredential}
              >
                {removingKey ? "Removing..." : "Remove key"}
              </Button>
            </div>

            <div className="space-y-2 rounded-[var(--radius-sm)] border border-border bg-muted/60 p-3 shadow-[2px_2px_0_0_var(--color-border)]">
              <p className="text-xs text-muted-foreground">
                Prefer ChatGPT Plus/Pro instead of an API key? Use the OAuth flow below.
              </p>
              <div className="flex flex-col gap-2 md:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleStartOauth()}
                  disabled={startingOauth}
                >
                  {startingOauth ? "Starting..." : "Connect ChatGPT Plus/Pro"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleCompleteOauth()}
                  disabled={!oauthAttempt || completingOauth}
                >
                  {completingOauth ? "Checking..." : "I completed sign-in"}
                </Button>
              </div>

              {oauthAttempt ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>{oauthAttempt.instructions}</p>
                  <a
                    href={oauthAttempt.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Open sign-in page
                  </a>
                </div>
              ) : null}
            </div>

            {providerError ? <p className="text-xs text-destructive">{providerError}</p> : null}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-[0.1em] text-foreground uppercase">
              Projects
            </h3>
            <Button type="button" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Project
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="neo-surface flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border-dashed py-12 text-muted-foreground">
              <BookMarked className="h-8 w-8" />
              <p className="text-sm">No projects yet. Add a repository to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <Card key={project.id} className="gap-0 py-0">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{project.name}</p>
                          {project.repo_url ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {project.repo_url}
                            </p>
                          ) : null}
                        </div>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {formatMsTimestamp(project.created_at)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Setup command (runs after clone on a new sandbox)
                        </p>
                        <div className="flex flex-col gap-2 md:flex-row">
                          <Input
                            value={projectSetupDrafts[project.id] ?? project.setup_command ?? ""}
                            onChange={(event) =>
                              setProjectSetupDrafts((previous) => ({
                                ...previous,
                                [project.id]: event.target.value,
                              }))
                            }
                            placeholder="bun install"
                          />
                          <Button
                            type="button"
                            onClick={() => void handleSaveProjectSetupCommand(project.id)}
                            disabled={
                              savingProjectId !== null ||
                              (
                                projectSetupDrafts[project.id] ??
                                project.setup_command ??
                                ""
                              ).trim() === (project.setup_command ?? "")
                            }
                          >
                            {savingProjectId === project.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                        </div>
                        {projectSetupErrors[project.id] ? (
                          <p className="text-xs text-destructive">
                            {projectSetupErrors[project.id]}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Run command + port (starts after setup and stores preview URL)
                        </p>
                        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_8rem_auto]">
                          <Input
                            value={projectRunDrafts[project.id] ?? project.run_command ?? ""}
                            onChange={(event) =>
                              setProjectRunDrafts((previous) => ({
                                ...previous,
                                [project.id]: event.target.value,
                              }))
                            }
                            placeholder="bun run dev"
                          />
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={
                              projectRunPortDrafts[project.id] ??
                              (project.run_port === null || project.run_port === undefined
                                ? ""
                                : String(project.run_port))
                            }
                            onChange={(event) =>
                              setProjectRunPortDrafts((previous) => ({
                                ...previous,
                                [project.id]: event.target.value,
                              }))
                            }
                            placeholder="3000"
                          />
                          <Button
                            type="button"
                            onClick={() => void handleSaveProjectRunCommand(project.id)}
                            disabled={
                              savingProjectRunId !== null ||
                              ((
                                projectRunDrafts[project.id] ??
                                project.run_command ??
                                ""
                              ).trim() === (project.run_command ?? "") &&
                                (
                                  projectRunPortDrafts[project.id] ??
                                  (project.run_port === null || project.run_port === undefined
                                    ? ""
                                    : String(project.run_port))
                                ).trim() ===
                                  (project.run_port === null || project.run_port === undefined
                                    ? ""
                                    : String(project.run_port)))
                            }
                          >
                            {savingProjectRunId === project.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            Save
                          </Button>
                        </div>
                        {projectRunErrors[project.id] ? (
                          <p className="text-xs text-destructive">{projectRunErrors[project.id]}</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <AddProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        organizationId={activeOrganization.data?.id ?? null}
        existingProjects={projects}
      />
    </div>
  );
}
