import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SidebarFooter() {
  return (
    <div className="hidden border-t border-border bg-muted/20 md:block">
      <div className="p-2">
        <Button type="button" variant="ghost" className="w-full justify-start" asChild>
          <Link to="/settings">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      </div>
    </div>
  );
}
