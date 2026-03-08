import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Loader2, Lock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Project, projectsCollection } from "@/lib/collections";
import { cn } from "../lib/utils";
import {
  fetchInstallAppUrl,
  fetchInstallationRepos,
  fetchInstallations,
} from "@/server/functions/installations";

type GitHubRepo = {
  id: number;
  fullName: string;
  name: string;
  htmlUrl: string;
  private: boolean;
};

interface RepoWithInstallation extends GitHubRepo {
  installationId: number;
}

export function AddProjectDialogBody({
  onClose,
  organizationId,
  existingProjects,
  autoInstall = false,
}: {
  onClose: () => void;
  organizationId: string | null;
  existingProjects: Project[];
  autoInstall?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["add-project-repos"],
    queryFn: async () => {
      const [installs, installAppResponse] = await Promise.all([
        fetchInstallations(),
        fetchInstallAppUrl(),
      ]);

      if (autoInstall && installs.length === 0 && installAppResponse.url) {
        window.location.assign(installAppResponse.url);
        return { installations: installs, repos: [], installAppUrl: installAppResponse.url };
      }

      const allRepos: RepoWithInstallation[] = [];
      await Promise.all(
        installs.map(async (inst) => {
          const installRepos = await fetchInstallationRepos({
            data: { installationId: inst.installationId },
          });
          for (const repo of installRepos) {
            allRepos.push({ ...repo, installationId: inst.installationId });
          }
        }),
      );

      return { installations: installs, repos: allRepos, installAppUrl: installAppResponse.url };
    },
    refetchOnWindowFocus: false,
  });

  const installations = data?.installations ?? [];
  const repos = data?.repos ?? [];
  const installAppUrl = data?.installAppUrl ?? null;
  const existingRepoUrls = new Set(existingProjects.map((p) => p.repo_url).filter(Boolean));

  function toggleRepo(htmlUrl: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(htmlUrl)) next.delete(htmlUrl);
      else next.add(htmlUrl);
      return next;
    });
  }

  const addMutation = useMutation({
    mutationFn: async (reposToAdd: RepoWithInstallation[]) => {
      if (!organizationId) {
        throw new Error("No active organization selected.");
      }

      const now = Date.now();
      const projects = reposToAdd.map((r, index) => {
        const createdAt = now + index;
        return {
          id: crypto.randomUUID(),
          organization_id: organizationId,
          created_at: BigInt(createdAt),
          updated_at: BigInt(createdAt),
          name: r.fullName,
          repo_url: r.htmlUrl,
          installation_id: r.installationId,
          setup_command: null,
          run_command: null,
          run_port: null,
        };
      });

      const tx = projectsCollection.insert(projects);
      onClose();
      await tx.isPersisted.promise;
    },
  });

  const lowerFilter = filter.toLowerCase();
  const filteredRepos = repos.filter((r) => r.fullName.toLowerCase().includes(lowerFilter));
  const availableRepos = filteredRepos.filter((r) => !existingRepoUrls.has(r.htmlUrl));
  const alreadyAdded = filteredRepos.filter((r) => existingRepoUrls.has(r.htmlUrl));

  return (
    <DialogContent
      className="max-h-[80vh] w-[32rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
      showCloseButton={false}
    >
      <DialogHeader className="flex-row items-center justify-between border-b border-border bg-muted px-5 py-4">
        <DialogTitle className="text-base">Add Project</DialogTitle>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </DialogHeader>

      <div className="neo-scroll min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : installations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground">
            <p className="text-sm font-medium">No GitHub App installations found</p>
            <p className="text-xs">
              Install the Clanki GitHub App on your repositories to get started.
            </p>
            {installAppUrl ? (
              <Button
                type="button"
                className="mt-3"
                onClick={() => window.location.assign(installAppUrl)}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Install GitHub App
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="px-5 pt-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter repositories..."
                  className="pl-9"
                />
              </div>
            </div>

            <div className="px-3 pb-3">
              {availableRepos.length === 0 && alreadyAdded.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No repositories found.</p>
              ) : (
                <>
                  {availableRepos.map((repo) => (
                    <Button
                      key={repo.htmlUrl}
                      type="button"
                      variant="ghost"
                      onClick={() => toggleRepo(repo.htmlUrl)}
                      className={cn(
                        "h-auto w-full justify-start gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left font-normal transition-colors",
                        selected.has(repo.htmlUrl)
                          ? "border-border bg-primary/20 text-foreground shadow-[3px_3px_0_0_var(--color-border)]"
                          : "hover:border-border hover:bg-accent/60",
                      )}
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
                          selected.has(repo.htmlUrl) ? "bg-primary border-primary" : "border-border",
                        )}
                      >
                        {selected.has(repo.htmlUrl) ? <Check className="w-3 h-3 text-white" /> : null}
                      </div>
                      <span className="flex-1 truncate text-sm">{repo.fullName}</span>
                      {repo.private ? (
                        <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                      ) : null}
                    </Button>
                  ))}

                  {alreadyAdded.length > 0 ? (
                    <>
                      {availableRepos.length > 0 ? (
                        <div className="mt-2 border-t border-border pt-2" />
                      ) : null}
                      <p className="px-3 py-1.5 text-xs text-muted-foreground">Already added</p>
                      {alreadyAdded.map((repo) => (
                        <div
                          key={repo.htmlUrl}
                          className="flex items-center gap-3 rounded-md px-3 py-2.5 opacity-40"
                        >
                          <div className="w-4 h-4 rounded border border-border bg-accent shrink-0 flex items-center justify-center">
                            <Check className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <span className="flex-1 truncate text-sm">{repo.fullName}</span>
                          {repo.private ? (
                            <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                          ) : null}
                        </div>
                      ))}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {(addMutation.error ?? queryError) ? (
        <div className="px-5 py-2 text-xs text-destructive">
          {addMutation.error?.message ?? "Failed to load repositories from GitHub."}
        </div>
      ) : null}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted px-5 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => addMutation.mutate(repos.filter((r) => selected.has(r.htmlUrl)))}
          disabled={selected.size === 0 || addMutation.isPending}
        >
          {addMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {selected.size === 0
            ? "Add projects"
            : `Add ${selected.size} project${selected.size === 1 ? "" : "s"}`}
        </Button>
      </div>
    </DialogContent>
  );
}
