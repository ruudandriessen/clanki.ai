import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/react-router";
import { Layout } from "./components/layout";
import { ProjectLayout } from "./components/project-layout";
import { GraphPage } from "./pages/graph-page";
import { GroupDetailPage } from "./pages/group-page";
import { LoginPage } from "./pages/login-page";
import { ProjectsPage } from "./pages/projects-page";

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

// Landing page — list of projects
const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/",
  component: ProjectsPage,
});

// Project-scoped layout that resolves snapshot and provides context
const projectRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/projects/$projectId",
  component: ProjectLayout,
});

// Optional snapshot param — graph view
const projectGraphRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/",
  component: GraphPage,
});

const snapshotGraphRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/snapshots/$snapshotId",
  component: GraphPage,
});

// Group detail within a project
const groupRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/groups/$name",
  component: GroupDetailPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([
    indexRoute,
    projectRoute.addChildren([projectGraphRoute, snapshotGraphRoute, groupRoute]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
