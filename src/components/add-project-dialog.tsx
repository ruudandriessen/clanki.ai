import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { GithubRepo } from "@/lib/github-repo";
import type { Project } from "@/lib/project";
import { PROJECTS_QUERY_KEY } from "@/lib/use-projects";
import { cn } from "../lib/utils";
import { listAccessibleGithubRepos } from "@/server/functions/github";
import { createProjects } from "@/server/functions/projects";

export function AddProjectDialog({
  open,
  onClose,
  existingProjects,
}: {
  open: boolean;
  onClose: () => void;
  existingProjects: Project[];
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  const {
    data: repos = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ["github-repos"],
    queryFn: () => listAccessibleGithubRepos(),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const existingRepoUrls = new Set(existingProjects.map((p) => p.repo_url));

  function toggleRepo(htmlUrl: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(htmlUrl)) next.delete(htmlUrl);
      else next.add(htmlUrl);
      return next;
    });
  }

  const addMutation = useMutation({
    mutationFn: async (reposToAdd: GithubRepo[]) => {
      await createProjects({
        data: {
          repos: reposToAdd.map((repo) => ({
            name: repo.fullName,
            repoUrl: repo.htmlUrl,
          })),
        },
      });
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      onClose();
    },
  });

  const lowerFilter = filter.toLowerCase();
  const filteredRepos = repos.filter((r) => r.fullName.toLowerCase().includes(lowerFilter));
  const availableRepos = filteredRepos.filter((r) => !existingRepoUrls.has(r.htmlUrl));
  const alreadyAdded = filteredRepos.filter((r) => existingRepoUrls.has(r.htmlUrl));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setSelected(new Set());
          setFilter("");
          addMutation.reset();
        } else {
          onClose();
        }
      }}
    >
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
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No repositories found.
                  </p>
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
                            selected.has(repo.htmlUrl)
                              ? "bg-primary border-primary"
                              : "border-border",
                          )}
                        >
                          {selected.has(repo.htmlUrl) ? (
                            <Check className="w-3 h-3 text-white" />
                          ) : null}
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
            {addMutation.error?.message ??
              (queryError instanceof Error
                ? queryError.message
                : "Failed to load repositories with gh.")}
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
    </Dialog>
  );
}
