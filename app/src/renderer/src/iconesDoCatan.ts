/**
 * Os ícones dos botões de construir do Catan — estrada, aldeia e cidade —, na cor de quem joga.
 *
 * Moram à parte do tabuleiro (`desenhoDoCatan.ts`) porque são desenho de BOTÃO e de cola, e não
 * peça: no tabuleiro a peça é vista de cima, entre outras; aqui ela precisa dizer sozinha o que se
 * constrói. São as MINIATURAS que o dono escolheu na prancheta (opção 2, 06/10/2026): cada uma
 * num pedacinho de grama, em isométrico, com parede creme e o telhado (ou a bandeirola) na sua cor.
 * A outra opção eram peças de madeira maciças; ele preferiu estas. Devolve um `<svg>` inteiro,
 * pronto para `dangerouslySetInnerHTML`, sem `<defs>` nem filtro — então não há id para colidir
 * quando a mesma peça aparece no botão e na cola ao mesmo tempo.
 */
import { escurecer } from './desenhoDoCatan.ts';
import { Desenho, caixa, casaIsometrica, iso, type P3 } from './isometrico.ts';

export type Construcao = 'estrada' | 'aldeia' | 'cidade';

const n = (v: number) => v.toFixed(2);
/** O pedacinho de grama, com a terra por baixo e uns tufos. */
function chao(d: Desenho, [a0, a1]: [number, number], [b0, b1]: [number, number]) {
  caixa(d, [a0, a1], [b0, b1], [-3, 0], { alto: '#7cc04f', esq: '#5c8f37', dir: '#4a7a2b', contorno: '#36591f', w: .8 });
  d.poly([[a0, b1, -3], [a1, b1, -3], [a1, b1, -1.6], [a0, b1, -1.6]], '#8a6238');
  d.poly([[a1, b0, -3], [a1, b1, -3], [a1, b1, -1.6], [a1, b0, -1.6]], '#6f4c2a');
  for (const [a, b] of [[a0 + 2, b0 + 3], [a1 - 3, b0 + 2], [a0 + 3, b1 - 2], [a1 - 2, b1 - 4]]) {
    const [x, y] = iso([a, b, 0]);
    d.cru(`<path d="M${n(x - 1.2)} ${n(y)}l.6 -1.6l.6 1.6l.6 -1.4l.5 1.4" stroke="#4a7a2b" stroke-width=".55" fill="none"/>`);
  }
}
const PAREDE = { esq: '#f3e7c7', dir: '#d9c9a2' };
const PEDRA = { esq: '#ece5d4', dir: '#cfc6b1' };
const LUZ = '#ffd27a';

