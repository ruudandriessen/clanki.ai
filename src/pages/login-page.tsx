import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signIn } from "../lib/auth-client";

export function LoginPage() {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleGitHubSignIn = async () => {
    setSignInError(null);
    setIsSigningIn(true);

    try {
      const callbackUrl = new URL("/", window.location.origin);
      callbackUrl.searchParams.set("installApp", "1");

      const result = await signIn.social({
        provider: "github",
        callbackURL: callbackUrl.toString(),
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
          <div className="text-center">
            <h1 className="text-3xl tracking-[0.06em] text-foreground">Clanki</h1>
            <p className="mt-2 text-sm text-muted-foreground">Build your ideas from anywhere</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGitHubSignIn}
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <Github className="h-4 w-4" />
                Continue with GitHub
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
