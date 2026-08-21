const { app, BrowserWindow, shell } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;
let nextProcess = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "LeeveLimpeza",
    autoHideMenuBar: true,
    backgroundColor: "#020617",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL("http://localhost:3000");
}

function startNext() {
  if (isDev) return;
  const serverPath = path.join(process.resourcesPath, "app", "server.js");
  if (!fs.existsSync(serverPath)) return;
  nextProcess = fork(serverPath, [], {
    cwd: path.dirname(serverPath),
    env: { ...process.env, PORT: "3000", NODE_ENV: "production" },
    stdio: "pipe",
  });
}

app.whenReady().then(() => {
  startNext();
  setTimeout(createWindow, isDev ? 200 : 1500);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextProcess) nextProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
