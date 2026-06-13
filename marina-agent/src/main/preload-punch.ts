import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('marina', {
  getState: () => ipcRenderer.invoke('marina:punch:state'),
  punchOut: (payload: { summary: string }) => ipcRenderer.invoke('marina:punch:out', payload),
  close: () => ipcRenderer.invoke('marina:punch:close'),
})
