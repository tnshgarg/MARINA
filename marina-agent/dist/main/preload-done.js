"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('marina', {
    getState: () => electron_1.ipcRenderer.invoke('marina:done:state'),
    submit: (payload) => electron_1.ipcRenderer.invoke('marina:done:submit', payload),
    cancel: () => electron_1.ipcRenderer.invoke('marina:done:cancel'),
});
//# sourceMappingURL=preload-done.js.map