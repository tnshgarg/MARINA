"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('marina', {
    getDefaults: () => electron_1.ipcRenderer.invoke('marina:pairing:defaults'),
    submit: (payload) => electron_1.ipcRenderer.invoke('marina:pairing:submit', payload),
    cancel: () => electron_1.ipcRenderer.invoke('marina:pairing:cancel'),
});
//# sourceMappingURL=preload-pairing.js.map