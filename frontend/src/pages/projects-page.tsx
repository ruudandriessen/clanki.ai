import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { BookMarked, Loader2 } from "lucide-react";
import { projectsCollection } from "../lib/collections";

export function ProjectsPage() {
  const { data: projects, isLoading } = useLiveQuery((q) => q.from({ p: projectsCollection }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <BookMarked className="w-8 h-8" />
        <p className="text-lg font-medium">No projects yet</p>
        <p className="text-sm">Install the GitHub App on a repository to get started.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Projects</h2>
      <div className="space-y-2">
        {projects.map((project) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="block rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BookMarked className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{project.name}</p>
                {project.repoUrl && (
                  <p className="text-xs text-muted-foreground truncate">{project.repoUrl}</p>
                )}
              </div>
              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
