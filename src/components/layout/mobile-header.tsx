import { Menu, X } from "lucide-react";
import { useOrganization } from "./use-organization";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";

type MobileHeaderProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function MobileHeader({ sidebarOpen, onToggleSidebar }: MobileHeaderProps) {
  const activeOrg = useOrganization();
  const orgName = activeOrg.data?.name;

  return (
    <div className="fixed right-0 bottom-0 left-0 z-[60] px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
      <div className="mx-auto grid max-w-xl grid-cols-[auto_1fr_auto] items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card/95 px-2 py-2 shadow-[2px_2px_0_0_var(--color-border)] backdrop-blur">
        <Button
          variant={sidebarOpen ? "secondary" : "ghost"}
          size="icon-sm"
          className="text-foreground"
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span className="sr-only">{sidebarOpen ? "Close" : "Open"}</span>
        </Button>
        <span className="min-w-0 truncate px-1 text-center text-[11px] font-bold tracking-[0.08em] uppercase text-muted-foreground">
          {orgName ?? "Organization"}
        </span>
        <div className="justify-self-end">
          <UserMenu menuDirection="up" />
        </div>
      </div>
    </div>
  );
}
