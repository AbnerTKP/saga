import { contextBridge, ipcRenderer } from 'electron';

const desktop = {
  platform: process.platform,
  listSources: () => ipcRenderer.invoke('sources:list'),
  chooseSource: (id: string, audio: 'nao' | 'loopbackWithoutChrome' | 'loopback' | 'loopbackWithMute') => ipcRenderer.invoke('sources:choose', id, audio),
  screenPermission: (): Promise<string> => ipcRenderer.invoke('screen:permission'),
  usaSeletorDoSistema: (): Promise<boolean> => ipcRenderer.invoke('screen:seletorDoSistema'),
  openScreenSettings: () => ipcRenderer.invoke('screen:openSettings'),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  registrar: (nivel: 'erro' | 'aviso' | 'info', origem: string, mensagem: string) =>
    ipcRenderer.invoke('log:escrever', nivel, origem, mensagem),
  lerRegistro: (): Promise<string> => ipcRenderer.invoke('log:ler'),
  copiarRegistro: (texto: string) => ipcRenderer.invoke('log:copiar', texto),
  abrirPastaDoRegistro: () => ipcRenderer.invoke('log:abrirPasta'),
  onUpdate: (cb: (s: unknown) => void) => { ipcRenderer.on('update:state', (_e, s) => cb(s)); },
  updateAtual: (): Promise<unknown> => ipcRenderer.invoke('update:atual'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  openExternal: (url: string) => ipcRenderer.invoke('open:external', url),
  /** Segundos que a MÁQUINA está parada. É a única forma de saber que a pessoa saiu de
      perto: dentro da janela, ninguém vê teclado nem mouse fora do app. */
  ociosidade: (): Promise<number> => ipcRenderer.invoke('presenca:ociosidade'),
};

contextBridge.exposeInMainWorld('desktop', desktop);

export type Desktop = typeof desktop;
