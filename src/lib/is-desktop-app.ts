export function isDesktopApp(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    return "clankiDesktop" in (window as Window & { clankiDesktop?: unknown });
}
