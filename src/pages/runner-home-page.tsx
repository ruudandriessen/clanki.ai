import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useRunnerSessions } from "@/lib/runner-sessions";

export function RunnerHomePage() {
  const navigate = useNavigate();
  const { error, isDesktopApp, isLoading, sessions } = useRunnerSessions();

  useEffect(() => {
    if (isLoading || sessions.length === 0) {
      return;
    }

    navigate({
      to: "/runner/$sessionId",
      params: { sessionId: sessions[0].id },
      replace: true,
    });
  }, [isLoading, navigate, sessions]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="neo-surface max-w-lg rounded-[var(--radius-md)] p-6 text-center">
        <p className="text-base font-semibold text-foreground">
          {isDesktopApp ? "Start a session from the sidebar" : "Runner sessions are desktop-only"}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ??
            "The current runner flow is intentionally minimal: pick or create a session in the sidebar to continue."}
        </p>
      </div>
    </div>
  );
}
