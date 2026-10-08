/**
 * A arte das cartas do Catan na mesa em volta (06/10/2026): as de recurso com o OBJETO do recurso
 * num disco claro — a pilha de toras, os tijolos, a ovelha, o feixe de trigo, as pedras de minério —,
 * as cinco de desenvolvimento ilustradas, e os dois versos — o de recurso azul como o mar, o de
 * desenvolvimento vinho com a coroa, para os montinhos se distinguirem de longe. Desenho de JOGO, e
 * por isso as cores moram aqui e não no CSS (a regra do catan.css).
 *
 * As de recurso traziam, até 07/10/2026, o terreno do tabuleiro num medalhão hexagonal. O dono:
 * "poderia ser o ícone de verdade de um tronco, tijolo" — o terreno repetia o tabuleiro e não dizia
 * o RECURSO, e a 20 px (a cola, o banco) virava um borrão da mesma cor do fundo. O objeto num disco
 * claro contrasta com qualquer fundo, e a cor da carta continua sendo a pista de longe.
 *
 * Tudo vira UM sprite de `<symbol>`s, montado uma vez e posto escondido na tela da mesa; cada carta
 * é só um `<svg><use href="#…"/></svg>`. A tela redesenha a cada leitura (800 ms), e uma mesa tem
 * dezenas de cartas: repetir o SVG inteiro de cada uma seria refazer centenas de KB de DOM a cada
 * leitura. O objeto de cada recurso também é um símbolo (`SIMBOLO.objeto`), que as cartas usam por
 * `<use>` e a tela pode usar sozinho.
 */
import type { CartaDeDesenvolvimento, Recurso } from './catan';
import { RECURSOS } from './catan';
import { clarear } from './desenhoDoCatan';

const NOME: Record<Recurso, string> = { madeira: 'Madeira', tijolo: 'Tijolo', la: 'Lã', trigo: 'Trigo', minerio: 'Minério' };
/** O fundo de cada recurso: o par de cores da carta de antes, mais fundo embaixo. */
const COR: Record<Recurso, [string, string]> = {
  madeira: ['#4f8c45', '#1f4a24'], tijolo: ['#e0915f', '#8f3f22'], la: ['#b3e07a', '#4e8f31'],
  trigo: ['#f8dc78', '#b7801c'], minerio: ['#b3bac6', '#4e5563'],
};
const PAPEL = '#f6ead0';
const OURO = '#c9a25e';
const OURO_CLARO = '#e9cf8f';

export const TIPOS_DE_DESENVOLVIMENTO: CartaDeDesenvolvimento[] = ['cavaleiro', 'ponto', 'monopolio', 'fartura', 'estradas'];
/** O título curto, que cabe na faixa da carta. */
const TITULO: Record<CartaDeDesenvolvimento, string> = {
  cavaleiro: 'Cavaleiro', ponto: 'Ponto de vitória', monopolio: 'Monopólio', fartura: 'Ano de fartura', estradas: 'Estradas',
};
/** O que ela faz, em duas linhas, no papel de baixo da carta grande. */
const TEXTO: Record<CartaDeDesenvolvimento, [string, string]> = {
  cavaleiro: ['Mova o ladrão e', 'roube uma carta.'],
  ponto: ['Vale 1 ponto.', 'Fica escondida.'],
  monopolio: ['Todos te dão as cartas', 'de um recurso.'],
  fartura: ['Pegue 2 cartas', 'quaisquer do banco.'],
  estradas: ['Ponha 2 estradas', 'de graça.'],
};
const CENA: Record<CartaDeDesenvolvimento, [string, string]> = {
  cavaleiro: ['#f3b36b', '#7c3b3b'], ponto: ['#9fd0f5', '#3f7fbf'], monopolio: ['#7fd6c5', '#1f6b6b'],
  fartura: ['#cfe98f', '#4f8a3a'], estradas: ['#f1dfa7', '#8a6a3a'],
};

const f = (n: number) => +n.toFixed(2);
/** Hexágono de ponta para cima — o mesmo jeito dos terrenos do tabuleiro. */
const hex = (cx: number, cy: number, r: number) => [0, 1, 2, 3, 4, 5].map((i) => {
  const a = Math.PI / 180 * (60 * i - 90);
  return `${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`;
}).join(' ');

/** O papel creme por dentro de uma borda escura, como carta impressa. `g` é o id do gradiente do fundo. */
const moldura = (g: string) => `<rect x="1" y="1" width="98" height="138" rx="9" fill="${PAPEL}"/>
  <rect x="4.5" y="4.5" width="91" height="131" rx="6.5" fill="url(#${g})"/>
  <rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="${OURO_CLARO}" stroke-width=".9" opacity=".75"/>`;
