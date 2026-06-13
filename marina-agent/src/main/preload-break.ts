import { contextBridge, ipcRenderer } from 'electron'

type BreakCategory = 'focus' | 'meeting' | 'blocked' | 'lunch' | 'errand' | 'personal' | 'other'

type StartPayload = {
  reason: string
  category: BreakCategory
  waitingOnUserId?: number | null
  waitingOnExternal?: string | null
  expectedEndAt?: string | null
}

contextBridge.exposeInMainWorld('marina', {
  getState: () => ipcRenderer.invoke('marina:break:state'),
  start: (payload: StartPayload) => ipcRenderer.invoke('marina:break:start', payload),
  end: () => ipcRenderer.invoke('marina:break:end'),
  close: () => ipcRenderer.invoke('marina:break:close'),
  roster: () => ipcRenderer.invoke('marina:break:roster'),
})
