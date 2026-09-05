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
      chooseSource: (id: string, audio: boolean) => Promise<void>;
      screenPermission: () => Promise<string>;
      /** No macOS o próprio sistema escolhe a janela; nosso seletor não deve aparecer. */
      usaSeletorDoSistema: () => Promise<boolean>;
      openScreenSettings: () => Promise<void>;
      version: () => Promise<string>;
      onUpdate: (cb: (s: UpdateState) => void) => void;
      /** Último aviso já anunciado, para quem montar depois do disparo não perdê-lo. */
      updateAtual: () => Promise<UpdateState | null>;
      installUpdate: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}
export {};
