import { createFileRoute, redirect } from "@tanstack/react-router";
import { Layout } from "@/components/layout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_layout")({
  ssr: false,
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  component: Layout,
});
