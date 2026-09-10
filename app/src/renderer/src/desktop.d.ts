export type SourceInfo = {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string | null;
  icon: string | null;
};

/** Se a Saga abre junto com o sistema. Fora do app instalado, `disponivel` é falso. */
export type AberturaComOSistema = { disponivel: boolean; ligado: boolean };

/** Espelha o UpdateState do processo principal (src/main/update.ts). */
export type UpdateState = {
  fase: 'procurando' | 'baixando' | 'pronto' | 'nenhuma' | 'aviso' | 'erro';
  version?: string;
  progress?: number;
  url?: string;
  mensagem?: string;
};

declare global {
  interface Window {
    desktop: {
      platform: string;
      listSources: () => Promise<SourceInfo[]>;
      /** 'loopbackWithMute' captura o áudio do sistema silenciando a saída local. */
      chooseSource: (id: string, audio: 'nao' | 'loopbackWithoutChrome' | 'loopback' | 'loopbackWithMute') => Promise<void>;
      screenPermission: () => Promise<string>;
      /** No macOS o próprio sistema escolhe a janela; nosso seletor não deve aparecer. */
      usaSeletorDoSistema: () => Promise<boolean>;
      openScreenSettings: () => Promise<void>;
      version: () => Promise<string>;
      registrar: (nivel: 'erro' | 'aviso' | 'info', origem: string, mensagem: string) => Promise<void>;
      lerRegistro: () => Promise<string>;
      copiarRegistro: (texto: string) => Promise<void>;
      abrirPastaDoRegistro: () => Promise<void>;
      onUpdate: (cb: (s: UpdateState) => void) => void;
      /** Último aviso já anunciado, para quem montar depois do disparo não perdê-lo. */
      updateAtual: () => Promise<UpdateState | null>;
      installUpdate: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      /** Salva um anexo do chat com o diálogo do sistema. Nada é aberto nem executado. */
      salvarArquivo: (url: string, nome: string) => Promise<{ ok: boolean; caminho?: string; erro?: string }>;
      /**
       * A máquina acordou de dormir (ou a tela foi destravada). Devolve como se
       * desinscrever. Dentro da janela não há como saber disso, e é justamente quando
       * tudo precisa ser buscado de novo — os relógios do app passaram o sono parados.
       */
      aoAcordar: (cb: () => void) => () => void;
      /** Segundos que a MÁQUINA está parada — teclado e mouse, fora do app inclusive. */
      ociosidade: () => Promise<number>;
      /** Se a Saga abre junto com o sistema. */
      aberturaComOSistema: () => Promise<AberturaComOSistema>;
      /** Liga ou desliga, e devolve como FICOU no sistema — não o que foi pedido. */
      definirAberturaComOSistema: (ligado: boolean) => Promise<AberturaComOSistema>;
    };
  }
}
export {};
