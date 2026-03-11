import { localStorageKeys } from "@/lib/session-state";

export type ThemeMode = "light" | "dark";

export type ClankerId = "r2d2" | "k2so" | "bb8" | "ig11" | "bd1" | "ig88";

export type ClankerThemeOption = {
  id: ClankerId;
  label: string;
  description: string;
  mode: ThemeMode;
  themeColor: string;
  previewColors: string[];
};

type ClankerThemeOptions = Record<ClankerId, ClankerThemeOption>;

export const themeOptions = {
  r2d2: {
    id: "r2d2",
    label: "R2-D2",
    description: "Clean rebel blue with bright white panels.",
    mode: "light",
    themeColor: "#eaf1f8",
    previewColors: ["#1f6fdb", "#f8fbff", "#2b4b69"],
  },
  bb8: {
    id: "bb8",
    label: "BB-8",
    description: "Warm sand tones with an orange spark.",
    mode: "light",
    themeColor: "#f5e6d4",
    previewColors: ["#e8791d", "#fffaf2", "#744523"],
  },
  bd1: {
    id: "bd1",
    label: "BD-1",
    description: "Bright explorer white with red and teal details.",
    mode: "light",
    themeColor: "#ecf6f4",
    previewColors: ["#e3554f", "#f8fbfb", "#2f8f92"],
  },
  k2so: {
    id: "k2so",
    label: "K-2SO",
    description: "Stealth black with imperial red highlights.",
    mode: "dark",
    themeColor: "#111317",
    previewColors: ["#f05a5a", "#191d22", "#8d96a3"],
  },
  ig88: {
    id: "ig88",
    label: "IG-88",
    description: "Hunter-killer black steel with cold amber targeting.",
    mode: "dark",
    themeColor: "#131415",
    previewColors: ["#c98f43", "#1c1f22", "#8d949c"],
  },

  ig11: {
    id: "ig11",
    label: "IG-11",
    description: "Gunmetal steel with muted olive instrumentation.",
    mode: "dark",
    themeColor: "#151816",
    previewColors: ["#95a878", "#242b26", "#c8d0c7"],
  },
} as const satisfies ClankerThemeOptions;

export const defaultTheme: ClankerId = "r2d2";

const themeStorageKey = localStorageKeys.theme().storageKey;

function resolveTheme(value: unknown) {
  return Object.keys(themeOptions).includes(value as ClankerId)
    ? (value as ClankerId)
    : defaultTheme;
}

export function getThemeMode(theme: ClankerId) {
  return themeOptions[theme].mode;
}

export function getThemeColor(theme: ClankerId) {
  return themeOptions[theme].themeColor;
}

export function applyTheme(theme: ClankerId) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const mode = getThemeMode(theme);
  root.dataset.theme = theme;
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode ?? "light";

  const themeColorMeta = document.querySelector('meta[name="theme-color"]');

  if (themeColorMeta instanceof HTMLMetaElement) {
    themeColorMeta.content = getThemeColor(theme) ?? themeOptions[defaultTheme].themeColor;
  }
}

export function getStoredTheme(): ClankerId {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  try {
    return resolveTheme(window.localStorage.getItem(themeStorageKey));
  } catch {
    return defaultTheme;
  }
}

export const themeInitializationScript = `(function(){var defaults={theme:${JSON.stringify(
  defaultTheme,
)},mode:${JSON.stringify(themeOptions[defaultTheme].mode)},themeColor:${JSON.stringify(
  themeOptions[defaultTheme].themeColor,
)}};try{var themeModes=${JSON.stringify(themeOptions)};var themeColors=${JSON.stringify(
  themeOptions,
)};var themeIds=${JSON.stringify(Object.keys(themeOptions).join(","))};var storedTheme=localStorage.getItem(${JSON.stringify(
  themeStorageKey,
)});var resolved=themeIds.indexOf(storedTheme)>-1?storedTheme:defaults.theme;var root=document.documentElement;root.dataset.theme=resolved;root.classList.toggle("dark",themeModes[resolved]==="dark");root.style.colorScheme=themeModes[resolved]||defaults.mode;var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute("content",themeColors[resolved]||defaults.themeColor)}}catch(_error){var root=document.documentElement;root.dataset.theme=defaults.theme;root.classList.toggle("dark",defaults.mode==="dark");root.style.colorScheme=defaults.mode;}})();`;
