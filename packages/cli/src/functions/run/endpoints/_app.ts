import { t } from "../trpc";
import { edgesRouter } from "./edges";
import { groupsRouter } from "./groups";
import { reportRouter } from "./report";

export const runAppRouter = t.router({
  groups: groupsRouter,
  edges: edgesRouter,
  report: reportRouter,
});

export type RunAppRouter = typeof runAppRouter;
