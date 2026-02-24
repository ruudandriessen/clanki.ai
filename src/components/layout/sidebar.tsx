import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "./org-switcher";
import { TaskList } from "./task-list";
import { UserMenu } from "./user-menu";

type SidebarProps = {
  onClose: () => void;
};

export function Sidebar({ onClose }: SidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end border-b border-border px-4 py-3 md:hidden">
        <Button
          className="text-foreground md:hidden"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <OrgSwitcher />

      <TaskList />

      <div className="border-t border-border bg-muted/20">
        <div className="p-2">
          <UserMenu showIdentity menuDirection="up" />
        </div>
      </div>
    </div>
  );
}
