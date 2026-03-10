import { detectPlatform } from "@tanstack/hotkeys";

interface HotkeyDef {
    keys: string;
    label: string;
}

export const hotkeys = {
    newTask: { keys: "Mod+N", label: "New task" },
    createPr: { keys: "Mod+Shift+P", label: "Create PR" },
} as const satisfies Record<string, HotkeyDef>;

const isMac = detectPlatform() === "mac";

export function formatKeys(keys: string): string[] {
    return keys.split("+").map((part) => {
        if (part === "Mod") return isMac ? "⌘" : "Ctrl";
        if (part === "Shift") return isMac ? "⇧" : "Shift";
        if (part === "Alt") return isMac ? "⌥" : "Alt";
        return part.toUpperCase();
    });
}
