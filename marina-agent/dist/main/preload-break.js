"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('marina', {
    getState: () => electron_1.ipcRenderer.invoke('marina:break:state'),
    start: (payload) => electron_1.ipcRenderer.invoke('marina:break:start', payload),
    end: () => electron_1.ipcRenderer.invoke('marina:break:end'),
    close: () => electron_1.ipcRenderer.invoke('marina:break:close'),
    roster: () => electron_1.ipcRenderer.invoke('marina:break:roster'),
});
//# sourceMappingURL=preload-break.js.map