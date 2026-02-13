import { useState } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { BookMarked, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddProjectDialog } from "../components/add-project-dialog";
import { projectsCollection, queryClient } from "../lib/collections";

export function SettingsPage() {
  const { data: projects, isLoading } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-6 text-lg font-semibold">Settings</h2>

      <div className="space-y-6">
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
