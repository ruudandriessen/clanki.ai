import {
  createRouter,
  createRoute,
  createRootRoute,
} from "@tanstack/react-router";
import { Layout } from "./components/layout";
import { GraphPage } from "./pages/graph-page";
import { GroupDetailPage } from "./pages/group-page";

const rootRoute = createRootRoute({
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: GraphPage,
});

const groupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$name",
  component: GroupDetailPage,
});

const routeTree = rootRoute.addChildren([indexRoute, groupRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
