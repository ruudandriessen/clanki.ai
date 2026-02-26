import { OrgSwitcher } from "./org-switcher";
import { TaskList } from "./task-list";
import { UserMenu } from "./user-menu";

export function Sidebar() {
  return (
    <div className="flex h-full flex-col">
      <div className="hidden md:block">
        <OrgSwitcher />
      </div>

      <div className="flex min-h-0 flex-1">
        <TaskList />
      </div>

      <div className="hidden border-t border-border bg-muted/20 md:block">
        <div className="p-2">
          <UserMenu showIdentity menuDirection="up" />
        </div>
      </div>
    </div>
  );
}
