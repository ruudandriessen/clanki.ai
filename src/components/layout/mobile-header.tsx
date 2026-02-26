import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "./user-menu";

type MobileHeaderProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function MobileHeader({ sidebarOpen, onToggleSidebar }: MobileHeaderProps) {
  return (
    <div className="fixed right-0 bottom-0 left-0 z-[60] px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
      <div className="mx-auto flex max-w-xl items-center justify-between rounded-[var(--radius-md)] border border-border bg-card/95 px-2 py-2 shadow-[2px_2px_0_0_var(--color-border)] backdrop-blur">
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
        <div>
          <UserMenu menuDirection="up" />
        </div>
      </div>
    </div>
  );
}
