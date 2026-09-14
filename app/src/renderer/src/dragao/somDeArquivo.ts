/**
 * Os sons gravados da luta: o grito da transformação, o estouro dela, o teletransporte e os raios.
 * Vão como ARQUIVO pelo Vite, e nunca embutidos — o CSP recusa som em `data:` (ver `embutir.ts`).
 *
 * Tocam por `<audio>`, e não pela Web Audio: a página vem de `file://`, e buscar o arquivo para
 * decodificar esbarraria no esquema. Os níveis foram acertados no próprio arquivo, em LUFS: o
 * estouro da transformação é o mais alto (-14), os disparos em -15, carga e teletransporte em -18 a
 * -19, porque tocam o tempo todo.
 */
import grito from './sons/grito.ogg';
import transformacao from './sons/transformacao.ogg';
import teletransporte from './sons/teletransporte.ogg';
import raioCarga from './sons/raio-carga.ogg';
import raioDisparo from './sons/raio-disparo.ogg';
import dedoCarga from './sons/dedo-carga.ogg';
import dedoPicole from './sons/dedo-picole.ogg';
import dedoGeladeira from './sons/dedo-geladeira.ogg';
import type { SomGravado } from './ouvidos.ts';
import { anotar } from '../registro';

const ARQUIVOS: Record<SomGravado, string> = {
  grito, transformacao, teletransporte,
  'raio-carga': raioCarga, 'raio-disparo': raioDisparo,
  'dedo-carga': dedoCarga, 'dedo-picole': dedoPicole, 'dedo-geladeira': dedoGeladeira,
};

export const ehGravado = (som: string): som is SomGravado => som in ARQUIVOS;

export function criarSonsGravados() {
  const longos = new Map<string, HTMLAudioElement>();
  return {
    tocar(som: SomGravado, chave?: string) {
      const audio = new Audio(ARQUIVOS[som]);
      audio.volume = 0.9;
      if (chave) { longos.get(chave)?.pause(); longos.set(chave, audio); }
      audio.play().catch((e) => anotar('erro', 'som', `o som "${som}" da luta não tocou: ${(e as Error)?.message ?? e}`));
    },
    /** Cala um som longo (o grito) sem estalo: some em 120 ms. */
    calar(chave: string) {
      const audio = longos.get(chave);
      if (!audio) return;
      longos.delete(chave);
      const passo = () => {
        audio.volume = Math.max(0, audio.volume - 0.15);
        if (audio.volume > 0) setTimeout(passo, 20); else audio.pause();
      };
      passo();
    },
    fechar() { for (const a of longos.values()) a.pause(); longos.clear(); },
  };
}
