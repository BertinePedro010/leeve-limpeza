const { app, BrowserWindow, shell } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const fs = require("fs");

let apiProcess = null;
const isDev = !app.isPackaged;

function backendEntry() {
  if (isDev) return path.join(__dirname, "../backend/dist/src/server.js");
  return path.join(process.resourcesPath, "backend/dist/src/server.js");
}

function frontendIndex() {
  if (isDev) return "http://localhost:5173";
  return path.join(__dirname, "../frontend/dist/index.html");
}

function startApi() {
  const dbPath = path.join(app.getPath("userData"), "festaflow.db");
  const bundledDb = isDev ? path.join(__dirname, "../backend/prisma/dev.db") : path.join(process.resourcesPath, "backend/prisma/dev.db");
  if (!fs.existsSync(dbPath) && fs.existsSync(bundledDb)) fs.copyFileSync(bundledDb, dbPath);
  const sqlitePath = dbPath.replace(/\\/g, "/");
  const env = { ...process.env, PORT: "3333", DATABASE_URL: `file:${sqlitePath}`, JWT_SECRET: process.env.JWT_SECRET || "festaflow-desktop-secret" };
  const entry = backendEntry();
  if (fs.existsSync(entry)) apiProcess = fork(entry, [], { env, stdio: "pipe" });
}

function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 1100, minHeight: 720, title: "FestaFlow", autoHideMenuBar: true, backgroundColor: "#020617", webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  if (isDev) win.loadURL(frontendIndex()); else win.loadFile(frontendIndex());
}

app.whenReady().then(() => { startApi(); setTimeout(createWindow, 800); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { if (apiProcess) apiProcess.kill(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
