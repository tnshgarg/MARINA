"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('marina', {
    getState: () => electron_1.ipcRenderer.invoke('marina:punch:state'),
    punchOut: (payload) => electron_1.ipcRenderer.invoke('marina:punch:out', payload),
    close: () => electron_1.ipcRenderer.invoke('marina:punch:close'),
});
//# sourceMappingURL=preload-punch.js.map