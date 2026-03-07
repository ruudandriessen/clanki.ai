import { ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { openDesktopWorkspaceInEditor, type DesktopWorkspaceEditor } from "@/lib/desktop-runner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OpenEditorDropdownProps = {
  onError?: (message: string | null) => void;
  workspacePath: string;
};

const EDITOR_OPTIONS: Array<{
  editor: DesktopWorkspaceEditor;
  label: string;
}> = [
  { editor: "cursor", label: "Cursor" },
  { editor: "zed", label: "Zed" },
  { editor: "vscode", label: "VS Code" },
];

export function OpenEditorDropdown({ onError, workspacePath }: OpenEditorDropdownProps) {
  const [openingEditor, setOpeningEditor] = useState<DesktopWorkspaceEditor | null>(null);

  async function handleOpenEditor(editor: DesktopWorkspaceEditor) {
    onError?.(null);
    setOpeningEditor(editor);

    try {
      await openDesktopWorkspaceInEditor({
        editor,
        workspaceDirectory: workspacePath,
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Failed to open workspace");
    } finally {
      setOpeningEditor(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="xs" disabled={openingEditor !== null}>
          Open in
          {openingEditor ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>Open workspace in</DropdownMenuLabel>
        {EDITOR_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.editor}
            disabled={openingEditor !== null}
            onSelect={() => {
              void handleOpenEditor(option.editor);
            }}
          >
            {option.label}
            <ExternalLink className="ml-auto h-3.5 w-3.5" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
