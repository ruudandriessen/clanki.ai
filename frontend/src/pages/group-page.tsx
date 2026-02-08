import { useMemo } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { ArrowRight, ArrowLeft, FileCode2, Loader2 } from "lucide-react";
import { useActiveProject } from "../lib/project-context";
import { getGraphCollections } from "../lib/collections";

const GROUP_COLORS: Record<string, string> = {
  UI: "#3b82f6",
  API: "#10b981",
  "Graph Extraction": "#8b5cf6",
  Classification: "#f59e0b",
  Types: "#ec4899",
};

export function GroupDetailPage() {
  const { name } = useParams({ strict: false }) as { name: string };
  const ctx = useActiveProject();

  const graphCollections = ctx ? getGraphCollections(ctx.projectId, ctx.snapshotId) : null;

  const { data: groups } = useLiveQuery(
    (q) => (graphCollections ? q.from({ g: graphCollections.groups }) : null),
    [ctx?.projectId, ctx?.snapshotId],
  );

  const { data: classifications } = useLiveQuery(
    (q) => (graphCollections ? q.from({ c: graphCollections.classifications }) : null),
    [ctx?.projectId, ctx?.snapshotId],
  );

  const { data: groupEdges } = useLiveQuery(
    (q) => (graphCollections ? q.from({ ge: graphCollections.groupEdges }) : null),
    [ctx?.projectId, ctx?.snapshotId],
  );

  const { data: fileEdgesAll } = useLiveQuery(
    (q) => (graphCollections ? q.from({ fe: graphCollections.fileEdges }) : null),
    [ctx?.projectId, ctx?.snapshotId],
  );

  const { group, files, outgoing, incoming, fileEdgesOut, fileEdgesIn } = useMemo(() => {
    if (!groups || !classifications || !groupEdges || !fileEdgesAll)
      return {
        group: null,
        files: [],
        outgoing: [],
        incoming: [],
        fileEdgesOut: [],
        fileEdgesIn: [],
      };

    const group = groups.find((g) => g.name === name) ?? null;
    const files = classifications.filter((c) => c.group === name);
    const outgoing = groupEdges.filter((e) => e.from === name);
    const incoming = groupEdges.filter((e) => e.to === name);

    const classMap = new Map(classifications.map((c) => [c.file, c.group]));
    const fileEdgesOut = fileEdgesAll.filter(
      (e) => classMap.get(e.from) === name && classMap.get(e.to) !== name,
    );
    const fileEdgesIn = fileEdgesAll.filter(
      (e) => classMap.get(e.to) === name && classMap.get(e.from) !== name,
    );

    return { group, files, outgoing, incoming, fileEdgesOut, fileEdgesIn };
  }, [groups, classifications, groupEdges, fileEdgesAll, name]);

  if (!ctx) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No project selected
      </div>
    );
  }

  if (!groups || !classifications) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Group &ldquo;{name}&rdquo; not found
      </div>
    );
  }

  const color = GROUP_COLORS[name] ?? "#6b7280";
  const projectId = ctx.projectId;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h2 className="text-lg md:text-xl font-semibold">{name}</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1 ml-6">{group.description}</p>
      </div>

      <div className="p-4 md:p-6 space-y-6 md:space-y-8">
        {/* Files */}
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Files ({files.length})
          </h3>
          <div className="rounded-lg border border-border overflow-hidden">
            {files.map((f, i) => (
              <div
                key={f.file}
                className={`flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 text-sm min-w-0 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <FileCode2 className="w-4 h-4 text-muted-foreground shrink-0 hidden sm:block" />
                <span className="font-mono text-xs truncate min-w-0">{f.file}</span>
                <span
                  className="ml-auto text-[10px] px-2 py-0.5 rounded-full uppercase font-medium shrink-0"
                  style={{ backgroundColor: color + "15", color }}
                >
                  {f.strategy}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Outgoing dependencies */}
        {outgoing.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              <ArrowRight className="w-4 h-4 inline mr-1.5" />
              Depends on ({outgoing.length})
            </h3>
            <div className="space-y-3">
              {outgoing.map((e) => (
                <div key={e.to} className="rounded-lg border border-border p-3 md:p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Link
                      to="/projects/$projectId/groups/$name"
                      params={{ projectId, name: e.to }}
                      className="font-medium text-sm hover:underline"
                      style={{ color: GROUP_COLORS[e.to] ?? "#6b7280" }}
                    >
                      {e.to}
                    </Link>
                    <span className="text-xs text-muted-foreground">{e.weight} edges</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {e.symbols.map((s) => (
                      <span
                        key={s}
                        className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Incoming dependencies */}
        {incoming.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              <ArrowLeft className="w-4 h-4 inline mr-1.5" />
              Depended on by ({incoming.length})
            </h3>
            <div className="space-y-3">
              {incoming.map((e) => (
                <div key={e.from} className="rounded-lg border border-border p-3 md:p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Link
                      to="/projects/$projectId/groups/$name"
                      params={{ projectId, name: e.from }}
                      className="font-medium text-sm hover:underline"
                      style={{ color: GROUP_COLORS[e.from] ?? "#6b7280" }}
                    >
                      {e.from}
                    </Link>
                    <span className="text-xs text-muted-foreground">{e.weight} edges</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {e.symbols.map((s) => (
                      <span
                        key={s}
                        className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* File-level edges */}
        {(fileEdgesOut.length > 0 || fileEdgesIn.length > 0) && (
          <section>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              File-Level Imports
            </h3>
            <div className="rounded-lg border border-border overflow-hidden">
              {fileEdgesOut.map((e, i) => (
                <div
                  key={`out-${i}`}
                  className={`px-3 md:px-4 py-2 md:py-2.5 text-xs font-mono ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-foreground truncate min-w-0">{e.from}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground truncate min-w-0">{e.to}</span>
                  </div>
                  <div className="text-muted-foreground mt-1 truncate">{e.symbols.join(", ")}</div>
                </div>
              ))}
              {fileEdgesIn.map((e, i) => (
                <div
                  key={`in-${i}`}
                  className={`px-3 md:px-4 py-2 md:py-2.5 text-xs font-mono ${fileEdgesOut.length > 0 || i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground truncate min-w-0">{e.from}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-foreground truncate min-w-0">{e.to}</span>
                  </div>
                  <div className="text-muted-foreground mt-1 truncate">{e.symbols.join(", ")}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
