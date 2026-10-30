const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widget", {
  onData: (cb) => ipcRenderer.on("data", (_e, payload) => cb(payload)),
  ready: () => ipcRenderer.send("ready"),
  menu: () => ipcRenderer.send("menu"),
  resizeStart: (edge) => ipcRenderer.send("resize-start", edge),
  resizeEnd: () => ipcRenderer.send("resize-end"),
});
