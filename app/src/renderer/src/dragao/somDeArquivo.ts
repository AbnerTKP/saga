/**
 * Os sons gravados da luta: soco, chute e rajada de ki (com variações), o grito da transformação,
 * o estouro dela, o teletransporte e os raios. Vão como ARQUIVO pelo Vite, e nunca embutidos — o
 * CSP recusa som em `data:` (ver `embutir.ts`).
 *
 * Tocam por `<audio>`, e não pela Web Audio: a página vem de `file://`, e buscar o arquivo para
 * decodificar esbarraria no esquema. Os níveis foram acertados no próprio arquivo: estouro da
 * transformação a -14 LUFS, disparos a -15, soco e chute com pico a -4 dB e média perto de -16,
 * carga, teletransporte e rajada mais baixos, porque tocam o tempo todo. Soco e chute têm várias
 * gravações e se revezam: o mesmo estalo dez vezes seguidas cansa o ouvido.
 */
import grito from './sons/grito.ogg';
import transformacao from './sons/transformacao.ogg';
import teletransporte from './sons/teletransporte.ogg';
import raioCarga from './sons/raio-carga.ogg';
import raioDisparo from './sons/raio-disparo.ogg';
import dedoCarga from './sons/dedo-carga.ogg';
import dedoPicole from './sons/dedo-picole.ogg';
import dedoGeladeira from './sons/dedo-geladeira.ogg';
import soco1 from './sons/soco-1.ogg';
import soco2 from './sons/soco-2.ogg';
import soco3 from './sons/soco-3.ogg';
import soco4 from './sons/soco-4.ogg';
import chute1 from './sons/chute-1.ogg';
import chute2 from './sons/chute-2.ogg';
import rajada1 from './sons/rajada-1.ogg';
import rajada2 from './sons/rajada-2.ogg';
import type { SomGravado } from './ouvidos.ts';
import { anotar } from '../registro';

const ARQUIVOS: Record<SomGravado, string[]> = {
  grito: [grito], transformacao: [transformacao], teletransporte: [teletransporte],
  'raio-carga': [raioCarga], 'raio-disparo': [raioDisparo],
  'dedo-carga': [dedoCarga], 'dedo-picole': [dedoPicole], 'dedo-geladeira': [dedoGeladeira],
  'golpe-soco': [soco1, soco2, soco3, soco4], 'golpe-chute': [chute1, chute2], 'disparo-ki': [rajada1, rajada2],
};

export const ehGravado = (som: string): som is SomGravado => som in ARQUIVOS;

export function criarSonsGravados(volumeInicial = 1) {
  const longos = new Map<string, HTMLAudioElement>();
  const vez = new Map<SomGravado, number>();
  let volume = volumeInicial;
  return {
    /** De 0 a 1: o volume do jogo, que a pessoa regula na arena. Vale também para o que já toca. */
    set volume(v: number) {
      volume = Math.max(0, Math.min(1, v));
      for (const a of longos.values()) a.volume = volume;
    },
    tocar(som: SomGravado, chave?: string) {
      if (volume <= 0) return;
      const lista = ARQUIVOS[som];
      const i = (vez.get(som) ?? 0) % lista.length;
      vez.set(som, i + 1);
      const audio = new Audio(lista[i]);
      audio.volume = volume;
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
