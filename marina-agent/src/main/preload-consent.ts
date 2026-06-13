import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('marina', {
  accept: () => ipcRenderer.invoke('marina:consent:accept'),
  decline: () => ipcRenderer.invoke('marina:consent:decline'),
})
