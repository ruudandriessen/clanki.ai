import { HotkeysProvider } from "@tanstack/react-hotkeys";
/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import appCss from "@/index.css?url";
import { themeInitializationScript } from "@/lib/theme";

import type { ReactNode } from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "theme-color", content: "#eaf1f8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1.0, maximum-scale=1.0, interactive-widget=resizes-content",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: Outlet,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>
        <ThemeProvider>
          <HotkeysProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </HotkeysProvider>
          <Scripts />
        </ThemeProvider>
      </body>
    </html>
  );
}
