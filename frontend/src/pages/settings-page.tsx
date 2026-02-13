import { useEffect, useState } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { BookMarked, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  completeProviderOauth,
  deleteProviderCredential,
  fetchProviderCredentialStatus,
  startProviderOauth,
  upsertProviderCredential,
  type ProviderCredentialStatus,
  type ProviderOauthStart,
} from "../lib/api";
import { AddProjectDialog } from "../components/add-project-dialog";
import { projectsCollection } from "../lib/collections";

const OPENAI_PROVIDER = "openai";

export function SettingsPage() {
  const { data: projects, isLoading } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiStatus, setOpenaiStatus] = useState<ProviderCredentialStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [savingKey, setSavingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [startingOauth, setStartingOauth] = useState(false);
  const [completingOauth, setCompletingOauth] = useState(false);
  const [oauthAttempt, setOauthAttempt] = useState<ProviderOauthStart | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  async function handleCreated(txid?: number) {
    if (txid !== undefined) {
      await projectsCollection.utils.awaitTxId(txid);
    }
  }

  useEffect(() => {
    void loadOpenAiStatus();
  }, []);

  async function loadOpenAiStatus() {
    setLoadingStatus(true);
    setProviderError(null);
    try {
      const status = await fetchProviderCredentialStatus(OPENAI_PROVIDER);
      setOpenaiStatus(status);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Failed to load OpenAI settings");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function handleSaveOpenAiKey() {
    const apiKey = openaiApiKey.trim();
    if (apiKey.length === 0 || savingKey) {
      return;
    }

    setSavingKey(true);
    setProviderError(null);
    try {
      const status = await upsertProviderCredential(OPENAI_PROVIDER, apiKey);
      setOpenaiStatus(status);
      setOpenaiApiKey("");
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Failed to save OpenAI key");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleDeleteOpenAiKey() {
    if (!openaiStatus?.configured || removingKey) {
      return;
    }

    setRemovingKey(true);
    setProviderError(null);
    try {
      await deleteProviderCredential(OPENAI_PROVIDER);
      setOpenaiStatus({
        provider: OPENAI_PROVIDER,
        configured: false,
        authType: null,
        updatedAt: null,
      });
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
      const attempt = await startProviderOauth(OPENAI_PROVIDER);
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
      const status = await completeProviderOauth(OPENAI_PROVIDER, oauthAttempt.attemptId);
      setOpenaiStatus(status);
      setOauthAttempt(null);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "OAuth flow is not complete yet");
    } finally {
      setCompletingOauth(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-6 text-lg font-semibold">Settings</h2>

      <div className="space-y-6">
        <section>
          <h3 className="mb-4 text-sm font-medium tracking-wider text-muted-foreground uppercase">
            AI Providers
          </h3>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">OpenAI (Codex)</p>
                {loadingStatus ? (
                  <p className="text-xs text-muted-foreground">Loading configuration...</p>
                ) : openaiStatus?.configured ? (
                  <p className="text-xs text-muted-foreground">
                    Configured
                    {openaiStatus.authType === "oauth" ? " via ChatGPT Plus/Pro" : " via API key"}
                    {openaiStatus.updatedAt !== null
                      ? ` · Updated ${new Date(openaiStatus.updatedAt).toLocaleString()}`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No credentials configured</p>
                )}
              </div>
              {loadingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            <div className="flex flex-col gap-2 md:flex-row">
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
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
                disabled={removingKey || !openaiStatus?.configured}
              >
                {removingKey ? "Removing..." : "Remove key"}
              </Button>
            </div>

            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
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
            <h3 className="text-sm font-medium tracking-wider text-muted-foreground uppercase">
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
          ) : !projects || projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border border-dashed py-12 text-muted-foreground">
              <BookMarked className="h-8 w-8" />
              <p className="text-sm">No projects yet. Add a repository to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <Card key={project.id} className="gap-0 py-0">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <BookMarked className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{project.name}</p>
                        {project.repoUrl ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {project.repoUrl}
                          </p>
                        ) : null}
                      </div>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
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
        onCreated={handleCreated}
        existingProjects={projects ?? []}
      />
    </div>
  );
}
