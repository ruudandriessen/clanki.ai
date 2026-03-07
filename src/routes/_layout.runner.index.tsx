import { createFileRoute } from "@tanstack/react-router";
import { RunnerHomePage } from "@/pages/runner-home-page";

export const Route = createFileRoute("/_layout/runner/")({
  component: RunnerHomePage,
});
