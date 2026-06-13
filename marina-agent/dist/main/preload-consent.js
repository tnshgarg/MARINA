"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('marina', {
    accept: () => electron_1.ipcRenderer.invoke('marina:consent:accept'),
    decline: () => electron_1.ipcRenderer.invoke('marina:consent:decline'),
});
//# sourceMappingURL=preload-consent.js.map