const gradiente = (id: string, a: string, b: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

// ---------- os objetos dos recursos (unidade: caixa de 80×80 centrada em 0,0) ----------
// O mesmo jeito ilustrado do tabuleiro: contorno escuro fino, luz de cima à esquerda, sombra embaixo.
// Sem id nenhum dentro: cada objeto vira UM `<symbol>`, e as cartas o usam por `<use>`.

const p2 = (x: number, y: number) => `${f(x)},${f(y)}`;
const sombraNoChao = (cy: number, rx: number) => `<ellipse cx="0" cy="${cy}" rx="${rx}" ry="${f(rx * .13)}" fill="rgba(0,0,0,.3)"/>`;

/** Uma tora deitada: a ponta cortada de frente, com os anéis, e o corpo indo para trás, para cima e à esquerda. */
function tora(cx: number, cy: number, r: number): string {
  const [dx, dy] = [-15, -9];
  const l = Math.hypot(dx, dy);
  const [nx, ny] = [dy / l, -dx / l].map((v) => -v); // a borda de cima do corpo
  const [ax, ay, bx, by] = [cx + r * nx, cy + r * ny, cx - r * nx, cy - r * ny];
  const listras = [-.62, -.18, .3, .72].map((k) => {
    const [x, y] = [cx + k * r * nx, cy + k * r * ny];
    return `<path d="M${p2(x, y)}L${p2(x + dx * .96, y + dy * .96)}" stroke="#4a2c12" stroke-width=".9" opacity=".55"/>`;
  }).join('');
  const miolo = r - 2.5;
  return `<circle cx="${f(cx + dx)}" cy="${f(cy + dy)}" r="${r}" fill="#6a4220" stroke="#2e1a08" stroke-width="1.3"/>
    <polygon points="${p2(ax, ay)} ${p2(ax + dx, ay + dy)} ${p2(bx + dx, by + dy)} ${p2(bx, by)}" fill="#7d4f27"/>
    <polygon points="${p2(ax, ay)} ${p2(ax + dx, ay + dy)} ${p2(cx + .45 * r * nx + dx, cy + .45 * r * ny + dy)} ${p2(cx + .45 * r * nx, cy + .45 * r * ny)}" fill="#9a6535"/>
    ${listras}
    <path d="M${p2(ax, ay)}L${p2(ax + dx, ay + dy)}M${p2(bx, by)}L${p2(bx + dx, by + dy)}" stroke="#2e1a08" stroke-width="1.3"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#5a3518" stroke="#2e1a08" stroke-width="1.3"/>
    <circle cx="${cx}" cy="${cy}" r="${f(miolo)}" fill="#e7bf86"/>
    <path d="M${p2(cx - miolo, cy)}a${f(miolo)},${f(miolo)} 0 0 1 ${f(2 * miolo)},0z" fill="#f3d6a3" opacity=".7"/>
    <circle cx="${cx}" cy="${cy}" r="${f(r * .62)}" fill="none" stroke="#bd8b51" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="${f(r * .33)}" fill="none" stroke="#bd8b51" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="1.3" fill="#a87339"/>
    <path d="M${p2(cx + 1, cy - 1)}l${f(r * .45)},${f(-r * .38)}l2,1" stroke="#8a5a28" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
}

/** Um tijolo deitado, de frente, com o topo e a ponta da direita à mostra. (x, y): o canto de baixo à esquerda. */
function tijolo(x: number, y: number): string {
  const [w, h, dx, dy] = [30, 17, 10, -7];
  const pintas = [[.22, .45], [.5, .7], [.74, .35], [.36, .2], [.86, .72]]
    .map(([u, v]) => `<circle cx="${f(x + u * w)}" cy="${f(y - h + v * h)}" r=".9" fill="#8f3519" opacity=".6"/>`).join('');
  const contorno = 'stroke="#4a170a" stroke-width="1.2" stroke-linejoin="round"';
  return `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="#c4502c" ${contorno}/>
    <rect x="${f(x + 1.2)}" y="${f(y - h + 1.2)}" width="${f(w - 2.4)}" height="2.4" fill="#d96a42"/>
    ${pintas}
    <polygon points="${p2(x, y - h)} ${p2(x + w, y - h)} ${p2(x + w + dx, y - h + dy)} ${p2(x + dx, y - h + dy)}" fill="#e8835a" ${contorno}/>
    <polygon points="${p2(x + w, y)} ${p2(x + w, y - h)} ${p2(x + w + dx, y - h + dy)} ${p2(x + w + dx, y + dy)}" fill="#8e331a" ${contorno}/>`;
}

/** A ovelha: o corpo de lã em cachos, a cabeça e as patas escuras, olhando para quem vê. */
function ovelha(): string {
  const [cx, cy, rx, ry] = [-5, 1, 24, 15];
  const cachos = Array.from({ length: 13 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 13;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a), Math.sin(a)];
  });
  const patas = [-21, -11, 3, 12].map((x, i) => `<rect x="${x}" y="8" width="5.6" height="${i % 2 ? 20 : 21}" rx="2.4" fill="#3a3330" stroke="#1c1715" stroke-width="1"/>
    <rect x="${x}" y="${i % 2 ? 24.5 : 25.5}" width="5.6" height="3.5" rx="1.4" fill="#1c1715"/>`).join('');
  const borda = cachos.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="9.6" fill="#5e564c"/>`).join('')
    + '<circle cx="-31" cy="-4" r="5.6" fill="#5e564c"/>';
  const la = cachos.map(([x, y, s]) => `<circle cx="${f(x)}" cy="${f(y)}" r="8.4" fill="${s > .35 ? '#e6e0d3' : '#fbf8f1'}"/>`).join('')
    + '<circle cx="-31" cy="-4" r="4.4" fill="#f4f0e7"/>';
  const caracois = [[-18, -4], [-6, -8], [6, -3], [-12, 7], [2, 6]]
    .map(([x, y]) => `<path d="M${x - 3} ${y}a3 3 0 1 1 3 3" fill="none" stroke="#d3cbbb" stroke-width="1"/>`).join('');
  return `${sombraNoChao(29.5, 27)}
    ${patas}${borda}${la}
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#f7f3eb"/>
    <ellipse cx="${cx - 6}" cy="${cy - 7}" rx="13" ry="5" fill="#fff" opacity=".8"/>
    ${caracois}
    <g transform="translate(25 -6) rotate(12)">
      <ellipse cx="-9" cy="-4" rx="5.6" ry="2.8" transform="rotate(-28 -9 -4)" fill="#2f2926" stroke="#1c1715" stroke-width=".9"/>
      <ellipse cx="9" cy="-4" rx="5.6" ry="2.8" transform="rotate(28 9 -4)" fill="#2f2926" stroke="#1c1715" stroke-width=".9"/>
      <ellipse cx="0" cy="1" rx="8.4" ry="10.6" fill="#3a3330" stroke="#1c1715" stroke-width="1.1"/>
      <ellipse cx="0" cy="6.5" rx="4.6" ry="3.2" fill="#544a45"/>
      <circle cx="-3.4" cy="-.6" r="2.2" fill="#fff"/><circle cx="3.4" cy="-.6" r="2.2" fill="#fff"/>
      <circle cx="-3" cy="-.2" r="1.1" fill="#1c1715"/><circle cx="3.8" cy="-.2" r="1.1" fill="#1c1715"/>
      <circle cx="-4" cy="-10" r="4" fill="#fbf8f1" stroke="#5e564c" stroke-width="1"/>
      <circle cx="4" cy="-10" r="4" fill="#fbf8f1" stroke="#5e564c" stroke-width="1"/>
      <circle cx="0" cy="-11.5" r="4.2" fill="#fff" stroke="#5e564c" stroke-width="1"/>
    </g>`;
}

