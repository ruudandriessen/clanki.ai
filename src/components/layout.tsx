import { useEffect, useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { RunnerSessionsProvider } from "@/lib/runner-sessions";
import { cn } from "../lib/utils";
import { useSession } from "../lib/auth-client";
import { MobileHeader } from "./layout/mobile-header";
import { Sidebar } from "./layout/sidebar";

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
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-foreground" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <RunnerSessionsProvider>
      <div className="neo-enter flex h-dvh bg-background text-foreground">
        <div
          className={cn(
            "fixed inset-0 z-40 bg-[rgb(18_18_18_/_0.32)] backdrop-blur-[1px] transition-opacity md:hidden",
            sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          onClick={() => setSidebarOpen(false)}
        />

        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-full max-w-full overflow-hidden border-r border-border bg-card transition-transform duration-200 ease-in-out",
            "md:relative md:w-72 md:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <main className="neo-scroll flex-1 overflow-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
            <Outlet />
          </main>

          <MobileHeader
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((currentOpen) => !currentOpen)}
          />
        </div>
      </div>
    </RunnerSessionsProvider>
  );
}
