import { contextBridge, ipcRenderer } from 'electron';

const desktop = {
  platform: process.platform,
  listSources: () => ipcRenderer.invoke('sources:list'),
  chooseSource: (id: string, audio: boolean) => ipcRenderer.invoke('sources:choose', id, audio),
  screenPermission: (): Promise<string> => ipcRenderer.invoke('screen:permission'),
  usaSeletorDoSistema: (): Promise<boolean> => ipcRenderer.invoke('screen:seletorDoSistema'),
  openScreenSettings: () => ipcRenderer.invoke('screen:openSettings'),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  onUpdate: (cb: (s: unknown) => void) => { ipcRenderer.on('update:state', (_e, s) => cb(s)); },
  updateAtual: (): Promise<unknown> => ipcRenderer.invoke('update:atual'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openExternal: (url: string) => ipcRenderer.invoke('open:external', url),
};

contextBridge.exposeInMainWorld('desktop', desktop);

export type Desktop = typeof desktop;
