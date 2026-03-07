import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/")({
  component: () => <Navigate to="/runner" replace />,
});
