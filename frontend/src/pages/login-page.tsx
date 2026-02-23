import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      <Card className="neo-enter w-full max-w-sm">
        <CardContent className="space-y-6 px-6 py-8">
          <div className="text-center">
            <h1 className="text-3xl tracking-[0.06em] text-foreground uppercase">Clanki</h1>
            <p className="mt-2 text-sm text-muted-foreground">hello!</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              signIn.social({
                provider: "github",
                callbackURL: new URL("/", window.location.origin).toString(),
              })
            }
          >
            <Github className="h-4 w-4" />
            Continue with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
