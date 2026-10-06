/**
 * A arte das cartas do Catan na mesa em volta (06/10/2026): as de recurso com o terreno do próprio
 * tabuleiro num medalhão, as cinco de desenvolvimento ilustradas, e os dois versos — o de recurso
 * azul como o mar, o de desenvolvimento vinho com a coroa, para os montinhos se distinguirem de
 * longe. Desenho de JOGO, e por isso as cores moram aqui e não no CSS (a regra do catan.css).
 *
 * Tudo vira UM sprite de `<symbol>`s, montado uma vez e posto escondido na tela da mesa; cada carta
 * é só um `<svg><use href="#…"/></svg>`. A tela redesenha a cada leitura (800 ms), e uma mesa tem
 * dezenas de cartas: repetir o SVG inteiro de cada uma — o terreno sozinho passa de 10 KB — seria
 * refazer centenas de KB de DOM a cada leitura.
 */
import type { CartaDeDesenvolvimento, Recurso, Terreno } from './catan';
import { RECURSOS } from './catan';
import { defs, terreno } from './desenhoDoCatan';

/** O terreno que cada recurso traz no medalhão: o mesmo hexágono do tabuleiro. */
export const TERRENO_DO_RECURSO: Record<Recurso, Terreno> = {
  madeira: 'floresta', tijolo: 'colina', la: 'pasto', trigo: 'campo', minerio: 'montanha',
};
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

function faceDeRecurso(r: Recurso, comNome: boolean): string {
  return `${moldura(`catan-g-${r}`)}
    <polygon points="${hex(50, 59.5, 36.5)}" fill="rgba(0,0,0,.28)"/>
    <polygon points="${hex(50, 58, 36)}" fill="${PAPEL}"/>
    <polygon points="${hex(50, 58, 34.2)}" fill="${OURO}"/>
    <g clip-path="url(#catan-clip-medalhao)"><g transform="translate(50 58) scale(38)">${terreno(TERRENO_DO_RECURSO[r], 7 + RECURSOS.indexOf(r) * 13)}</g></g>
    <polygon points="${hex(50, 58, 33)}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
    ${comNome ? `<path d="M14 106h72l-5 7 5 7H14l5-7z" fill="${PAPEL}" stroke="${OURO}" stroke-width="1"/>
    <text x="50" y="116.3" text-anchor="middle" font-family="Figtree" font-weight="900" font-size="10.5" letter-spacing=".8" fill="#4a3516">${NOME[r].toUpperCase()}</text>` : ''}`;
}

function versoDeRecurso(): string {
  const cores = ['#4f8c45', '#e0915f', '#b3e07a', '#f8dc78', '#b3bac6', '#e7cf92'];
  return `${moldura('catan-g-verso')}
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
  versoDeRecurso: 'catan-verso-recurso',
  versoDeDesenvolvimento: 'catan-verso-desenvolvimento',
  desenvolvimento: (t: CartaDeDesenvolvimento) => `catan-dev-${t}`,
  /** Sem o texto de baixo: a carta da mão, pequena demais para ler duas linhas. */
  desenvolvimentoCurto: (t: CartaDeDesenvolvimento) => `catan-dev-${t}-c`,
};

let sprite: string | null = null;
/**
 * O sprite inteiro: os gradientes do tabuleiro (os terrenos os usam), os das cartas e um símbolo
 * por carta. Montado na primeira vez que se pede, e nunca mais.
 */
export function simbolosDasCartas(): string {
  if (sprite) return sprite;
  const simbolo = (id: string, corpo: string) => `<symbol id="${id}" viewBox="0 0 100 140">${corpo}</symbol>`;
  let s = defs();
  s += '<defs>';
  for (const r of RECURSOS) s += gradiente(`catan-g-${r}`, ...COR[r]);
  s += gradiente('catan-g-verso', '#2f63ad', '#10285a') + gradiente('catan-g-verso-dev', '#7d3f93', '#2f1240') + gradiente('catan-g-dev', '#6b3482', '#2a0f3a');
  for (const t of TIPOS_DE_DESENVOLVIMENTO) {
    s += `<linearGradient id="catan-cena-${t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CENA[t][0]}"/><stop offset="1" stop-color="${CENA[t][1]}"/></linearGradient>`;
  }
  s += `<clipPath id="catan-clip-medalhao"><polygon points="${hex(50, 58, 33)}"/></clipPath>`;
  s += '<clipPath id="catan-clip-cena-74"><rect x="11" y="24" width="78" height="74" rx="4"/></clipPath>';
  s += '<clipPath id="catan-clip-cena-100"><rect x="11" y="24" width="78" height="100" rx="4"/></clipPath>';
  s += `<pattern id="catan-p-hex" width="12" height="20.8" patternUnits="userSpaceOnUse">${[[6, 5.2], [0, 15.6], [12, 15.6]].map(([x, y]) => `<polygon points="${hex(x, y, 5)}" fill="none" stroke="#9cc3f2" stroke-width=".5" opacity=".22"/>`).join('')}</pattern>`;
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
