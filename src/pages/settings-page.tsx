import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { BookMarked, Loader2, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AddProjectDialog } from "../components/add-project-dialog";
import { useOrganization } from "../components/layout/use-organization";
import { projectsCollection } from "../lib/collections";
import { updateProjectRunCommand, updateProjectSetupCommand } from "@/server/functions/projects";

function formatMsTimestamp(msTimestamp: bigint): string {
  return new Date(Number(msTimestamp)).toLocaleDateString();
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { addProject } = useSearch({ from: "/_layout/settings" });
  const { data: projects, isLoading } = useLiveQuery((q) =>
    q.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );
  const activeOrganization = useOrganization();

  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [projectSetupDrafts, setProjectSetupDrafts] = useState<Record<string, string>>({});
  const [projectRunDrafts, setProjectRunDrafts] = useState<Record<string, string>>({});
  const [projectRunPortDrafts, setProjectRunPortDrafts] = useState<Record<string, string>>({});
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [savingProjectRunId, setSavingProjectRunId] = useState<string | null>(null);
  const [projectSetupErrors, setProjectSetupErrors] = useState<Record<string, string>>({});
  const [projectRunErrors, setProjectRunErrors] = useState<Record<string, string>>({});
  const dialogOpen = manualDialogOpen || Boolean(addProject);
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
          <Card>
            <CardHeader className="gap-3 md:flex md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Switch the interface between the default light theme and a new dark mode.
                </CardDescription>
              </div>
              <ThemeToggle className="w-full md:w-auto" />
            </CardHeader>
          </Card>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold tracking-[0.1em] text-foreground uppercase">
              Projects
            </h3>
            <Button type="button" onClick={() => setManualDialogOpen(true)}>
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
                          Setup command (kept for the future runner flow)
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
                          Run command + port (kept as future runner metadata)
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
        onClose={() => {
          setManualDialogOpen(false);
          if (!addProject) {
            return;
          }

          navigate({
            to: "/settings",
            search: {},
            replace: true,
          });
        }}
        organizationId={activeOrganization.data?.id ?? null}
        existingProjects={projects}
      />
    </div>
  );
}
