const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clankiDesktop", {
  createRunnerSession(title, repoUrl) {
    return ipcRenderer.invoke("desktop-runner:create-session", { repoUrl, title });
  },
  ensureRunnerConnection(repoUrl) {
    return ipcRenderer.invoke("desktop-runner:ensure-connection", repoUrl);
  },
  promptRunnerTask(args) {
    return ipcRenderer.invoke("desktop-runner:prompt-task", args);
  },
});
