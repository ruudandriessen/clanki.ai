import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { MobileHeader } from "./layout/mobile-header";
import { Sidebar } from "./layout/sidebar";
import { AppQueryProvider } from "@/components/app-query-provider";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <AppQueryProvider>
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
    </AppQueryProvider>
  );
}
