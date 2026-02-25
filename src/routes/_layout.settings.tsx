import { createFileRoute } from "@tanstack/react-router";
import { projectsCollection, providerCredentialsCollection } from "@/lib/collections";
import { SettingsPage } from "@/pages/settings-page";

export const Route = createFileRoute("/_layout/settings")({
  loader: () => {
    if (typeof window === "undefined") {
      return;
    }

    return Promise.all([projectsCollection.preload(), providerCredentialsCollection.preload()]);
  },
  component: SettingsPage,
});
