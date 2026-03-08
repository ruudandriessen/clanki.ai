import { createFileRoute } from "@tanstack/react-router";
import { PendingAccessPage } from "@/pages/pending-access-page";

export const Route = createFileRoute("/pending-access")({
  component: PendingAccessPage,
});
