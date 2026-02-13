import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { signOut, useSession } from "../../lib/auth-client";

type UserMenuProps = {
  showIdentity?: boolean;
  menuDirection?: "up" | "down";
};

export function UserMenu({ showIdentity = false, menuDirection = "down" }: UserMenuProps) {
  const { data: session } = useSession();
  const navigate = useNavigate();

  if (!session) return null;

  const { user } = session;
  const initials = user.name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const menuSide = menuDirection === "up" ? "top" : "bottom";

  return (
    <div className={cn(showIdentity && "w-full")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-auto items-center gap-2 rounded-md px-2.5 py-2",
              showIdentity ? "w-full justify-start" : "w-auto justify-center",
            )}
          >
            <Avatar size="sm">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            {showIdentity ? (
              <span className="truncate text-sm font-medium">{user.name}</span>
            ) : null}
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={menuSide}
          align="end"
          className={cn(showIdentity ? "w-(--radix-dropdown-menu-trigger-width)" : "w-64")}
        >
          <DropdownMenuLabel className="px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() =>
              void signOut({
                fetchOptions: {
                  onSuccess: () => navigate({ to: "/login" }),
                },
              })
            }
          >
            <LogOut className="h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
