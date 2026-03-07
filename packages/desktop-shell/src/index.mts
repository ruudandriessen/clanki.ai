import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { createAppServerController } from "./app-server.mjs";
import { createDesktopRunnerController } from "./desktop-runner.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.cwd();
const appServerController = createAppServerController({ workspaceRoot });
const desktopRunnerController = createDesktopRunnerController({ workspaceRoot });

let isQuitting = false;

function registerIpcHandlers(): void {
  ipcMain.handle("desktop-runner:create-session", async (_event, args) => {
    return await desktopRunnerController.createRunnerSession(args);
  });

  ipcMain.handle("desktop-runner:delete-workspace", async (_event, args) => {
    return await desktopRunnerController.deleteRunnerWorkspace(args);
  });

  ipcMain.handle("desktop-runner:list-models", async (_event, args) => {
    return await desktopRunnerController.listRunnerModels(args);
  });

  ipcMain.handle("desktop-runner:open-workspace-in-editor", async (_event, args) => {
    return await desktopRunnerController.openWorkspaceInEditor(args);
  });

  ipcMain.handle("desktop-runner:prompt-task", async (_event, args) => {
    return await desktopRunnerController.promptRunnerTask(args);
  });
}

function isExternalUrl(targetUrl: string, appUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const appLocation = new URL(appUrl);

    if (target.protocol === "http:" || target.protocol === "https:") {
      return target.origin !== appLocation.origin;
    }

    return target.protocol === "mailto:";
  } catch {
    return false;
  }
}

async function createMainWindow(): Promise<BrowserWindow> {
  const appUrl = await appServerController.resolveAppUrl();
  const window = new BrowserWindow({
    title: "Clanki",
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 720,
    webPreferences: {
      preload: path.join(currentDirectory, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url, appUrl)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isExternalUrl(url, appUrl)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  await window.loadURL(appUrl);
  return window;
}

async function disposeControllers(): Promise<void> {
  await Promise.allSettled([appServerController.stop(), desktopRunnerController.stop()]);
}

registerIpcHandlers();

app
  .whenReady()
  .then(async () => {
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length > 0) {
        return;
      }

      await createMainWindow();
    });
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  event.preventDefault();

  void disposeControllers().finally(() => {
    app.quit();
  });
});
