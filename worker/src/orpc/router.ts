import { os } from "./router/context";
import { installationsRouter } from "./router/installations";
import { projectsRouter } from "./router/projects";
import { settingsRouter } from "./router/settings";
import { tasksRouter } from "./router/tasks";

export const orpcRouter = os.router({
  installations: installationsRouter,
  projects: projectsRouter,
  tasks: tasksRouter,
  settings: settingsRouter,
});
