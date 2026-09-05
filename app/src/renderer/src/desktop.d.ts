export type SourceInfo = {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string | null;
  icon: string | null;
};

export type UpdateState = { version: string; url?: string; ready?: boolean; progress?: number };

declare global {
  interface Window {
    desktop: {
      platform: string;
      listSources: () => Promise<SourceInfo[]>;
      chooseSource: (id: string, audio: boolean) => Promise<void>;
      screenPermission: () => Promise<string>;
      openScreenSettings: () => Promise<void>;
      version: () => Promise<string>;
      onUpdate: (cb: (s: UpdateState) => void) => void;
      installUpdate: () => Promise<void>;
      openExternal: (url: string) => Promise<void>;
    };
  }
}
export {};
