const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("leeveLimpeza", {
  platform: process.platform,
  app: "LeeveLimpeza",
});
