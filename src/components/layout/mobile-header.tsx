import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "../../lib/auth-client";
import { UserMenu } from "./user-menu";

type MobileHeaderProps = {
  onOpenSidebar: () => void;
};

export function MobileHeader({ onOpenSidebar }: MobileHeaderProps) {
  const activeOrg = authClient.useActiveOrganization();
  const orgName = activeOrg.data?.name;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
      <Button variant="ghost" size="icon-sm" className="text-foreground" onClick={onOpenSidebar}>
        <Menu className="w-5 h-5" />
      </Button>
      <span className="truncate text-xs font-bold tracking-[0.08em] uppercase">
        {orgName ?? "Organization"}
      </span>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </div>
  );
}
