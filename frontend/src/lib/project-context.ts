import { createContext, useContext } from "react";

export interface ProjectContext {
  projectId: string;
  snapshotId: string;
}

export const ActiveProjectContext = createContext<ProjectContext | null>(null);

export function useActiveProject(): ProjectContext | null {
  return useContext(ActiveProjectContext);
}
