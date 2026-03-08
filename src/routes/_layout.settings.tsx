import { createFileRoute } from "@tanstack/react-router";
import { projectsCollection } from "@/lib/collections";
import { SettingsPage } from "@/pages/settings-page";

export const Route = createFileRoute("/_layout/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { addProject?: boolean; installApp?: boolean } => {
    const addProject = search.addProject === "1" || search.addProject === true;
    const installApp = search.installApp === "1" || search.installApp === true;

    return {
      ...(addProject ? { addProject: true } : {}),
      ...(installApp ? { installApp: true } : {}),
    };
  },
  loader: () => {
    if (typeof window === "undefined") {
      return;
    }

    return projectsCollection.preload();
  },
  component: SettingsPage,
});
