import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "@/pages/login-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (session) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});
