import { createRouter, createRoute, createRootRoute, Outlet } from "@tanstack/react-router";
import { Layout } from "./components/layout";
import { LoginPage } from "./pages/login-page";
import { IndexRedirect } from "./pages/index-redirect";
import { SettingsPage } from "./pages/settings-page";
import { TaskPage } from "./pages/task-page";

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

// Landing page — redirect to first task or show empty state
const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/",
  component: IndexRedirect,
});

// Settings — project management
const settingsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/settings",
  component: SettingsPage,
});

// Task — chat view
const taskRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/tasks/$taskId",
  component: TaskPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([indexRoute, settingsRoute, taskRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
