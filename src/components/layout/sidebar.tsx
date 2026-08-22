import { SidebarFooter } from "./sidebar-footer";
import { SidebarHeader } from "./sidebar-header";
import { TaskList } from "./task-list";

export function Sidebar() {
  return (
    <div className="flex h-full flex-col">
      <SidebarHeader />

      <div className="flex min-h-0 flex-1">
        <TaskList />
      </div>

      <SidebarFooter />
    </div>
  );
}
