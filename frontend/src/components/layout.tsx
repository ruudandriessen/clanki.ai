import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import {
  Menu,
  X,
  LogOut,
  Loader2,
  Building2,
  Pencil,
  Check,
  Settings,
  ChevronDown,
  Plus,
  MessageSquare,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useSession, signOut, authClient } from "../lib/auth-client";
import { tasksCollection, queryClient } from "../lib/collections";
import { createTask } from "../lib/api";

function useOrganization() {
  const activeOrg = authClient.useActiveOrganization();
  const orgs = authClient.useListOrganizations();

  // Auto-set active org if none is set but user has orgs
  useEffect(() => {
    if (!activeOrg.isPending && !activeOrg.data && orgs.data && orgs.data.length > 0) {
      authClient.organization.setActive({ organizationId: orgs.data[0].id });
    }
  }, [activeOrg.isPending, activeOrg.data, orgs.data]);

  return activeOrg;
}

function OrgSwitcher() {
  const activeOrg = useOrganization();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const org = activeOrg.data;
  if (!org) return null;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== org.name) {
      await authClient.organization.update({
        data: { name: trimmed },
        organizationId: org.id,
      });
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={handleSave}
            className="flex-1 min-w-0 px-2 py-1 rounded-md text-sm bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSave}
            className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-3 border-b border-border">
      <button
        type="button"
        onClick={() => {
          setName(org.name);
          setEditing(true);
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-foreground hover:bg-accent transition-colors group"
      >
        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="truncate font-medium">{org.name}</span>
        <Pencil className="w-3 h-3 text-muted-foreground ml-auto shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}

function UserMenu({
  showIdentity = false,
  menuDirection = "down",
}: {
  showIdentity?: boolean;
  menuDirection?: "up" | "down";
}) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (!session) return null;

  const { user } = session;
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const menuPlacement = menuDirection === "up" ? "bottom-full mb-1" : "top-full mt-1";
  const menuWidth = showIdentity ? "w-full" : "w-64";

  return (
    <div className={cn("relative", showIdentity && "w-full")} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-accent transition-colors",
          showIdentity && "w-full",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {user.image ? (
          <img src={user.image} alt={user.name} className="w-7 h-7 rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </div>
        )}
        {showIdentity && <span className="text-sm font-medium truncate">{user.name}</span>}
        <ChevronDown
          className={cn("w-3.5 h-3.5 ml-auto text-muted-foreground", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 rounded-md border border-border bg-card text-card-foreground shadow-md z-10 overflow-hidden",
            menuPlacement,
            menuWidth,
          )}
        >
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>

          <nav className="p-1.5">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>

            <button
              type="button"
              onClick={() =>
                signOut({
                  fetchOptions: { onSuccess: () => navigate({ to: "/login" }) },
                })
              }
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function MobileHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const activeOrg = authClient.useActiveOrganization();
  const orgName = activeOrg.data?.name;

  return (
    <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
      <button
        className="p-1 rounded-md hover:bg-accent text-muted-foreground"
        onClick={onOpenSidebar}
      >
        <Menu className="w-5 h-5" />
      </button>
      <span className="font-semibold text-sm truncate">{orgName ?? "Organization"}</span>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </div>
  );
}

function TaskList() {
  const { data: tasks, isLoading } = useLiveQuery((q) => q.from({ t: tasksCollection }));
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [creating, setCreating] = useState(false);

  async function handleNewTask() {
    if (creating) return;
    setCreating(true);
    try {
      const task = await createTask("New task");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Tasks
        </p>
        <button
          type="button"
          onClick={handleNewTask}
          disabled={creating}
          className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          title="New task"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : !tasks || tasks.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="text-xs text-muted-foreground">No tasks yet</p>
          </div>
        ) : (
          tasks.map((task) => {
            const isActive = pathname === `/tasks/${task.id}`;
            return (
              <Link
                key={task.id}
                to="/tasks/$taskId"
                params={{ taskId: task.id }}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors truncate",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{task.title}</span>
              </Link>
            );
          })
        )}
      </nav>
    </div>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const activeOrg = useOrganization();
  const orgName = activeOrg.data?.name ?? "Organization";

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/">
            <h1 className="text-lg font-bold text-foreground tracking-tight truncate">{orgName}</h1>
          </Link>
        </div>
        <button
          className="md:hidden p-1 rounded-md hover:bg-accent text-muted-foreground"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <OrgSwitcher />

      <TaskList />

      <div className="border-t border-border p-2">
        <UserMenu showIdentity menuDirection="up" />
      </div>
    </div>
  );
}

export function Layout() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [isPending, session, navigate]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  return (
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
        <MobileHeader onOpenSidebar={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
