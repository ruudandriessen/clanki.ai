import type { DesktopWorkspaceEditor } from "@clanki/protocol";
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clankiDesktop", {
  createRunnerSession(title: string, repoUrl: string) {
    return ipcRenderer.invoke("desktop-runner:create-session", { repoUrl, title });
  },
  deleteRunnerWorkspace(workspaceDirectory: string) {
    return ipcRenderer.invoke("desktop-runner:delete-workspace", { workspaceDirectory });
  },
  getRunnerArchitectureDiff(args: { directory: string }) {
    return ipcRenderer.invoke("desktop-runner:get-architecture-diff", args);
  },
  listRunnerModels(args: { directory: string }) {
    return ipcRenderer.invoke("desktop-runner:list-models", args);
  },
  openWorkspaceInEditor(args: { editor: DesktopWorkspaceEditor; workspaceDirectory: string }) {
    return ipcRenderer.invoke("desktop-runner:open-workspace-in-editor", args);
  },
});
