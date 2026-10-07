/**
 * Os dados do Catan, com o copo (pedido do dono, 06/10/2026). Numa rolagem nova — de qualquer
 * um —, o copo aparece sobre os dados, chacoalha, tomba, e os dois cubos saem rolando até parar na
 * face sorteada. Parados, são os dois dados de sempre e a soma ao lado.
 *
 * Tudo anda por CSS (`dadosNoCopo.css`), e só `transform` e `opacity`: são as duas propriedades que
 * o compositor move sozinho, sem redesenhar a página nem tocar no tabuleiro. Nenhum relógio de JS
 * re-renderiza no meio — o de antes trocava a face a cada 80 ms. O que é regra (onde mora cada face
 * e quanto girar) está em `dadosNoCopo.ts`, puro e testado.
 */
import type { CSSProperties } from 'react';
import { FACE_NO_CUBO, GIRO_PARADO, giroDoDado } from '../dadosNoCopo';
import { htmlFixo } from '../html';

/** Quanto a rolagem dura na tela: o copo chacoalha, tomba, e os dados rolam até parar. */
export const DURACAO_DA_ROLAGEM = 1450;
/** Com "reduzir movimento" no sistema, nada rola: o resultado aparece direto. */
export const duracaoDaRolagem = () =>
  (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 150 : DURACAO_DA_ROLAGEM);

const PONTOS: Record<number, [number, number][]> = {
  1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.26, .26], [.5, .5], [.74, .74]],
  4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
  6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]],
};
const COR = { branco: { face: '#f4efe4', borda: '#c9c3b6', ponto: '#1d1d1d' }, vermelho: { face: '#d8453b', borda: '#a8322b', ponto: '#ffffff' } };

/** Um dado parado, de cima: a face, a borda de baixo e a sombra. É o de sempre (e o do botão de rolar). */
export function Dado({ n, vermelho, giro }: { n: number; vermelho: boolean; giro: number }) {
  const c = vermelho ? COR.vermelho : COR.branco;
  return (
    <svg className="catan-dado" viewBox="-6 -6 112 116" style={{ transform: `rotate(${giro}deg)` }} aria-hidden="true">
      <rect x="0" y="6" width="100" height="100" rx="22" fill="rgba(0,0,0,.4)" />
      <rect x="0" y="0" width="100" height="100" rx="22" fill={c.borda} />
      <rect x="0" y="0" width="100" height="94" rx="22" fill={c.face} />
      <rect x="6" y="5" width="88" height="20" rx="10" fill="#fff" opacity=".22" />
      {PONTOS[n].map(([x, y], i) => <circle key={i} cx={x * 100} cy={y * 100} r="9" fill={c.ponto} />)}
    </svg>
  );
}

/** Uma face do cubo: quadrada, com o canto pouco arredondado — muito redondo, o cubo mostra o oco. */
function FaceDoCubo({ n, vermelho }: { n: number; vermelho: boolean }) {
  const c = vermelho ? COR.vermelho : COR.branco;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="0" y="0" width="100" height="100" rx="12" fill={c.borda} />
      <rect x="4" y="4" width="92" height="92" rx="10" fill={c.face} />
      <rect x="10" y="8" width="80" height="16" rx="8" fill="#fff" opacity=".2" />
      {PONTOS[n].map(([x, y], i) => <circle key={i} cx={x * 100} cy={y * 100} r="9" fill={c.ponto} />)}
    </svg>
  );
}

/**
 * O copo: couro escuro, pesponto claro e a borda dourada na boca, no clima das cartas novas.
 * Desenhado em pé, de lado, com a boca para cima; o CSS o chacoalha e o tomba pela base.
 */
