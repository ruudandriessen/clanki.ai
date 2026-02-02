import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/react-router";
import { Layout } from "./components/layout";
import { GraphPage } from "./pages/graph-page";
import { GroupDetailPage } from "./pages/group-page";
import { LoginPage } from "./pages/login-page";

const rootRoute = createRootRoute({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "layout",
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/",
  component: GraphPage,
});

const groupRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/group/$name",
  component: GroupDetailPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([indexRoute, groupRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