/** A estrada: o caminho de terra atravessando a grama, a cerca de um lado e a bandeirola sua. */
function estrada(cor: string): string {
  const d = new Desenho();
  chao(d, [-2, 30], [-2, 18]);
  d.poly([[-2, 5.5, .02], [30, 5.5, .02], [30, 10.5, .02], [-2, 10.5, .02]], '#d8bd84');
  d.poly([[-2, 5.5, .03], [30, 5.5, .03], [30, 6.4, .03], [-2, 6.4, .03]], '#bfa06a');
  for (const [a, b] of [[3, 8], [8, 7], [13, 9], [18, 7.5], [23, 8.6], [27, 7.2]]) {
    const [x, y] = iso([a, b, .05]);
    d.cru(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="1.3" ry=".7" fill="#a98d5a"/>`);
  }
  for (const a of [2, 9, 16, 23]) d.linha([a, 13.5, 0], [a, 13.5, 4.2], '#6f4c2a', 1.1);
  d.linha([1, 13.5, 3.2], [24, 13.5, 3.2], '#8a6238', .9);
  d.linha([1, 13.5, 1.6], [24, 13.5, 1.6], '#8a6238', .9);
  d.linha([26, 2.5, 0], [26, 2.5, 10], '#5b3a1c', 1.2);
  d.poly([[26, 2.5, 10], [26, 2.5, 6.4], [26, -3.5, 7.4], [26, -3.5, 9]], cor, `stroke="${escurecer(cor, .55)}" stroke-width=".55"`);
  return d.svg();
}
/** A aldeia: a casinha com o telhado na sua cor, a porta, a janela acesa e a fumaça da chaminé. */
function aldeia(cor: string): string {
  const d = new Desenho();
  chao(d, [-3, 18], [-3, 17]);
  caixa(d, [2.5, 4.8], [3, 5.2], [10, 19], { alto: '#b7b0a3', esq: '#9e978a', dir: '#857e72', contorno: '#5c564c', w: .6 });
  casaIsometrica(d, [0, 14], [0, 13], 9, 7, { ...PAREDE, telhado: escurecer(cor, .18), telhadoClaro: cor, contorno: escurecer(cor, .6) });
  const [fx, fy] = iso([3.6, 4.1, 20.5]);
  d.cru(`<g fill="#eef1f4" opacity=".85"><circle cx="${n(fx + .4)}" cy="${n(fy - 1.4)}" r="1.7"/><circle cx="${n(fx + 2.2)}" cy="${n(fy - 3.6)}" r="2.2"/><circle cx="${n(fx + 4.6)}" cy="${n(fy - 6)}" r="2.6"/></g>`, [fx + 7.4, fy - 9]);
  d.poly([[14.05, 5, 0], [14.05, 8, 0], [14.05, 8, 5], [14.05, 6.5, 6.2], [14.05, 5, 5]], '#7a4f26');
  d.poly([[4, 13.05, 3.8], [8, 13.05, 3.8], [8, 13.05, 7], [4, 13.05, 7]], LUZ, 'stroke="#7a4f26" stroke-width=".6"');
  d.linha([6, 13.1, 3.8], [6, 13.1, 7], '#7a4f26', .5);
  return d.svg();
}
/** A cidade: o salão e a torre de pedra com ameias, os telhados na sua cor e a bandeira. */
function cidade(cor: string): string {
  const d = new Desenho();
  chao(d, [-3, 22], [-3, 17]);
  casaIsometrica(d, [0, 15], [0, 12], 8, 5, { ...PEDRA, telhado: escurecer(cor, .18), telhadoClaro: cor, contorno: escurecer(cor, .6) });
  for (const a of [2.5, 6.5]) d.poly([[a, 12.05, 3], [a + 2.6, 12.05, 3], [a + 2.6, 12.05, 5.8], [a, 12.05, 5.8]], LUZ, 'stroke="#6b5a40" stroke-width=".5"');
  caixa(d, [10.5, 18], [2, 9.5], [0, 20], { ...PEDRA, contorno: '#6b5a40', w: .8 });
  for (const b of [2.6, 5.2, 7.8]) caixa(d, [16.6, 18], [b, b + 1.4], [20, 21.6], { alto: '#f6f0e2', ...PEDRA, contorno: '#6b5a40', w: .5 });
  const topo: P3 = [14.25, 5.75, 28.5];
  const st = `stroke="${escurecer(cor, .6)}" stroke-width=".8" stroke-linejoin="round"`;
  d.poly([[10.5, 9.5, 20.2], [18, 9.5, 20.2], topo], cor, st);
  d.poly([[18, 2, 20.2], [18, 9.5, 20.2], topo], escurecer(cor, .2), st);
  d.poly([[18.05, 4.6, 12], [18.05, 6.9, 12], [18.05, 6.9, 15.6], [18.05, 5.75, 16.8], [18.05, 4.6, 15.6]], LUZ, 'stroke="#6b5a40" stroke-width=".5"');
  d.poly([[18.05, 4.4, 0], [18.05, 7.1, 0], [18.05, 7.1, 5], [18.05, 5.75, 6.4], [18.05, 4.4, 5]], '#7a4f26');
  d.linha(topo, [14.25, 5.75, 34.5], '#5b3a1c', .8);
  d.poly([[14.25, 5.75, 34.5], [18.4, 5.75, 33], [14.25, 5.75, 31.5]], cor, `stroke="${escurecer(cor, .55)}" stroke-width=".5"`);
  return d.svg();
}

/** O desenho é o mesmo a partida inteira: cada cor de cada peça é montada uma vez só. */
const feitos = new Map<string, string>();
export function iconeDeConstruir(tipo: Construcao, cor: string): string {
  const chave = `${tipo}:${cor}`;
  let svg = feitos.get(chave);
  if (!svg) {
    svg = tipo === 'estrada' ? estrada(cor) : tipo === 'aldeia' ? aldeia(cor) : cidade(cor);
    feitos.set(chave, svg);
  }
  return svg;
}
