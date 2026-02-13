import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "./org-switcher";
import { TaskList } from "./task-list";
import { UserMenu } from "./user-menu";
import { useOrganization } from "./use-organization";

type SidebarProps = {
  onClose: () => void;
};

export function Sidebar({ onClose }: SidebarProps) {
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
        <Button
          className="md:hidden text-muted-foreground"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <OrgSwitcher />

      <TaskList />

      <div className="border-t border-border p-2">
        <UserMenu showIdentity menuDirection="up" />
      </div>
    </div>
  );
}
