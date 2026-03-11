import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { localStorageKeys } from "@/lib/session-state";
import {
  applyTheme,
  type ClankerId,
  defaultTheme,
  getStoredTheme,
  getThemeMode,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ClankerId;
  mode: ThemeMode;
  setTheme: (theme: ClankerId) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ClankerId>(defaultTheme);

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const mode = getThemeMode(theme);

  const setTheme = (nextTheme: ClankerId) => {
    setThemeState(nextTheme);

    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(localStorageKeys.theme().storageKey, nextTheme);
    } catch {
      return;
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