const COPO = `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="copo-couro" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#4a2a12"/><stop offset=".3" stop-color="#a0663a"/><stop offset=".62" stop-color="#7a4a26"/><stop offset="1" stop-color="#3a2010"/>
  </linearGradient></defs>
  <path d="M8 14L52 14L47 63Q30 70 13 63Z" fill="none" stroke="#f3dfb0" stroke-width="3.4" stroke-linejoin="round" opacity=".55"/>
  <path d="M8 14L52 14L47 63Q30 70 13 63Z" fill="url(#copo-couro)" stroke="#1f1007" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M10.4 21Q30 25.5 49.6 21M12.6 56Q30 61.5 47.4 56" stroke="#d9b27a" stroke-width="1" stroke-dasharray="2.2 2" fill="none" opacity=".85"/>
  <path d="M13 62Q30 68.5 47 62L46.7 65Q30 71.5 13.3 65Z" fill="#c9a25e" stroke="#8a6526" stroke-width=".7"/>
  <polygon points="30,32 36.1,35.5 36.1,42.5 30,46 23.9,42.5 23.9,35.5" fill="none" stroke="#e0b552" stroke-width="1.6"/>
  <polygon points="30,35.6 33,37.3 33,40.7 30,42.4 27,40.7 27,37.3" fill="#e0b552" opacity=".85"/>
  <path d="M15.5 19L18 60" stroke="#fff" stroke-width="3" opacity=".12" stroke-linecap="round"/>
  <ellipse cx="30" cy="14" rx="22.5" ry="5.6" fill="#e0b552" stroke="#8a6526" stroke-width="1"/>
  <ellipse cx="30" cy="14.4" rx="18.6" ry="3.7" fill="#140a04"/>
</svg>`;
const COPO_HTML = htmlFixo(COPO);

/** Um cubo voando do copo até o lugar dele: o voo (posição), o giro (as seis faces) e a sombra. */
function Cubo({ n, vermelho, qual, rolagem }: { n: number; vermelho: boolean; qual: 0 | 1; rolagem: number }) {
  const g = giroDoDado(n, rolagem, qual);
  const estilo = {
    '--fim-x': `${g.fimX}deg`, '--fim-y': `${g.fimY}deg`, '--giro': `${g.giro}deg`,
    '--ini-x': `${g.iniX}deg`, '--ini-y': `${g.iniY}deg`, '--ini-z': `${g.iniZ}deg`,
  } as CSSProperties;
  return (
    <span className={`dado3d-voo dado3d-${qual}`} style={estilo} aria-hidden="true">
      <span className="dado3d-sombra" />
      <span className="dado3d-cena">
        <span className="dado3d">
          {[1, 2, 3, 4, 5, 6].map((f) => (
            <span key={f} className="dado3d-face"
              style={{ transform: `rotateX(${FACE_NO_CUBO[f].x}deg) rotateY(${FACE_NO_CUBO[f].y}deg) translateZ(calc(var(--dado-tam, 48px) / 2))` }}>
              <FaceDoCubo n={f} vermelho={vermelho} />
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

/**
 * Os dois dados no canto do tabuleiro. `rolando` vem da tela (o tempo de `duracaoDaRolagem`); a
 * chave pela rolagem faz uma rolagem nova recomeçar a animação do zero, mesmo emendada na anterior.
 */
export function DadosNoCopo({ dados, rolando, rolagem }: { dados: [number, number] | null; rolando: boolean; rolagem: number }) {
  if (!dados) return null;
  const [a, b] = dados;
  if (!rolando) {
    return (
      <div className={`catan-dados ${a + b === 7 ? 'sete' : ''}`}>
        <Dado n={a} vermelho={false} giro={GIRO_PARADO[0]} />
        <Dado n={b} vermelho giro={GIRO_PARADO[1]} />
        <span className="catan-soma">{a + b}</span>
      </div>
    );
  }
  return (
    <div key={rolagem} className="catan-dados rolando">
      <span className="copo-de-dados" aria-hidden="true" dangerouslySetInnerHTML={COPO_HTML} />
      <Cubo n={a} vermelho={false} qual={0} rolagem={rolagem} />
      <Cubo n={b} vermelho qual={1} rolagem={rolagem} />
    </div>
  );
}
