import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { signIn, useSession } from "../lib/auth-client";

export function LoginPage() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isPending && session) {
      navigate({ to: "/" });
    }
  }, [isPending, session, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clanki</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to explore your architecture</p>
        </div>

        <button
          type="button"
          onClick={() =>
            signIn.social({
              provider: "github",
              callbackURL: new URL("/", window.location.origin).toString(),
            })
          }
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Github className="h-4 w-4" />
          Continue with GitHub
        </button>
      </div>
    </div>
  );
}
