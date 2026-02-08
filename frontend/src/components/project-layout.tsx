import { useState, useEffect } from "react";
import { Outlet, Link, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { LayoutDashboard, GitBranch, BookMarked, Loader2, ChevronLeft } from "lucide-react";
import {
  projectsCollection,
  getSnapshotsCollection,
  getGraphCollections,
} from "../lib/collections";
import { ActiveProjectContext } from "../lib/project-context";
import { fetchLatestSnapshot } from "../lib/api";

const GROUP_COLORS: Record<string, string> = {
  UI: "#3b82f6",
  API: "#10b981",
  "Graph Extraction": "#8b5cf6",
  Classification: "#f59e0b",
  Types: "#ec4899",
};

export function ProjectLayout() {
  const { projectId } = useParams({ strict: false });
  const snapshotIdFromUrl = (useParams({ strict: false }) as any).snapshotId as string | undefined;
  const [resolvedSnapshotId, setResolvedSnapshotId] = useState<string | null>(
    snapshotIdFromUrl ?? null,
  );
  const [loading, setLoading] = useState(!snapshotIdFromUrl);
  // Resolve latest snapshot if none is in the URL
  useEffect(() => {
    if (snapshotIdFromUrl) {
      setResolvedSnapshotId(snapshotIdFromUrl);
      setLoading(false);
      return;
    }
    if (!projectId) return;

    setLoading(true);
    fetchLatestSnapshot(projectId)
      .then((s) => setResolvedSnapshotId(s.id))
      .catch(() => setResolvedSnapshotId(null))
      .finally(() => setLoading(false));
  }, [projectId, snapshotIdFromUrl]);

  // Get current project info
  const { data: projects } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const project = projects?.find((p) => p.id === projectId);

  // Get snapshots for picker
  const snapshotsCollection = projectId ? getSnapshotsCollection(projectId) : null;
  const { data: snapshots } = useLiveQuery(
    (q) => (snapshotsCollection ? q.from({ s: snapshotsCollection }) : null),
    [projectId],
  );

  // Get graph collections once snapshot is resolved
  const graphCollections =
    projectId && resolvedSnapshotId ? getGraphCollections(projectId, resolvedSnapshotId) : null;

  const { data: groups } = useLiveQuery(
    (q) => (graphCollections ? q.from({ g: graphCollections.groups }) : null),
    [projectId, resolvedSnapshotId],
  );

  const { data: classifications } = useLiveQuery(
    (q) => (graphCollections ? q.from({ c: graphCollections.classifications }) : null),
    [projectId, resolvedSnapshotId],
  );

  const { data: groupEdgesData } = useLiveQuery(
    (q) => (graphCollections ? q.from({ ge: graphCollections.groupEdges }) : null),
    [projectId, resolvedSnapshotId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!resolvedSnapshotId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <p>No snapshots available for this project yet.</p>
        <p className="text-xs">Snapshots are created when pull requests are merged.</p>
        <Link to="/" className="text-sm text-primary hover:underline mt-2">
          <ChevronLeft className="w-3.5 h-3.5 inline mr-1" />
          Back to projects
        </Link>
      </div>
    );
  }

  const ctx = { projectId: projectId!, snapshotId: resolvedSnapshotId };

  return (
    <ActiveProjectContext.Provider value={ctx}>
      <div className="flex flex-col h-full">
        {/* Project header bar */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-3 shrink-0">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <BookMarked className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{project?.name ?? projectId}</span>

          {snapshots && snapshots.length > 1 && (
            <>
              <span className="text-muted-foreground">·</span>
              <select
                value={resolvedSnapshotId}
                onChange={(e) => setResolvedSnapshotId(e.target.value)}
                className="text-xs bg-transparent border border-border rounded px-2 py-1 text-muted-foreground"
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.commitSha?.slice(0, 7) ?? s.id.slice(0, 8)} —{" "}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </>
          )}

          {classifications && groupEdgesData && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch className="w-3.5 h-3.5" />
              {classifications.length} files · {groupEdgesData.length} deps
            </div>
          )}
        </div>

        {/* Sub-navigation: groups sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Groups sidebar */}
          <nav className="w-48 border-r border-border p-3 space-y-0.5 overflow-y-auto shrink-0 hidden md:block">
            <Link
              to="/projects/$projectId"
              params={{ projectId: projectId! }}
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              inactiveProps={{
                className: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Graph
            </Link>

            {groups && groups.length > 0 && (
              <div className="pt-4">
                <p className="px-3 pb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Groups
                </p>
                {groups.map((g) => (
                  <Link
                    key={g.name}
                    to="/projects/$projectId/groups/$name"
                    params={{ projectId: projectId!, name: g.name }}
                    activeProps={{ className: "bg-accent text-accent-foreground" }}
                    inactiveProps={{
                      className: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: GROUP_COLORS[g.name] || "#6b7280",
                      }}
                    />
                    {g.name}
                  </Link>
                ))}
              </div>
            )}
          </nav>

          {/* Page content */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </ActiveProjectContext.Provider>
  );
}
