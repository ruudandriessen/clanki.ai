import { ChevronDown, Loader2 } from "lucide-react";
import type { DesktopRunnerModelSelection } from "@/lib/desktop-runner";
import {
  getRunnerModelOptionGroups,
  parseRunnerModelSelection,
  serializeRunnerModelSelection,
  type RunnerModelOption,
} from "@/lib/runner-models";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type TaskModelPickerProps = {
  disabled?: boolean;
  error?: string | null;
  isLoading?: boolean;
  onChange: (selection: DesktopRunnerModelSelection | null) => void;
  options: RunnerModelOption[];
  value: DesktopRunnerModelSelection | null;
};

export function TaskModelPicker({
  disabled = false,
  error = null,
  isLoading = false,
  onChange,
  options,
  value,
}: TaskModelPickerProps) {
  const hasOptions = options.length > 0;
  const optionGroups = getRunnerModelOptionGroups(options);
  const selectedValue = serializeRunnerModelSelection(value);
  const selectedOption = options.find((option) => option.value === selectedValue) ?? null;
  const placeholder = isLoading
    ? "Loading models..."
    : error
      ? "Model list unavailable"
      : hasOptions
        ? "Select a model"
        : "No runner models";

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled || isLoading || !hasOptions}
              className={cn(
                "border-input hover:bg-input flex h-9 min-w-[220px] max-w-full justify-between rounded-[var(--radius-sm)] bg-input px-3 text-sm font-medium normal-case tracking-normal shadow-[2px_2px_0_0_var(--color-border)]",
                "focus-visible:ring-2 focus-visible:ring-ring/50",
                !selectedOption && "text-muted-foreground",
              )}
            >
              <span className="truncate">{selectedOption?.modelName ?? placeholder}</span>
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="top"
            className="max-h-80 w-[min(24rem,var(--radix-dropdown-menu-trigger-width))]"
          >
            <DropdownMenuRadioGroup
              value={selectedValue}
              onValueChange={(nextValue) => onChange(parseRunnerModelSelection(nextValue, options))}
            >
              {optionGroups.map((group, index) => (
                <div key={group.provider}>
                  {index > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel>{group.providerName}</DropdownMenuLabel>
                  {group.options.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.modelName}
                    </DropdownMenuRadioItem>
                  ))}
                </div>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
