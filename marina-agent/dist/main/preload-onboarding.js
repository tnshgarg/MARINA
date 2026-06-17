"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('marina', {
    getDefaults: () => electron_1.ipcRenderer.invoke('marina:onboarding:defaults'),
    consent: () => electron_1.ipcRenderer.invoke('marina:onboarding:consent'),
    decline: () => electron_1.ipcRenderer.invoke('marina:onboarding:decline'),
    pair: (payload) => electron_1.ipcRenderer.invoke('marina:onboarding:pair', payload),
    openWeb: (url) => electron_1.ipcRenderer.invoke('marina:onboarding:open-web', url),
    finish: () => electron_1.ipcRenderer.invoke('marina:onboarding:finish'),
});
//# sourceMappingURL=preload-onboarding.js.map