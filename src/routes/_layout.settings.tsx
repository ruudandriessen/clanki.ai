import { createFileRoute } from "@tanstack/react-router";
import { projectsCollection } from "@/lib/collections";
import { SettingsPage } from "@/pages/settings-page";

export const Route = createFileRoute("/_layout/settings")({
  loader: () => {
    if (typeof window === "undefined") {
      return;
    }

    return projectsCollection.preload();
  },
  component: SettingsPage,
});
