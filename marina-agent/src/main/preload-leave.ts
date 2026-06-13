import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('marina', {
  getState: () => ipcRenderer.invoke('marina:leave:state'),
  submit: (payload: { startDate: string; endDate: string; reason: string }) =>
    ipcRenderer.invoke('marina:leave:submit', payload),
  close: () => ipcRenderer.invoke('marina:leave:close'),
})
