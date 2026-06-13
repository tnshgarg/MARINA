import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('marina', {
  getDefaults: () => ipcRenderer.invoke('marina:pairing:defaults'),
  submit: (payload: { serverBaseUrl: string; code: string; label: string }) =>
    ipcRenderer.invoke('marina:pairing:submit', payload),
  cancel: () => ipcRenderer.invoke('marina:pairing:cancel'),
})
