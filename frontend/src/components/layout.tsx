import { useState, useEffect } from "react";
import { Outlet, Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  GitBranch,
  Menu,
  X,
  ChevronDown,
  BookMarked,
  Settings,
} from "lucide-react";
import { cn } from "../lib/utils";
import { loadGraphData, GraphDataContext, useGraphData } from "../lib/graph-data";
import type { GraphData } from "../lib/graph-data";

const GROUP_COLORS: Record<string, string> = {
  UI: "#3b82f6",
  API: "#10b981",
  "Graph Extraction": "#8b5cf6",
  Classification: "#f59e0b",
  Types: "#ec4899",
};

function RepoSelector() {
  return (
    <div className="px-3 py-3 border-b border-border space-y-1.5">
      <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors group">
        <BookMarked className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">clanki-ai/clanki</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0 group-hover:text-foreground transition-colors" />
      </button>
      <button className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group">
        <GitBranch className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">main</span>
        <ChevronDown className="w-3.5 h-3.5 ml-auto shrink-0 group-hover:text-foreground transition-colors" />
      </button>
    </div>
  );
}

function UserProfile() {
  return (
    <div className="p-3 border-t border-border">
      <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer group">
        <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
          JD
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">Jane Doe</p>
          <p className="text-[11px] text-muted-foreground truncate">jane@example.com</p>
        </div>
        <Settings className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const data = useGraphData();

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">Clanki</h1>
          <p className="text-xs text-muted-foreground mt-1">Architecture Explorer</p>
        </div>
        <button
          className="md:hidden p-1 rounded-md hover:bg-accent text-muted-foreground"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <RepoSelector />

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-accent text-accent-foreground" }}
          inactiveProps={{
            className: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
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

      <UserProfile />

      {data && (
        <div className="px-4 py-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch className="w-3.5 h-3.5" />
          {data.classifications.length} files · {data.groupEdges.length} deps
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const [data, setData] = useState<GraphData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    loadGraphData().then(setData);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <GraphDataContext.Provider value={data}>
      <div className="flex h-screen bg-background text-foreground">
        {/* Mobile backdrop */}
        <div
          className={cn(
            "fixed inset-0 bg-black/50 z-40 transition-opacity md:hidden",
            sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transition-transform duration-200 ease-in-out",
            "md:relative md:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Mobile header */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <button
              className="p-1 rounded-md hover:bg-accent text-muted-foreground"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-sm">Clanki</span>
          </div>

          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </GraphDataContext.Provider>
  );
}
