import type { CSSProperties } from 'react';
import { COR_DO_JOGADOR, type Chegada, type Partida } from '../catan';
import { ALTURA, FIGURA_DO_LADRAO, LARGURA, S, desenhoDaChegada, duracaoDaCorrida, posicaoDoLadrao } from '../desenhoDoCatan';

/**
 * A camada de cima do tabuleiro: o ladrão, e o que acabou de ser construído caindo com poeira
 * (pedido do dono, 06/10/2026: "o ladrão correndo para o campo novo", "uma animação mais efetiva de
 * quando algo for colocado no tabuleiro pra sabermos onde", "foco em desempenho sem lag").
 *
 * Por que uma camada à parte: o tabuleiro é um SVG grande (terrenos ilustrados, peças, fichas), e
 * mexer nele a cada quadro faria o navegador redesenhá-lo inteiro — o lag. Aqui cada coisa que se
 * mexe é uma caixa HTML pequena, animada só em `transform` e `opacity`, que a placa de vídeo move
 * sem redesenhar nada: o desenho de cada uma é feito uma vez e deslizado pronto. A camada cobre
 * exatamente o desenho do tabuleiro (mesma proporção, centrada, pelas unidades `cq` da caixa), e
 * as posições saem das coordenadas do próprio tabuleiro, em porcentagem.
 */

/** Quanto a peça leva caindo, e em que ponto dessa queda ela bate no chão (onde sobe a poeira e soa a construção). */
export const QUEDA_MS = 560;
export const POUSO_MS = 390;
/** Quanto dura tudo — queda, anel e poeira —, para a peça voltar a morar no tabuleiro. */
export const CHEGADA_MS = 1400;

const px = (x: number) => `${(x / LARGURA) * 100}%`;
const py = (y: number) => `${(y / ALTURA) * 100}%`;

// A caixa do desenho do ladrão (`FIGURA_DO_LADRAO`, de -20 a 20 e de -30 a 22), na escala do tabuleiro.
const K = S / 58;
const LADRAO = { x: -20 * K, y: -30 * K, w: 40 * K, h: 52 * K };

export type Corrida = { de: string; para: string; n: number };

/** As partículas da poeira: em volta da base, e mais achatadas na vertical, como no chão visto de cima. */
const POEIRA = Array.from({ length: 12 }, (_, i) => {
  const ang = ((i / 12) * 360 + (i % 2) * 12) * (Math.PI / 180);
  const dist = 150 + (i % 3) * 45;
  return { '--tx': `${(Math.cos(ang) * dist).toFixed(0)}%`, '--ty': `${(Math.sin(ang) * dist * 0.5).toFixed(0)}%` } as CSSProperties;
});

function Poeira({ atraso }: { atraso: number }) {
  return (
    <div className="catan-poeira" style={{ '--atraso': `${atraso}ms` } as CSSProperties}>
      {POEIRA.map((estilo, i) => <i key={i} style={estilo} />)}
    </div>
  );
}

/** A marca de onde algo caiu: o anel na cor de quem construiu, abrindo, e a poeira. `r` em unidades do tabuleiro. */
function Marca({ x, y, r, cor, atraso, sombra = false }: { x: number; y: number; r: number; cor: string; atraso: number; sombra?: boolean }) {
  return (
    <div className="catan-marca" style={{ left: px(x - r), top: py(y - r * 0.6), width: px(2 * r), height: py(2 * r * 0.6), '--cor': cor, '--atraso': `${atraso}ms` } as CSSProperties}>
      {sombra && <i className="catan-marca-sombra" />}
      <i className="catan-marca-clarao" />
      <i className="catan-marca-anel" />
      <i className="catan-marca-anel segundo" />
      <Poeira atraso={atraso} />
    </div>
  );
}

function PecaCaindo({ ch, cor }: { ch: Chegada; cor: string }) {
  const { caixa: [x, y, w, h], base, svg } = desenhoDaChegada(ch, cor);
  return (
    <>
      <div className="catan-caindo" style={{ left: px(x), top: py(y), width: px(w), height: py(h) }}>
        <svg viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="none" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <Marca x={base.x} y={base.y} r={S * (ch.tipo === 'estrada' ? 0.62 : ch.tipo === 'cidade' ? 0.8 : 0.7)} cor={cor} atraso={POUSO_MS} sombra />
    </>
  );
}

export function SobreOTabuleiro({ partida: p, chegando, corrida }: { partida: Partida; chegando: Chegada[]; corrida: Corrida | null }) {
  const aqui = posicaoDoLadrao(p);
  // O ladrão corre do terreno de antes até este: a caixa já está no lugar novo, e a animação a traz
  // de onde ela estava (o deslocamento em % do tamanho dela, que é como o `translate` mede).
  const correndo = !!corrida && corrida.para === p.ladrao && corrida.de !== corrida.para;
  let estilo: CSSProperties | undefined;
  let duracao = 0;
  if (correndo) {
    const de = posicaoDoLadrao({ hexes: p.hexes, ladrao: corrida.de });
    duracao = duracaoDaCorrida(de, aqui);
    estilo = {
      '--dx': `${(((de.x - aqui.x) / LADRAO.w) * 100).toFixed(1)}%`,
      '--dy': `${(((de.y - aqui.y) / LADRAO.h) * 100).toFixed(1)}%`,
      '--duracao': `${duracao}ms`,
      '--pulos': Math.max(2, Math.round(duracao / 170)),
    } as CSSProperties;
  }
  return (
    <div className="catan-sobre" aria-hidden="true">
      <div className="catan-sobre-ladrao" style={{ left: px(aqui.x + LADRAO.x), top: py(aqui.y + LADRAO.y), width: px(LADRAO.w), height: py(LADRAO.h) }}>
        <div key={corrida?.n ?? 0} className={correndo ? 'corre' : undefined} style={estilo}>
          <div className="pula"><svg viewBox="-20 -30 40 52" dangerouslySetInnerHTML={{ __html: FIGURA_DO_LADRAO }} /></div>
        </div>
      </div>
      {correndo && <Marca key={`chegou-${corrida.n}`} x={aqui.x} y={aqui.y + 18 * K} r={S * 0.36} cor="#d9c9a2" atraso={duracao - 60} />}
      {chegando.map((ch) => <PecaCaindo key={ch.chave} ch={ch} cor={COR_DO_JOGADOR[p.jogadores[ch.j]?.cor ?? 'branco']} />)}
    </div>
  );
}
