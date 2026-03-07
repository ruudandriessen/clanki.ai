import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clankiDesktop", {
  createRunnerSession(title: string, repoUrl: string) {
    return ipcRenderer.invoke("desktop-runner:create-session", { repoUrl, title });
  },
  deleteRunnerWorkspace(workspaceDirectory: string) {
    return ipcRenderer.invoke("desktop-runner:delete-workspace", { workspaceDirectory });
  },
  listRunnerModels(args: { directory: string }) {
    return ipcRenderer.invoke("desktop-runner:list-models", args);
  },
  promptRunnerTask(args: {
    backendBaseUrl: string;
    callbackToken: string;
    directory: string;
    executionId: string;
    model?: string;
    prompt: string;
    provider?: string;
    sessionId: string;
  }) {
    return ipcRenderer.invoke("desktop-runner:prompt-task", args);
  },
});
