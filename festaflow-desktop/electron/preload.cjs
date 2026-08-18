const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("festaflow", {
  platform: process.platform,
  version: "1.0.0",
});