/** O feixe de trigo: as espigas abertas em leque no alto, os talos embaixo e a corda no meio. */
function feixe(): string {
  const [tx, ty] = [0, 7];
  const angulos = [-40, -30, -20, -10, 0, 10, 20, 30, 40].sort((a, b) => Math.abs(b) - Math.abs(a));
  const talo = (a: number, ate: number, sentido: number) => {
    const g = (Math.PI / 180) * a;
    return `M${tx} ${ty}L${p2(tx + Math.sin(g) * ate * sentido, ty - Math.cos(g) * ate * sentido)}`;
  };
  const baixo = angulos.map((a) => talo(a * .5, 28, -1)).join('');
  const cima = angulos.map((a) => talo(a, 20, 1)).join('');
  const espigas = angulos.map((a) => {
    const g = (Math.PI / 180) * a;
    const [ux, uy, px, py] = [Math.sin(g), -Math.cos(g), Math.cos(g), Math.sin(g)];
    const grao = (t: number, lado: number) => {
      const [x, y] = [tx + ux * t + px * lado * 2.5, ty + uy * t + py * lado * 2.5];
      return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="2.6" ry="4.6" transform="rotate(${f(a + lado * 20)} ${f(x)} ${f(y)})" fill="${lado < 0 ? '#f6d26a' : '#e9b53c'}" stroke="#94640f" stroke-width=".8"/>`;
    };
    const [qx, qy] = [tx + ux * 37.5, ty + uy * 37.5];
    const pelos = [-12, 0, 12].map((d) => {
      const h = (Math.PI / 180) * (a + d);
      return `<path d="M${p2(qx, qy)}l${f(Math.sin(h) * 7)},${f(-Math.cos(h) * 7)}" stroke="#b98a24" stroke-width=".7"/>`;
    }).join('');
    return pelos + [21, 25.5, 30, 34.5].map((t) => grao(t, 1) + grao(t, -1)).join('')
      + `<ellipse cx="${f(qx)}" cy="${f(qy)}" rx="2.4" ry="4.4" transform="rotate(${a} ${f(qx)} ${f(qy)})" fill="#f6d26a" stroke="#94640f" stroke-width=".8"/>`;
  }).join('');
  return `${sombraNoChao(35, 15)}
    <path d="${baixo}" stroke="#7a5416" stroke-width="3" stroke-linecap="round"/>
    <path d="${baixo}" stroke="#d9a947" stroke-width="1.7" stroke-linecap="round"/>
    <path d="${cima}" stroke="#7a5416" stroke-width="3.2" stroke-linecap="round"/>
    <path d="${cima}" stroke="#d9a947" stroke-width="1.8" stroke-linecap="round"/>
    ${espigas}
    <rect x="-10" y="3" width="20" height="8" rx="3" fill="#8f5f28" stroke="#4a2c0c" stroke-width="1.1"/>
    <path d="M-8 5.6h16" stroke="#b07a3c" stroke-width="1.2"/>
    <path d="M2 10.5l-3 8M3 10.5l5 7" stroke="#4a2c0c" stroke-width="3" stroke-linecap="round"/>
    <path d="M2 10.5l-3 8M3 10.5l5 7" stroke="#8f5f28" stroke-width="1.7" stroke-linecap="round"/>`;
}

/** Uma pedra facetada: cada face é um triângulo até o cume, mais clara quanto mais olha para a luz. */
function pedra(cx: number, cy: number, s: number, espelho = false): string {
  const contorno = [[-22, 20], [-25, 2], [-14, -15], [3, -21], [19, -11], [25, 8], [16, 22]]
    .map(([x, y]) => [cx + (espelho ? -x : x) * s, cy + y * s]);
  const [vx, vy] = [cx + (espelho ? 5 : -5) * s, cy - 6 * s];
  const mx = contorno.reduce((t, p) => t + p[0], 0) / contorno.length;
  const my = contorno.reduce((t, p) => t + p[1], 0) / contorno.length;
  const faces = contorno.map((p, i) => {
    const q = contorno[(i + 1) % contorno.length];
    const [nx, ny] = [(p[0] + q[0]) / 2 - mx, (p[1] + q[1]) / 2 - my];
    const l = Math.hypot(nx, ny) || 1;
    const luz = ((nx / l) * -.55 + (ny / l) * -.83 + 1) / 2;
    const cor = luz > .75 ? '#c9d2de' : luz > .55 ? '#a2adbc' : luz > .35 ? '#7d8899' : '#59636f';
    return `<polygon points="${p2(p[0], p[1])} ${p2(q[0], q[1])} ${p2(vx, vy)}" fill="${cor}" stroke="#3d4550" stroke-width=".5" stroke-linejoin="round"/>`;
  }).join('');
  return `${faces}<polygon points="${contorno.map(([x, y]) => p2(x, y)).join(' ')}" fill="none" stroke="#262c34" stroke-width="1.3" stroke-linejoin="round"/>`;
}
/** Um cristal de minério: um losango azul-claro com o brilho na metade de cima. */
const cristal = (x: number, y: number, s: number, giro: number) =>
  `<g transform="translate(${x} ${y}) rotate(${giro}) scale(${s})"><path d="M0-6L3.4 0 0 6-3.4 0z" fill="#9fd2f5" stroke="#2f6595" stroke-width=".8" stroke-linejoin="round"/><path d="M0-6L3.4 0H-3.4z" fill="#e3f4ff"/></g>`;
const brilho = (x: number, y: number, s: number) => {
  const k = f(3.6 * s);
  return `<path d="M${x} ${f(y - k)}Q${x} ${y} ${f(x + k)} ${y}Q${x} ${y} ${x} ${f(y + k)}Q${x} ${y} ${f(x - k)} ${y}Q${x} ${y} ${x} ${f(y - k)}z" fill="#fff"/>`;
};

/** O desenho de cada recurso, centrado em 0,0 numa caixa de 80×80. */
const OBJETO: Record<Recurso, () => string> = {
  madeira: () => `${sombraNoChao(30.5, 32)}${tora(21, 16, 14)}${tora(-7, 16, 14)}${tora(7, -8.2, 14)}`,
  tijolo: () => `${sombraNoChao(22.5, 34)}${tijolo(-36, 21)}${tijolo(-4, 21)}${tijolo(-20, 4)}`,
  la: ovelha,
  trigo: feixe,
  minerio: () => `${sombraNoChao(29, 33)}
    ${pedra(2, -3, 1.05)}${cristal(9, 2, 1.1, 18)}${cristal(-6, 9, .85, -14)}${cristal(14, 14, .7, 30)}
    ${pedra(-24, 18, .52, true)}${cristal(-25, 18, .6, -10)}
    ${pedra(25, 21, .46)}${brilho(-9, -10, 1.2)}${brilho(20, -4, .8)}`,
};

/**
 * A carta de recurso: o objeto num disco claro de borda dourada, sobre a cor do recurso. Com nome
 * (a da mão), o disco fica no alto e a faixa embaixo; sem nome (a pequena do banco, das janelas e da
 * cola, que chega a 20 px), o disco desce para o meio e o objeto cresce — ali, quem diz o recurso é
 * só o desenho.
 */
function faceDeRecurso(r: Recurso, comNome: boolean): string {
  const [cy, raio, lado] = comNome ? [57, 36, 86] : [70, 40, 94];
  return `${moldura(`catan-g-${r}`)}
    <circle cx="50" cy="${cy + 1.6}" r="${raio + 2}" fill="rgba(0,0,0,.28)"/>
    <circle cx="50" cy="${cy}" r="${raio + 2}" fill="${PAPEL}"/>
    <circle cx="50" cy="${cy}" r="${raio + .6}" fill="${OURO}"/>
    <circle cx="50" cy="${cy}" r="${raio - .6}" fill="url(#catan-g-disco-${r})"/>
    <use href="#${SIMBOLO.objeto(r)}" x="${50 - lado / 2}" y="${cy - lado / 2}" width="${lado}" height="${lado}"/>
    ${comNome ? `<path d="M14 106h72l-5 7 5 7H14l5-7z" fill="${PAPEL}" stroke="${OURO}" stroke-width="1"/>
    <text x="50" y="116.3" text-anchor="middle" font-family="Figtree" font-weight="900" font-size="10.5" letter-spacing=".8" fill="#4a3516">${NOME[r].toUpperCase()}</text>` : ''}`;
}

/**
 * O verso de recurso tem a COR DE QUEM SEGURA a carta (pedido do dono, 07/10/2026: "saber quem é
 * quem de forma mais fácil pela cor"): o leque de cada lugar é vermelho, azul, laranja ou branco, a
 * mesma cor das peças dele no tabuleiro. A cor chega pela variável `--cor-do-jogador` do lugar — o
 * `<use>` herda as variáveis de quem o contém, então o símbolo continua um só. Sem ela (fora de um
 * lugar), o azul do mar de antes.
 */
function versoDeRecurso(): string {
  const cores = ['#4f8c45', '#e0915f', '#b3e07a', '#f8dc78', '#b3bac6', '#e7cf92'];
  return `<rect x="1" y="1" width="98" height="138" rx="9" fill="${PAPEL}"/>
    <rect x="4.5" y="4.5" width="91" height="131" rx="6.5" style="fill: var(--cor-do-jogador, #2f63ad)"/>
    <rect x="4.5" y="4.5" width="91" height="131" rx="6.5" fill="url(#catan-g-verso-luz)"/>
    <rect x="7" y="7" width="86" height="126" rx="5" fill="none" stroke="${OURO_CLARO}" stroke-width=".9" opacity=".75"/>
    <rect x="7" y="7" width="86" height="126" rx="5" fill="url(#catan-p-hex)"/>
    <polygon points="${hex(50, 70, 27)}" fill="${OURO}"/>
    <polygon points="${hex(50, 70, 24)}" fill="${PAPEL}"/>
    <polygon points="${hex(50, 70, 21.5)}" fill="#1d4683"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => {
      const a = Math.PI / 3 * i - Math.PI / 2;
      return `<polygon points="${hex(50 + 10.5 * Math.cos(a), 70 + 10.5 * Math.sin(a), 4.6)}" fill="${cores[i]}" stroke="#10285a" stroke-width=".6"/>`;
    }).join('')}
    <polygon points="${hex(50, 70, 4.6)}" fill="#e7cf92" stroke="#10285a" stroke-width=".6"/>`;
}

function versoDeDesenvolvimento(): string {
  return `${moldura('catan-g-verso-dev')}
    <rect x="7" y="7" width="86" height="126" rx="5" fill="url(#catan-p-riscas)"/>
    <circle cx="50" cy="70" r="25" fill="${OURO}"/><circle cx="50" cy="70" r="22.5" fill="${PAPEL}"/><circle cx="50" cy="70" r="20.5" fill="#4a1d5e"/>
    <path d="M36 79h28l-2.6-15.5-7.2 6.6-4.2-11.5-4.2 11.5-7.2-6.6z" fill="${OURO_CLARO}" stroke="#8a6526" stroke-width=".8" stroke-linejoin="round"/>
    <rect x="35.5" y="79" width="29" height="4.5" rx="1.2" fill="${OURO_CLARO}" stroke="#8a6526" stroke-width=".8"/>
    <circle cx="50" cy="58.2" r="2.2" fill="${OURO_CLARO}"/><circle cx="38.6" cy="63.6" r="1.8" fill="${OURO_CLARO}"/><circle cx="61.4" cy="63.6" r="1.8" fill="${OURO_CLARO}"/>`;
}

/** As cenas das cinco cartas, em 100×140, com a área da cena entre y=24 e y=98. */
const ARTE: Record<CartaDeDesenvolvimento, () => string> = {
  cavaleiro: () => `
    <path d="M28 82L72 30" stroke="#5b4630" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M33 77L70 33" stroke="#e8edf3" stroke-width="5" stroke-linecap="round"/><path d="M34 76L69.5 33.6" stroke="#aab4c2" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M27 72l10 10" stroke="${OURO}" stroke-width="3.4" stroke-linecap="round"/><circle cx="26" cy="84" r="2.6" fill="${OURO}"/>
    <path d="M50 42c9 2.5 15 2 19-.5v17c0 13-8 21-19 26-11-5-19-13-19-26v-17c4 2.5 10 3 19 .5z" fill="#2f5fa8" stroke="${OURO_CLARO}" stroke-width="2"/>
    <path d="M50 46v34M37 58h26" stroke="${OURO_CLARO}" stroke-width="3.4"/>
    <path d="M50 42c9 2.5 15 2 19-.5v17c0 13-8 21-19 26" fill="rgba(0,0,0,.14)"/>`,
  ponto: () => `
    <path d="M14 92q36-14 72 0v4H14z" fill="#5d8f3e"/>
    <rect x="30" y="56" width="40" height="30" fill="#d8cdb6" stroke="#8c7a5a" stroke-width="1"/>
    <rect x="24" y="46" width="12" height="40" fill="#e6dcc6" stroke="#8c7a5a" stroke-width="1"/><rect x="64" y="46" width="12" height="40" fill="#e6dcc6" stroke="#8c7a5a" stroke-width="1"/>
    <rect x="42" y="38" width="16" height="48" fill="#efe6d2" stroke="#8c7a5a" stroke-width="1"/>
    <path d="M23 46h14l-7-10z" fill="#b8322a"/><path d="M63 46h14l-7-10z" fill="#b8322a"/><path d="M41 38h18l-9-13z" fill="#b8322a"/>
    <path d="M47 86v-10a3 3 0 0 1 6 0v10z" fill="#5b4630"/><rect x="28" y="62" width="4" height="6" rx="2" fill="#5b4630"/><rect x="68" y="62" width="4" height="6" rx="2" fill="#5b4630"/><rect x="48" y="52" width="4" height="7" rx="2" fill="#5b4630"/>
    <path d="M50 25v-10" stroke="#5b4630" stroke-width="1"/><path d="M50 15l9 3-9 3z" fill="#e0a233"/>
    <path d="M77 22l2.1 4.6 5 .5-3.8 3.3 1.1 4.9-4.4-2.6-4.4 2.6 1.1-4.9-3.8-3.3 5-.5z" fill="#fff3b0" stroke="#e0a233" stroke-width=".8"/>`,
  monopolio: () => `
    <ellipse cx="50" cy="90" rx="28" ry="4" fill="rgba(0,0,0,.2)"/>
    <path d="M38 50c-14 10-16 38 12 38s26-28 12-38z" fill="#c99a52" stroke="#6f5126" stroke-width="1.2"/>
    <path d="M40 50c3-4 17-4 20 0" fill="none" stroke="#6f5126" stroke-width="3"/>
    <path d="M42 45l4 5h8l4-5c-2-4-14-4-16 0z" fill="#d9b06b" stroke="#6f5126" stroke-width="1"/>
    <circle cx="50" cy="70" r="9" fill="#e0a233" stroke="#8a6526" stroke-width="1.2"/><circle cx="50" cy="70" r="5.6" fill="none" stroke="#8a6526" stroke-width="1.1"/>
    <path d="M47.6 72.4l2.4-5.2 2.4 5.2" fill="none" stroke="#8a6526" stroke-width="1.1" stroke-linejoin="round"/>
    ${[[24, 84], [30, 86], [74, 85], [80, 82]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5.5" ry="2.4" fill="#e0a233" stroke="#8a6526" stroke-width=".8"/>`).join('')}
    <ellipse cx="77" cy="79.5" rx="5.5" ry="2.4" fill="#f0bd4f" stroke="#8a6526" stroke-width=".8"/>`,
  fartura: () => `
    <path d="M20 46c10 32 34 44 58 34l-6-10c-18 6-34-4-40-28z" fill="#c98a3c" stroke="#6f4a1c" stroke-width="1.2"/>
    ${[0, 1, 2, 3].map((i) => `<path d="M${24 + i * 6} ${50 + i * 7}c4 2 8 2 10 0" stroke="#8a5a26" stroke-width="1" fill="none"/>`).join('')}
    <circle cx="68" cy="66" r="6.5" fill="#d8453b" stroke="#7a2420" stroke-width=".8"/><circle cx="76" cy="72" r="6" fill="#e8912d" stroke="#8a4f17" stroke-width=".8"/>
    <circle cx="62" cy="58" r="5" fill="#7b4fb0" stroke="#3f2560" stroke-width=".8"/><circle cx="58" cy="54" r="4.3" fill="#8f63c4" stroke="#3f2560" stroke-width=".8"/>
    ${[0, 1, 2].map((i) => `<path d="M${70 + i * 4} 60l${6 + i * 2} -${22 - i * 3}" stroke="#b98a24" stroke-width="1.4"/><ellipse cx="${76 + i * 6}" cy="${39 + i * 3}" rx="2" ry="5" fill="#f6d56b" stroke="#b98a24" stroke-width=".6" transform="rotate(${20 + i * 8} ${76 + i * 6} ${39 + i * 3})"/>`).join('')}
    <path d="M60 64l8-6 4 6" fill="#5d8f3e"/>`,
  estradas: () => `
    <path d="M10 88L90 88" stroke="#7d9b4e" stroke-width="10"/>
    <path d="M16 84L58 36" stroke="#8a5a2b" stroke-width="9" stroke-linecap="round"/><path d="M16 84L58 36" stroke="#a8733d" stroke-width="3" stroke-linecap="round"/>
    <path d="M44 84L86 46" stroke="#8a5a2b" stroke-width="9" stroke-linecap="round"/><path d="M44 84L86 46" stroke="#a8733d" stroke-width="3" stroke-linecap="round"/>
    <path d="M60 26L74 62" stroke="#6b4a26" stroke-width="2.4" stroke-linecap="round"/><path d="M54 30c4-6 12-8 16-6" stroke="#9aa4b2" stroke-width="3.4" stroke-linecap="round" fill="none"/>
    <path d="M30 28L44 64" stroke="#6b4a26" stroke-width="2.4" stroke-linecap="round" transform="rotate(-40 37 46)"/><path d="M28 24h10l-1 7h-8z" fill="#9aa4b2" transform="rotate(-40 37 46)"/>`,
};

function faceDeDesenvolvimento(tipo: CartaDeDesenvolvimento, comTexto: boolean): string {
  const alto = comTexto ? 74 : 100;
  const titulo = TITULO[tipo];
  const longo = titulo.length > 12;
  return `${moldura('catan-g-dev')}
    <path d="M12 9.5h76l-4 6.5 4 6.5H12l4-6.5z" fill="${PAPEL}" stroke="${OURO}" stroke-width=".9"/>
    <text x="50" y="19.6" text-anchor="middle" font-family="Figtree" font-weight="900" font-size="${longo ? 6.6 : 8.6}" letter-spacing="${longo ? .1 : .5}" fill="#4a1d5e">${titulo.toUpperCase()}</text>
    <rect x="10" y="23" width="80" height="${alto + 2}" rx="5" fill="${OURO}"/>
    <g clip-path="url(#catan-clip-cena-${alto})"><rect x="11" y="24" width="78" height="${alto}" fill="url(#catan-cena-${tipo})"/>
      <g transform="translate(0 ${comTexto ? 4 : 16})">${ARTE[tipo]()}</g></g>
    ${comTexto ? `<rect x="11" y="102" width="78" height="27" rx="4" fill="${PAPEL}"/>
    ${TEXTO[tipo].map((l, i) => `<text x="50" y="${113 + i * 9}" text-anchor="middle" font-family="Figtree" font-weight="700" font-size="7.4" fill="#3a2a14">${l}</text>`).join('')}` : ''}`;
}

/** O id do símbolo de cada carta, para o `<use href>`. */
export const SIMBOLO = {
  recurso: (r: Recurso) => `catan-carta-${r}`,
  /** Sem a faixa do nome: a carta pequena das janelas, da cola e do banco. */
  recursoPequeno: (r: Recurso) => `catan-carta-${r}-p`,
  /** O objeto do recurso sozinho, sem carta (viewBox de 80×80 centrado em 0,0). */
  objeto: (r: Recurso) => `catan-obj-${r}`,
  versoDeRecurso: 'catan-verso-recurso',
  versoDeDesenvolvimento: 'catan-verso-desenvolvimento',
  desenvolvimento: (t: CartaDeDesenvolvimento) => `catan-dev-${t}`,
  /** Sem o texto de baixo: a carta da mão, pequena demais para ler duas linhas. */
  desenvolvimentoCurto: (t: CartaDeDesenvolvimento) => `catan-dev-${t}-c`,
};

let sprite: string | null = null;
/**
 * O sprite inteiro: os gradientes das cartas, um símbolo por objeto de recurso e um por carta.
 * Montado na primeira vez que se pede, e nunca mais.
 */
export function simbolosDasCartas(): string {
  if (sprite) return sprite;
  const simbolo = (id: string, corpo: string) => `<symbol id="${id}" viewBox="0 0 100 140">${corpo}</symbol>`;
  let s = '<defs>';
  for (const r of RECURSOS) {
    s += gradiente(`catan-g-${r}`, ...COR[r]);
    // O disco do objeto: claro no meio, com um tom do recurso na borda.
    s += `<radialGradient id="catan-g-disco-${r}" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="${clarear(COR[r][0], .72)}"/><stop offset="1" stop-color="${clarear(COR[r][0], .38)}"/></radialGradient>`;
    s += `<symbol id="${SIMBOLO.objeto(r)}" viewBox="-40 -40 80 80" overflow="visible">${OBJETO[r]()}</symbol>`;
  }
  // A luz por cima da cor do jogador no verso: clareia em cima e escurece embaixo, como os outros fundos.
  s += '<linearGradient id="catan-g-verso-luz" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>';
  s += gradiente('catan-g-verso-dev', '#7d3f93', '#2f1240') + gradiente('catan-g-dev', '#6b3482', '#2a0f3a');
  for (const t of TIPOS_DE_DESENVOLVIMENTO) {
    s += `<linearGradient id="catan-cena-${t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CENA[t][0]}"/><stop offset="1" stop-color="${CENA[t][1]}"/></linearGradient>`;
  }
  s += '<clipPath id="catan-clip-cena-74"><rect x="11" y="24" width="78" height="74" rx="4"/></clipPath>';
  s += '<clipPath id="catan-clip-cena-100"><rect x="11" y="24" width="78" height="100" rx="4"/></clipPath>';
  s += `<pattern id="catan-p-hex" width="12" height="20.8" patternUnits="userSpaceOnUse">${[[6, 5.2], [0, 15.6], [12, 15.6]].map(([x, y]) => `<polygon points="${hex(x, y, 5)}" fill="none" stroke="#fff" stroke-width=".5" opacity=".28"/>`).join('')}</pattern>`;
  s += `<pattern id="catan-p-riscas" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 5h10" stroke="${OURO_CLARO}" stroke-width=".5" opacity=".14"/></pattern>`;
  for (const r of RECURSOS) {
    s += simbolo(SIMBOLO.recurso(r), faceDeRecurso(r, true));
    s += simbolo(SIMBOLO.recursoPequeno(r), faceDeRecurso(r, false));
  }
  s += simbolo(SIMBOLO.versoDeRecurso, versoDeRecurso());
  s += simbolo(SIMBOLO.versoDeDesenvolvimento, versoDeDesenvolvimento());
  for (const t of TIPOS_DE_DESENVOLVIMENTO) {
    s += simbolo(SIMBOLO.desenvolvimento(t), faceDeDesenvolvimento(t, true));
    s += simbolo(SIMBOLO.desenvolvimentoCurto(t), faceDeDesenvolvimento(t, false));
  }
  s += '</defs>';
  sprite = s;
  return s;
}

/**
 * As cores da MESA — o feltro, o papel da cola, o ouro dos discos —, escritas pela tela como
 * variáveis no elemento da mesa (`style`), porque são desenho de jogo e o CSS só tem tokens da casa
 * (`design.test.ts`, que as conhece pela lista `DA_HORA`).
 */
export const CORES_DA_MESA: Record<string, string> = {
  '--mesa-feltro': 'radial-gradient(ellipse 75% 70% at 50% 46%, #245c4d 0%, #1a4439 48%, #0f2621 100%)',
  // A camada de animação do tabuleiro (SobreOTabuleiro.tsx): a poeira, o clarão e a sombra da peça caindo.
  '--mesa-poeira': 'radial-gradient(circle, rgb(246 236 210 / 1), rgb(220 202 166 / .75) 50%, transparent 70%)',
  '--mesa-clarao': 'radial-gradient(closest-side, rgb(255 246 214 / .95), rgb(255 230 160 / .35) 55%, transparent)',
  '--mesa-sombra-da-queda': 'radial-gradient(closest-side, rgb(0 0 0 / .55), transparent)',
  '--mesa-papel': 'linear-gradient(170deg, #f6ead0, #e8d5ad)',
  '--mesa-papel-borda': '#c9a25e',
  '--mesa-papel-claro': '#f6ead0',
  '--mesa-tinta': '#3a2a14',
  '--mesa-tinta-2': '#6b4a1c',
  '--mesa-disco': 'radial-gradient(circle at 35% 30%, #ffe7a3, #e0a233 60%, #a86f12)',
  '--mesa-disco-tinta': '#3a2604',
  '--mesa-fita': '#e0a233',
  '--mesa-pode': 'rgba(46, 163, 106, .16)',
  '--mesa-pode-borda': 'rgba(46, 163, 106, .55)',
  '--mesa-placa': 'rgba(9, 14, 17, .6)',
  '--mesa-placa-borda': 'rgba(255, 255, 255, .08)',
  '--mesa-selo': '#f4f7fb',
  '--mesa-selo-tinta': '#13305e',
  '--mesa-selo-dev': '#f3e3ff',
  '--mesa-selo-dev-tinta': '#3d1c52',
};
