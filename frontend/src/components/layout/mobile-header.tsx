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
    <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        onClick={onOpenSidebar}
      >
        <Menu className="w-5 h-5" />
      </Button>
      <span className="font-semibold text-sm truncate">{orgName ?? "Organization"}</span>
      <div className="ml-auto">
        <UserMenu />
      </div>
    </div>
  );
}
