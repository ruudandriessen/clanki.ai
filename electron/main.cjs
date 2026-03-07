const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { createAppServerController } = require("./app-server.cjs");
const { createDesktopRunnerController } = require("./desktop-runner.cjs");

const workspaceRoot = process.cwd();
const appServerController = createAppServerController({ workspaceRoot });
const desktopRunnerController = createDesktopRunnerController({ workspaceRoot });

let isQuitting = false;

function registerIpcHandlers() {
  ipcMain.handle("desktop-runner:create-session", async (_event, args) => {
    return await desktopRunnerController.createRunnerSession(args);
  });

  ipcMain.handle("desktop-runner:ensure-connection", async (_event, repoUrl) => {
    return await desktopRunnerController.ensureRunnerConnection(repoUrl);
  });

  ipcMain.handle("desktop-runner:prompt-task", async (_event, args) => {
    return await desktopRunnerController.promptRunnerTask(args);
  });
}

async function createMainWindow() {
  const appUrl = await appServerController.resolveAppUrl();
  const window = new BrowserWindow({
    title: "Clanki",
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await window.loadURL(appUrl);
  return window;
}

async function disposeControllers() {
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
