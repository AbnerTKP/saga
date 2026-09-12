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
  /** Salva um anexo do chat com o diálogo do sistema. Nada é aberto nem executado. */
  salvarArquivo: (url: string, nome: string): Promise<{ ok: boolean; caminho?: string; erro?: string }> =>
    ipcRenderer.invoke('arquivo:salvar', url, nome),
  /**
   * A máquina acordou de dormir (ou a tela foi destravada). Devolve como se desinscrever.
   * Dentro da janela não há como saber disso, e é quando tudo precisa ser buscado de novo.
   */
  aoAcordar: (cb: () => void) => {
    const ouvir = () => cb();
    ipcRenderer.on('app:acordou', ouvir);
    return () => { ipcRenderer.off('app:acordou', ouvir); };
  },
  /** Segundos que a MÁQUINA está parada. É a única forma de saber que a pessoa saiu de
      perto: dentro da janela, ninguém vê teclado nem mouse fora do app. */
  ociosidade: (): Promise<number> => ipcRenderer.invoke('presenca:ociosidade'),
  /** Se a Saga abre junto com o sistema. `disponivel` é falso em desenvolvimento. */
  aberturaComOSistema: (): Promise<{ disponivel: boolean; ligado: boolean }> =>
    ipcRenderer.invoke('inicio:estado'),
  /** Devolve como FICOU no sistema, que pode não ser o que foi pedido. */
  definirAberturaComOSistema: (ligado: boolean): Promise<{ disponivel: boolean; ligado: boolean }> =>
    ipcRenderer.invoke('inicio:definir', ligado),

  /**
   * O overlay da live — a janela que fica por cima do jogo.
   *
   * Abrir e fechar a janela é da TELA (`window.open`), porque só de lá se consegue mandar
   * os quadros do vídeo para dentro dela. O que passa por aqui é o que só o processo
   * principal pode fazer: deixar o clique atravessar para o jogo, mudar o tamanho de uma
   * janela sem moldura, e o atalho global que trava e destrava.
   */
  overlay: {
    travar: (travado: boolean): Promise<boolean> => ipcRenderer.invoke('overlay:travar', travado),
    estado: (): Promise<{ aberto: boolean; travado: boolean; atalho: string }> =>
      ipcRenderer.invoke('overlay:estado'),
    redimensionar: (b: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('overlay:redimensionar', b),
    fechar: () => ipcRenderer.invoke('overlay:fechar'),
    /** Devolve o atalho que FICOU valendo: outro programa pode já estar com ele. */
    definirAtalho: (texto: string): Promise<{ atalho: string; valeu: boolean }> =>
      ipcRenderer.invoke('overlay:atalho', texto),
    aoTravar: (cb: (travado: boolean) => void) => {
      const ouvir = (_e: unknown, travado: boolean) => cb(travado);
      ipcRenderer.on('overlay:travado', ouvir);
      return () => { ipcRenderer.off('overlay:travado', ouvir); };
    },
    aoFechar: (cb: () => void) => {
      const ouvir = () => cb();
      ipcRenderer.on('overlay:fechou', ouvir);
      return () => { ipcRenderer.off('overlay:fechou', ouvir); };
    },
  },
};

contextBridge.exposeInMainWorld('desktop', desktop);

export type Desktop = typeof desktop;
