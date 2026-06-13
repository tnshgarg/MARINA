import { contextBridge, ipcRenderer } from 'electron'

type SubmitPayload = {
  title: string
  url?: string | null
}

contextBridge.exposeInMainWorld('marina', {
  getState: () => ipcRenderer.invoke('marina:done:state'),
  submit: (payload: SubmitPayload) => ipcRenderer.invoke('marina:done:submit', payload),
  cancel: () => ipcRenderer.invoke('marina:done:cancel'),
})
