import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  variant?: "button" | "menu-item";
  className?: string;
};

export function ThemeToggle({ variant = "button", className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Light mode" : "Dark mode";

  if (variant === "menu-item") {
    return (
      <DropdownMenuItem onSelect={toggleTheme} className={className}>
        <Icon className="h-4 w-4" />
        {label}
      </DropdownMenuItem>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggleTheme}
      className={cn("justify-start", className)}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}
