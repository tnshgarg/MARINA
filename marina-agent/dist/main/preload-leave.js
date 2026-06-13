"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('marina', {
    getState: () => electron_1.ipcRenderer.invoke('marina:leave:state'),
    submit: (payload) => electron_1.ipcRenderer.invoke('marina:leave:submit', payload),
    close: () => electron_1.ipcRenderer.invoke('marina:leave:close'),
});
//# sourceMappingURL=preload-leave.js.map