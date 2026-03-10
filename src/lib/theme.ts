import { localStorageKeys } from "@/lib/session-state";

export type Theme = "light" | "dark";

export const defaultTheme: Theme = "light";

const themeColors: Record<Theme, string> = {
    light: "#eaf1f8",
    dark: "#101924",
};

const themeStorageKey = localStorageKeys.theme().storageKey;

function resolveTheme(value: unknown): Theme {
    return value === "dark" ? "dark" : defaultTheme;
}

export function applyTheme(theme: Theme) {
    if (typeof document === "undefined") {
        return;
    }

    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    if (themeColorMeta instanceof HTMLMetaElement) {
        themeColorMeta.content = themeColors[theme];
    }
}

export function getStoredTheme(): Theme {
    if (typeof window === "undefined") {
        return defaultTheme;
    }

    try {
        return resolveTheme(window.localStorage.getItem(themeStorageKey));
    } catch {
        return defaultTheme;
    }
}

export const themeInitializationScript = `(function(){try{var theme=localStorage.getItem(${JSON.stringify(
    themeStorageKey,
)});var resolved=theme==="dark"?"dark":"light";var root=document.documentElement;root.classList.toggle("dark",resolved==="dark");root.style.colorScheme=resolved;var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute("content",resolved==="dark"?${JSON.stringify(
    themeColors.dark,
)}:${JSON.stringify(themeColors.light)})}}catch(_error){document.documentElement.style.colorScheme="light";}})();`;
