/**
 * Os sons gravados da luta: soco, chute e rajada de ki (com variações), o grito da transformação,
 * o estouro dela, o teletransporte e os raios. Vão como ARQUIVO pelo Vite, e nunca embutidos — o
 * CSP recusa som em `data:` (ver `embutir.ts`).
 *
 * Tocam por `<audio>`, e não pela Web Audio: a página vem de `file://`, e buscar o arquivo para
 * decodificar esbarraria no esquema. Os níveis foram acertados no próprio arquivo: estouro da
 * transformação a -14 LUFS, disparos a -15, soco e chute com média perto de -16,5, defesa e golpe no ar a -19,
 * a aura de carregar ki a -21 (em laço, por baixo da luta). Soco, chute e defesa têm várias
 * gravações e são sorteadas: o mesmo estalo dez vezes seguidas cansa o ouvido.
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
import soco5 from './sons/soco-5.ogg';
import soco6 from './sons/soco-6.ogg';
import soco7 from './sons/soco-7.ogg';
import soco8 from './sons/soco-8.ogg';
import soco9 from './sons/soco-9.ogg';
import chute3 from './sons/chute-3.ogg';
import chute4 from './sons/chute-4.ogg';
import chute5 from './sons/chute-5.ogg';
import defesa1 from './sons/defesa-1.ogg';
import defesa2 from './sons/defesa-2.ogg';
import ar1 from './sons/ar-1.ogg';
import ar2 from './sons/ar-2.ogg';
import ar3 from './sons/ar-3.ogg';
import forte1 from './sons/forte-1.ogg';
import auraKi from './sons/aura-ki.ogg';
import rajada1 from './sons/rajada-1.ogg';
import rajada2 from './sons/rajada-2.ogg';
import type { SomGravado } from './ouvidos.ts';
import { anotar } from '../registro';

const ARQUIVOS: Record<SomGravado, string[]> = {
  grito: [grito], transformacao: [transformacao], teletransporte: [teletransporte],
  'raio-carga': [raioCarga], 'raio-disparo': [raioDisparo],
  'dedo-carga': [dedoCarga], 'dedo-picole': [dedoPicole], 'dedo-geladeira': [dedoGeladeira],
  'golpe-soco': [soco1, soco2, soco3, soco4, soco5, soco6, soco7, soco8, soco9],
  'golpe-chute': [chute1, chute2, chute3, chute4, chute5],
  'golpe-defesa': [defesa1, defesa2],
  // o soco e o chute que não encostam em ninguém: o vento do golpe, com os agudos cortados para soar oco
  'golpe-ar': [ar1, ar2, ar3],
  'golpe-forte': [forte1],
  'disparo-ki': [rajada1, rajada2],
  'aura-ki': [auraKi],
};

/** Os que tocam em laço enquanto a ação dura (a aura de quem carrega ki). */
const EM_LACO = new Set<SomGravado>(['aura-ki']);

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
      // sorteio sem repetir o anterior: com nove socos, ninguém percebe a ordem, e dois iguais
      // seguidos é justamente o que se percebe
      const anterior = vez.get(som) ?? -1;
      let i = Math.floor(Math.random() * lista.length);
      if (lista.length > 1 && i === anterior) i = (i + 1) % lista.length;
      vez.set(som, i);
      const audio = new Audio(lista[i]);
      audio.volume = volume;
      audio.loop = EM_LACO.has(som);
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
