export type SourceInfo = {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string | null;
  icon: string | null;
};

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
    };
  }
}
export {};
