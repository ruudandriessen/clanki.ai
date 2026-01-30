import { useState, useEffect } from "react";
import { Outlet, Link } from "@tanstack/react-router";
import { LayoutDashboard, GitBranch } from "lucide-react";
import {
  loadGraphData,
  GraphDataContext,
  useGraphData,
} from "../lib/graph-data";
import type { GraphData } from "../lib/graph-data";

const GROUP_COLORS: Record<string, string> = {
  UI: "#3b82f6",
  API: "#10b981",
  "Graph Extraction": "#8b5cf6",
  Classification: "#f59e0b",
  Types: "#ec4899",
};

function Sidebar() {
  const data = useGraphData();

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0">
      <div className="p-6 border-b border-border">
        <h1 className="text-lg font-bold text-foreground tracking-tight">
          Clanki
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Architecture Explorer
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-accent text-accent-foreground" }}
          inactiveProps={{
            className:
              "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          }}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          Architecture
        </Link>

        {data && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Groups
            </p>
            {data.groups.map((g) => (
              <Link
                key={g.name}
                to="/group/$name"
                params={{ name: g.name }}
                activeProps={{ className: "bg-accent text-accent-foreground" }}
                inactiveProps={{
                  className:
                    "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
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

      {data && (
        <div className="p-4 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch className="w-3.5 h-3.5" />
          {data.classifications.length} files · {data.groupEdges.length} deps
        </div>
      )}
    </aside>
  );
}

export function Layout() {
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    loadGraphData().then(setData);
  }, []);

  return (
    <GraphDataContext.Provider value={data}>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </GraphDataContext.Provider>
  );
}
