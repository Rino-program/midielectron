"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => {
      electron.ipcRenderer.on(channel, (_event, ...args) => listener(...args));
    },
    off: (channel, listener) => {
      electron.ipcRenderer.off(channel, (_event, ...args) => listener(...args));
    }
  }
});
