import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { useSession, signOut } from "../../lib/auth-client";

type UserMenuProps = {
  showIdentity?: boolean;
  menuDirection?: "up" | "down";
};

export function UserMenu({ showIdentity = false, menuDirection = "down" }: UserMenuProps) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (!session) return null;

  const { user } = session;
  const initials = user.name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const menuPlacement = menuDirection === "up" ? "bottom-full mb-1" : "top-full mt-1";
  const menuWidth = showIdentity ? "w-full" : "w-64";

  return (
    <div className={cn("relative", showIdentity && "w-full")} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-accent transition-colors",
          showIdentity && "w-full",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {user.image ? (
          <img src={user.image} alt={user.name} className="w-7 h-7 rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
            {initials}
          </div>
        )}
        {showIdentity && <span className="text-sm font-medium truncate">{user.name}</span>}
        <ChevronDown
          className={cn("w-3.5 h-3.5 ml-auto text-muted-foreground", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 rounded-md border border-border bg-card text-card-foreground shadow-md z-10 overflow-hidden",
            menuPlacement,
            menuWidth,
          )}
        >
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>

          <nav className="p-1.5">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Link>

            <button
              type="button"
              onClick={() =>
                signOut({
                  fetchOptions: { onSuccess: () => navigate({ to: "/login" }) },
                })
              }
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
