import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signIn } from "../lib/auth-client";

export function PendingAccessPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleRetry = async () => {
    setSignInError(null);
    setIsSigningIn(true);

    try {
      const result = await signIn.social({
        provider: "github",
        callbackURL: new URL("/", window.location.origin).toString(),
      });
      const error = result?.error;

      if (error) {
        setSignInError(error.message ?? "Unable to sign in with GitHub. Please try again.");
        setIsSigningIn(false);
      }
    } catch {
      setSignInError("Unable to sign in with GitHub. Please try again.");
      setIsSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="neo-enter w-full max-w-sm">
        <CardContent className="space-y-6 px-6 py-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl tracking-[0.06em] text-foreground">Access Pending</h1>
            <p className="text-sm text-muted-foreground">
              Your account is on the waitlist right now. Once you are approved, sign in again to
              continue.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleRetry}
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking Access...
              </>
            ) : (
              <>
                <Github className="h-4 w-4" />
                Try GitHub Sign-In Again
              </>
            )}
          </Button>

          {signInError ? (
            <p className="text-center text-sm text-destructive" role="alert">
              {signInError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
