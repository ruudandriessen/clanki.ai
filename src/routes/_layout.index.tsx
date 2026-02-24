import { createFileRoute } from "@tanstack/react-router";
import { IndexRedirect } from "@/pages/index-redirect";

export const Route = createFileRoute("/_layout/")({
  component: IndexRedirect,
});
