export function isDesktopApp(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return "__TAURI_INTERNALS__" in (window as Window & { __TAURI_INTERNALS__?: unknown });
}
