const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("festaflow", {
  platform: process.platform,
  app: "FestaFlow Supabase",
});
