import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrganization } from "./use-organization";
import { UserMenu } from "./user-menu";

type MobileHeaderProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function MobileHeader({ sidebarOpen, onToggleSidebar }: MobileHeaderProps) {
  const activeOrg = useOrganization();
  const orgName = activeOrg.data?.name;

  return (
    <div className="fixed right-0 bottom-0 left-0 z-[60] border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-foreground"
          onClick={onToggleSidebar}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          <span>{sidebarOpen ? "Close" : "Open"}</span>
        </Button>
        <span className="truncate text-[11px] font-bold tracking-[0.08em] uppercase text-muted-foreground">
          {orgName ?? "Organization"}
        </span>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}
