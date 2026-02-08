import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Menu, X, LogOut, Loader2, Building2, Pencil, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { useSession, signOut, authClient } from "../lib/auth-client";

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

function UserProfile() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  if (!session) return null;

  const { user } = session;
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="p-3 border-t border-border">
      <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md group">
        {user.image ? (
          <img src={user.image} alt={user.name} className="w-7 h-7 rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ fetchOptions: { onSuccess: () => navigate({ to: "/login" }) } })}
          className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          title="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
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
      <span className="font-semibold text-sm truncate">{orgName ?? "Clanki"}</span>
    </div>
  );
}

function Sidebar({ onClose, children }: { onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <div>
          <Link to="/">
            <h1 className="text-lg font-bold text-foreground tracking-tight">Clanki</h1>
          </Link>
          <p className="text-xs text-muted-foreground mt-1">Architecture Explorer</p>
        </div>
        <button
          className="md:hidden p-1 rounded-md hover:bg-accent text-muted-foreground"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <OrgSwitcher />

      {children}

      <UserProfile />
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
