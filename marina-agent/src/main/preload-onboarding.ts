import { contextBridge, ipcRenderer } from 'electron'

type PairPayload = { serverBaseUrl: string; code: string; label: string }

contextBridge.exposeInMainWorld('marina', {
  getDefaults: () => ipcRenderer.invoke('marina:onboarding:defaults'),
  consent: () => ipcRenderer.invoke('marina:onboarding:consent'),
  decline: () => ipcRenderer.invoke('marina:onboarding:decline'),
  pair: (payload: PairPayload) => ipcRenderer.invoke('marina:onboarding:pair', payload),
  openWeb: (url: string) => ipcRenderer.invoke('marina:onboarding:open-web', url),
  finish: () => ipcRenderer.invoke('marina:onboarding:finish'),
})
