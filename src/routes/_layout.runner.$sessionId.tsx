import { createFileRoute } from "@tanstack/react-router";
import { RunnerSessionPage } from "@/pages/runner-session-page";

export const Route = createFileRoute("/_layout/runner/$sessionId")({
  component: () => {
    const { sessionId } = Route.useParams();

    return <RunnerSessionPage sessionId={sessionId} />;
  },
});
