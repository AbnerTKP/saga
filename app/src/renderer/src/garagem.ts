/**
 * A Garagem: o minigame de andar pela garagem, beber, comer e jogar fliperama — e o parabéns
 * surpresa (pedido do dono em 26/10/2026, refeito em 27/10/2026).
 *
 * Para todo mundo é um minigame comum, sem nada de aniversário: a garagem tem um tema (moto, carro,
 * mecânica, videogame ou PC gamer) e só o dono da Saga prepara a festa — escolhe uma ou duas pessoas,
 * o nome de cada uma no telão e o tema de cada uma. O lado ESQUERDO da garagem é do primeiro
 * aniversariante e o DIREITO, do segundo; com um só, a garagem inteira é dele. Quando o dono manda
 * cantar, a mesa com o bolo aparece, os aniversariantes vão para trás dela vestidos do tema, o resto
 * da turma para a frente, a luz apaga e todo mundo canta — na tela de todos ao mesmo tempo, porque a
 * hora é a do SERVIDOR (`parabens.inicio`).
 *
 * Aqui mora a regra, sem tela e sem som, e é isto que tem teste: o caminho em volta dos móveis, o
 * roteiro do parabéns, o lugar de cada um na festa, o beber até cair, o fliperama, e como a posição
 * dos outros que chega do servidor vira boneco andando. O desenho é do `desenhoDaGaragem.ts` (e dos
 * temas, `temasDaGaragem.ts`), o som do `somDaGaragem.ts`, o jogo do fliperama do `navinha.ts`, e a
 * tela, da `TelaDaGaragem.tsx`.
 *
 * Ninguém manda posição de quadro em quadro. Cada app manda onde o SEU boneco está e para onde vai
 * (`alvo`), de ~350 em 350 ms, e cada tela anda os outros até lá com o mesmo `planejar`: o boneco
 * dos outros anda liso, sem saltar de leitura em leitura, e o servidor guarda meia dúzia de números
 * por pessoa. A coordenada é a do desenho (320×180), a mesma do `garagem.mjs`.
 */

export const LARGURA = 320;
export const ALTURA = 180;

export type Direcao = 'baixo' | 'cima' | 'esq' | 'dir';
export type Ponto = { x: number; y: number };
export type Retangulo = { x1: number; y1: number; x2: number; y2: number };

// --- os temas e a festa ---------------------------------------------------------------------

/** Os temas da garagem (o dono, 27/10/2026: "moto, carro, mecânica, jogos, pc gamer"). */
export type Tema = 'moto' | 'carro' | 'mecanica' | 'jogos' | 'pc';
export const TEMAS: readonly { tema: Tema; nome: string }[] = [
  { tema: 'moto', nome: 'Moto' },
  { tema: 'carro', nome: 'Carro' },
  { tema: 'mecanica', nome: 'Mecânica' },
  { tema: 'jogos', nome: 'Videogame' },
  { tema: 'pc', nome: 'PC gamer' },
];
export const eTema = (v: unknown): v is Tema => TEMAS.some((t) => t.tema === v);
/** 0 é o lado esquerdo da garagem, 1 o direito. */
export type Lado = 0 | 1;

/** Quem faz aniversário: a conta (é ela que vai para trás da mesa), o nome no telão e o tema. */
export type Aniversariante = { id: number; nome: string; tema: Tema };
export const MAX_ANIVERSARIANTES = 2;
/** O nome no telão cabe nisto (o telão tem 120 px de pixel e a letra é grande). */
export const MAX_NOME_NO_TELAO = 14;

/** O tema de cada lado: o esquerdo do primeiro aniversariante, o direito do segundo — ou do mesmo, se for um só. */
export function temasDa(aniversariantes: readonly Aniversariante[] | null | undefined): [Tema, Tema] {
  const a = aniversariantes ?? [];
  if (!a.length) return ['moto', 'moto'];
  return [a[0].tema, (a[1] ?? a[0]).tema];
}

/** "TAVÃO & DONIS", no telão. */
export const nomesNoTelao = (a: readonly Aniversariante[]) => a.map((p) => p.nome.toUpperCase()).join(' & ');
/** "TAVÃO! DONIS!", no grito depois do rá-tim-bum. */
export const nomesNoGrito = (a: readonly Aniversariante[]) => a.map((p) => `${p.nome.toUpperCase()}!`).join(' ');

// --- o que se come e se bebe ----------------------------------------------------------------

export type Comida =
  | 'cerveja' | 'refri' | 'suco' | 'agua'
  | 'coxinha' | 'pizza' | 'pastel' | 'cachorro' | 'brigadeiro' | 'bolo';
/**
 * Cada coisa: se é de beber ou de comer (o som e a mão), o que sai escrito em cima da cabeça, e quanto
 * enche a barriga. A ÁGUA esvazia: é o jeito de não desmaiar.
 */
export const COMIDAS: Record<Comida, { tipo: 'beber' | 'comer'; grito: string; barriga: number }> = {
  cerveja: { tipo: 'beber', grito: 'glup!', barriga: 1 },
  refri: { tipo: 'beber', grito: 'glup!', barriga: 1 },
  suco: { tipo: 'beber', grito: 'glup!', barriga: 1 },
  agua: { tipo: 'beber', grito: 'ahh!', barriga: -1 },
  coxinha: { tipo: 'comer', grito: 'coxinha!', barriga: 1 },
  pizza: { tipo: 'comer', grito: 'pizza!', barriga: 1 },
  pastel: { tipo: 'comer', grito: 'pastel!', barriga: 1 },
  cachorro: { tipo: 'comer', grito: 'dogão!', barriga: 1 },
  brigadeiro: { tipo: 'comer', grito: 'brigadeiro!', barriga: 1 },
  bolo: { tipo: 'comer', grito: 'bolo!', barriga: 1 },
};
export const eComida = (v: unknown): v is Comida => typeof v === 'string' && Object.hasOwn(COMIDAS, v);
/** O app de antes mandava só "beber" e "comer". */
export const comidaDe = (v: unknown): Comida | null => (eComida(v) ? v : v === 'beber' ? 'cerveja' : v === 'comer' ? 'coxinha' : null);

// --- a sala ---------------------------------------------------------------------------------

/** Os pés de ninguém saem daqui — o mesmo `LIMITES` do servidor. */
export const LIMITES: Retangulo = { x1: 8, y1: 72, x2: 312, y2: 176 };
/** A mesa do bolo, que só existe na festa: o tampo em `topo`–`frente`, a toalha até `base`. */
export const MESA = { x1: 126, x2: 194, topo: 84, frente: 96, base: 108 };
/**
 * As duas peças grandes do tema, uma de cada lado (eram a Harley e a Sahara). O desenho de cada tema
 * cabe nestas caixas, e o chão que os pés não pisam é a faixa de baixo delas (`MOVEIS`).
 */
export const PECAS: readonly (Retangulo & { base: number })[] = [
  { x1: 8, x2: 98, y1: 96, y2: 153, base: 150 },
  { x1: 224, x2: 308, y1: 88, y2: 153, base: 150 },
];
/** Onde se clica para pegar, onde o boneco para para pegar, e o que se pega ali. */
export const BALCOES = [
  { id: 'bebidas', itens: ['cerveja', 'refri', 'suco'] as Comida[], x1: 14, x2: 70, y1: 64, y2: 96, base: 94, para: { x: 46, y: 101 } },
  { id: 'salgados', itens: ['coxinha', 'pizza', 'pastel', 'cachorro', 'brigadeiro'] as Comida[], x1: 250, x2: 286, y1: 60, y2: 96, base: 94, para: { x: 268, y: 101 } },
  { id: 'agua', itens: ['agua'] as Comida[], x1: 288, x2: 307, y1: 62, y2: 96, base: 94.5, para: { x: 298, y: 101 } },
] as const;
export type Balcao = (typeof BALCOES)[number];
/** Os dois fliperamas, fixos em qualquer tema, um de cada lado do telão. */
export const FLIPERAMAS = [
  { x1: 74, x2: 95, y1: 50, y2: 96, base: 94.2, para: { x: 84.5, y: 101 } },
  { x1: 225, x2: 246, y1: 50, y2: 96, base: 94.2, para: { x: 235.5, y: 101 } },
] as const;
/** O bolo, depois do canto: a mesa vira mais um balcão, e dá para comer um pedaço. */
export const PEDACO_DE_BOLO = { x1: MESA.x1, x2: MESA.x2, y1: 64, y2: MESA.base, para: { x: 160, y: 116 } };
/** Por onde os pés não passam: as peças do tema, os balcões, os fliperamas. */
const MOVEIS: Retangulo[] = [
  { x1: 12, y1: 136, x2: 98, y2: 156 },
  { x1: 222, y1: 132, x2: 308, y2: 156 },
  { x1: 14, y1: 86, x2: 70, y2: 96 },
  { x1: 250, y1: 86, x2: 286, y2: 96 },
  { x1: 289, y1: 88, x2: 306, y2: 96 },
  { x1: 74, y1: 86, x2: 95, y2: 96 },
  { x1: 225, y1: 86, x2: 246, y2: 96 },
];
const PES_DA_MESA: Retangulo = { x1: 122, y1: 94, x2: 198, y2: 112 };
export const obstaculosDa = (comMesa: boolean) => (comMesa ? [...MOVEIS, PES_DA_MESA] : MOVEIS);
/** Quem entra na garagem chega pela porta, que é o pé da tela. */
export const PORTA: Ponto = { x: 160, y: 168 };

export const VELOCIDADE = 42;
/** No sexto gole ou mordida, desmaia. */
export const LIMITE_DA_BARRIGA = 6;
/** Do último gole ao chão. */
export const ATE_CAIR = 0.7;
/** Quanto o boneco fica deitado. */
export const CAIDO = 2.2;
/** Quanto a SUA tela fica preta quando é você quem cai (o pedido: "1 segundo apagar a tela e voltar"). */
export const APAGAO = 1;
/** A partir daqui, o boneco anda torto e solta "hic!". */
export const TONTO = 3;
/** O boneco dos outros mais longe que isto da posição que chegou pula para ela, em vez de andar. */
const TELETRANSPORTE = 28;

// --- o caminho ------------------------------------------------------------------------------

export const dentroDe = (x: number, y: number, o: Retangulo) => x > o.x1 && x < o.x2 && y > o.y1 && y < o.y2;
export const bloqueado = (x: number, y: number, obst: Retangulo[]) => obst.some((o) => dentroDe(x, y, o));
const naSala = (x: number, y: number) => x >= LIMITES.x1 && x <= LIMITES.x2 && y >= LIMITES.y1 && y <= LIMITES.y2;
export const naCaixa = (q: Ponto, k: { x1: number; x2: number; y1: number; y2: number }) => q.x >= k.x1 && q.x <= k.x2 && q.y >= k.y1 && q.y <= k.y2;

function cruza(a: Ponto, b: Ponto, o: Retangulo) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
  for (let i = 1; i < n; i++) {
    if (dentroDe(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, o)) return true;
  }
  return false;
}

/** O ponto mais perto que está livre e dentro da sala: clicar em cima de uma moto leva para a beira dela. */
export function soltar(q: Ponto, obst: Retangulo[]): Ponto {
  const p = { x: Math.min(LIMITES.x2, Math.max(LIMITES.x1, q.x)), y: Math.min(LIMITES.y2, Math.max(LIMITES.y1, q.y)) };
  const o = obst.find((r) => dentroDe(p.x, p.y, r));
  if (!o) return p;
  const opcoes = [
    { x: p.x, y: o.y1 - 1, d: p.y - o.y1 }, { x: p.x, y: o.y2 + 1, d: o.y2 - p.y },
    { x: o.x1 - 1, y: p.y, d: p.x - o.x1 }, { x: o.x2 + 1, y: p.y, d: o.x2 - p.x },
  ].filter((k) => naSala(k.x, k.y) && !bloqueado(k.x, k.y, obst)).sort((m, n) => m.d - n.d);
  return opcoes[0] ? { x: opcoes[0].x, y: opcoes[0].y } : p;
}

const comprimento = (de: Ponto, pts: Ponto[]) =>
  pts.reduce((s, q, i) => s + Math.hypot(q.x - (i ? pts[i - 1] : de).x, q.y - (i ? pts[i - 1] : de).y), 0);

/**
 * O caminho de `a` a `b`: reto quando dá, e pelos cantos do móvel que estiver no meio quando não dá
 * — e cada trecho do desvio é conferido de novo, porque contornar a Sahara pode dar de cara com a
 * mesa (era o Tava1 chegando atrasado à festa, preso embaixo da toalha). Não é um planejador de
 * verdade: a sala tem poucos móveis, longe uns dos outros, e o que sobrar `andar` resolve deslizando
 * pela beira ou planejando de novo.
 */
export function planejar(a: Ponto, b: Ponto, obst: Retangulo[], fundo = 0): Ponto[] {
  const o = obst.find((r) => cruza(a, b, r));
  if (!o || fundo > 3) return [b];
  const M = 3;
  const cantos = [
    { x: o.x1 - M, y: o.y1 - M }, { x: o.x2 + M, y: o.y1 - M },
    { x: o.x1 - M, y: o.y2 + M }, { x: o.x2 + M, y: o.y2 + M },
  ].filter((k) => naSala(k.x, k.y) && !bloqueado(k.x, k.y, obst));
  let melhor: Ponto[] | null = null;
  for (const k of cantos) {
    if (cruza(a, k, o)) continue;
    const opcoes: Ponto[][] = [];
    if (!cruza(k, b, o)) opcoes.push([k, b]);
    else for (const k2 of cantos) if (k2 !== k && !cruza(k, k2, o) && !cruza(k2, b, o)) opcoes.push([k, k2, b]);
    for (const pts of opcoes) if (!melhor || comprimento(a, pts) < comprimento(a, melhor)) melhor = pts;
  }
  if (!melhor) return [b];
  const caminho: Ponto[] = [];
  let de = a;
  for (const p of melhor) { caminho.push(...planejar(de, p, obst, fundo + 1)); de = p; }
  return caminho;
}

// --- o parabéns -----------------------------------------------------------------------------

/** Um tempo da música, em segundos. */
export const TEMPO = 0.42;
/** Da mesa aparecer à luz apagar: todo mundo chega no lugar até aqui. */
export const REUNIR = 4.5;
/** Depois do "Feliz aniversário!", a mesa fica montada isto, e some. */
export const DESMONTAR = 8;
const ENTRADA = 1.3;
type Nota = 'F5' | 'G4' | 'A4' | 'B4' | 'C5' | 'D5' | 'E5' | 'G5';
export const HZ: Record<Nota, number> = { G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
const LINHAS: [string, [Nota, number][]][] = [
  ['Parabéns pra você', [['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2]]],
  ['nesta data querida', [['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2]]],
  ['muitas felicidades', [['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2]]],
  ['muitos anos de vida!', [['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 2]]],
];
/** `nomes`: a legenda é o grito com o nome de quem faz aniversário, que só se sabe na hora. */
export type Legenda = { ini: number; fim: number; texto: string; grito: boolean; nomes?: true };

/** A linha do tempo do canto, a partir da luz apagando: legendas, notas, palmas e o rá-tim-bum. */
export const ROTEIRO = (() => {
  const legendas: Legenda[] = [];
  const notas: { t: number; dur: number; f: number }[] = [];
  const palmas: number[] = [];
  let t = ENTRADA;
  for (const [texto, ns] of LINHAS) {
    const ini = t;
    for (const [n, b] of ns) { notas.push({ t, dur: b * TEMPO, f: HZ[n] }); t += b * TEMPO; }
    legendas.push({ ini, fim: t, texto, grito: false });
  }
  t += 0.35;
  for (const texto of ['É pique, é pique!', 'É pique, é pique!', 'É hora, é hora!', 'É hora, é hora!']) {
    legendas.push({ ini: t, fim: t + 1.2, texto, grito: true });
    for (let k = 0; k < 4; k++) palmas.push(t + k * 0.3);
    t += 1.2;
  }
  const ratimbum = t;
  legendas.push({ ini: t, fim: t + 1.5, texto: 'Rá-tim-bum!', grito: true });
  for (let k = 0; k < 3; k++) palmas.push(t + k * 0.32);
  t += 1.5;
  legendas.push({ ini: t, fim: t + 2.2, texto: '', grito: true, nomes: true });
  t += 2.2;
  legendas.push({ ini: t, fim: t + 2.6, texto: 'Feliz aniversário!', grito: false });
  t += 2.6;
  return { legendas, notas, palmas, ratimbum, fim: t };
})();
/** Da mesa aparecer a ela sumir, em segundos. O servidor espera mais que isto para aceitar outro. */
export const DURACAO_DA_FESTA = REUNIR + ROTEIRO.fim + DESMONTAR;

export type FaseDaFesta =
  | { fase: 'reunindo'; t: number }
  | { fase: 'cantando'; t: number }
  | { fase: 'montada'; t: number }
  | null;

/** Em que pé está a festa, `decorrido` segundos depois de o dono apertar o botão. */
export function faseDaFesta(decorrido: number | null): FaseDaFesta {
  if (decorrido === null || decorrido < 0) return null;
  if (decorrido < REUNIR) return { fase: 'reunindo', t: decorrido };
  if (decorrido < REUNIR + ROTEIRO.fim) return { fase: 'cantando', t: decorrido - REUNIR };
  if (decorrido < DURACAO_DA_FESTA) return { fase: 'montada', t: decorrido - REUNIR - ROTEIRO.fim };
  return null;
}
/** A legenda daquele instante, com o nome de quem faz aniversário já no grito. */
export function legendaEm(t: number, aniversariantes: readonly Aniversariante[] = []): Legenda | null {
  const l = ROTEIRO.legendas.find((k) => t >= k.ini && t < k.fim);
  if (!l) return null;
  if (!l.nomes) return l;
  return { ...l, texto: aniversariantes.length ? nomesNoGrito(aniversariantes) : 'Parabéns!' };
}

/**
 * Onde cada um fica no parabéns: o primeiro aniversariante atrás da mesa à esquerda do bolo, o
 * segundo à direita (um só fica no meio, atrás do bolo), e o resto na frente, em fila de até sete,
 * pela ordem do id — a MESMA em toda tela, porque cada tela anda todo mundo sozinha e as contas têm
 * de dar igual. Aniversariante que não está na garagem não ocupa lugar: o telão diz o nome do mesmo jeito.
 */
export function lugaresDaFesta(pessoas: { id: number }[], aniversariantes: readonly { id: number }[]): Map<number, { ponto: Ponto; olhar: Direcao }> {
  const lugares = new Map<number, { ponto: Ponto; olhar: Direcao }>();
  const ids = new Set(pessoas.map((p) => p.id));
  const atras = aniversariantes.filter((a) => ids.has(a.id));
  const sozinho = aniversariantes.length === 1;
  atras.forEach((a) => {
    const lado = aniversariantes.findIndex((k) => k.id === a.id);
    lugares.set(a.id, { ponto: { x: sozinho ? 160 : lado === 0 ? 138 : 182, y: 92 }, olhar: 'baixo' });
  });
  const frente = [...pessoas].sort((a, b) => a.id - b.id).filter((p) => !lugares.has(p.id)).map((p) => p.id);
  const POR_FILA = 7;
  frente.forEach((id, i) => {
    const fila = Math.floor(i / POR_FILA);
    const naFila = Math.min(POR_FILA, frente.length - fila * POR_FILA);
    const k = i % POR_FILA;
    const f = naFila === 1 ? 0.5 : k / (naFila - 1);
    const largura = Math.min(108, (naFila - 1) * 22);
    lugares.set(id, {
      ponto: { x: 160 - largura / 2 + f * largura + (fila % 2) * 8, y: 140 + fila * 16 - Math.sin(f * Math.PI) * 6 },
      olhar: 'cima',
    });
  });
  return lugares;
}

// --- a cara de cada um ----------------------------------------------------------------------

/** A roupa de festa de quem faz aniversário: a do tema dele, numa das duas versões (a do lado dele). */
export type Roupa = { tema: Tema; lado: Lado };
export type Aparencia = { pele: string; cabelo: string; camisa: string; calca: string; roupa: Roupa | null };
const PELES = ['#f0c09a', '#e8b48e', '#e3ad84', '#c98b62', '#a86b4a', '#8d5a3b'];
const CABELOS = ['#1b1b1f', '#2a1d16', '#5b3a29', '#7a4a2a', '#c9a24a', '#141414', '#8a3324'];
const CAMISAS = ['#3f7fe0', '#2ea36a', '#a855f7', '#e0a233', '#14b8a6', '#ec4899', '#64748b', '#e04852'];
const CALCAS = ['#2b3a55', '#3b3742', '#4a3b2a', '#2f3e2f'];
const misturar = (n: number, k: number) => Math.abs(Math.imul(n * 2654435761 + k * 40503, 2246822519) >> 3);

/**
 * A cara do boneco. Ninguém escolhe roupa nem cor (o dono, 26/10/2026): a pele, o cabelo e a roupa
 * saem do id da conta — a mesma em toda tela, e a mesma de um dia para o outro. Na festa, quem faz
 * aniversário veste a roupa do tema dele por cima (a cara continua a dele).
 */
export function aparenciaDe(id: number, roupa: Roupa | null = null): Aparencia {
  return {
    pele: PELES[misturar(id, 1) % PELES.length],
    cabelo: CABELOS[misturar(id, 2) % CABELOS.length],
    camisa: CAMISAS[misturar(id, 3) % CAMISAS.length],
    calca: CALCAS[misturar(id, 4) % CALCAS.length],
    roupa,
  };
}

// --- a garagem andando ----------------------------------------------------------------------

/** O que o servidor guarda de cada boneco (`conferirBoneco` em garagem.mjs). */
export type BonecoNoServidor = {
  x: number; y: number; alvo: Ponto | null; dir: Direcao;
  /** Quanto a barriga está cheia desde o último desmaio. */
  cheio: number;
  /** Contadores que só sobem: é pela diferença que a tela dos outros sabe que você bebeu ou caiu. */
  goles: number; ultimo: Comida | null; quedas: number;
  /** Em que fliperama você está jogando (0 ou 1), ou nenhum. */
  jogando: number | null;
};
export type PessoaNaGaragem = BonecoNoServidor & { id: number; nome: string };
export type Recorde = { nome: string; pontos: number };
export type LeituraDaGaragem = {
  agora: number;
  podeCantar: boolean;
  /** O tema de cada lado da garagem. Vem para todo mundo: é a decoração, sem nada de aniversário. */
  temas?: [Tema, Tema];
  /** O que o dono preparou — só vem para ele, e é o que o painel da festa mostra. */
  preparo?: Aniversariante[];
  /** A festa: começou quando, e de quem. Os nomes só saem do servidor depois de o dono mandar cantar. */
  parabens: { inicio: number; aniversariantes?: Aniversariante[] } | null;
  pessoas: PessoaNaGaragem[];
  /** O placar do fliperama, do maior para o menor. */
  recordes?: Recorde[];
};

export type Boneco = {
  id: number; nome: string; aparencia: Aparencia;
  x: number; y: number; dir: Direcao;
  rota: Ponto[]; olhar: Direcao | null; vel: number | null; replanos: number; aoChegar: (() => void) | null;
  andando: boolean;
  cheio: number; goles: number; ultimo: Comida | null; quedas: number;
  /** O gole ou a mordida acontecendo, e há quanto tempo. */
  acao: { comida: Comida; t: number } | null;
  /** Segundos que faltam deitado; e, para o SEU boneco, quanto falta para cair depois do sexto. */
  caido: number; vaiCair: number;
  hic: number;
  jogando: number | null;
  /** O último `alvo` dos outros que virou caminho aqui, para não planejar de novo a cada leitura. */
  alvoVisto: string | null;
  chapeu: boolean; boca: boolean; pulo: boolean; bracos: boolean;
};

/** O que aconteceu no passo, para a tela tocar o som e o desenho soltar o confete. */
export type Ocorrencia =
  | { tipo: 'consumo'; comida: Comida; id: number; meu: boolean; x: number; y: number }
  | { tipo: 'soluco'; id: number; meu: boolean; x: number; y: number }
  | { tipo: 'desmaio'; id: number; meu: boolean }
  | { tipo: 'ocupado'; x: number; y: number }
  | { tipo: 'fliperama'; qual: number | null }
  | { tipo: 'mesa' }
  | { tipo: 'canto'; aPartirDe: number }
  | { tipo: 'nota'; x: number; y: number }
  | { tipo: 'ratimbum' }
  | { tipo: 'fimDoCanto' };

export function novoBoneco(id: number, nome: string, onde: Ponto): Boneco {
  return {
    id, nome, aparencia: aparenciaDe(id),
    x: onde.x, y: onde.y, dir: 'baixo',
    rota: [], olhar: null, vel: null, replanos: 0, aoChegar: null, andando: false,
    cheio: 0, goles: 0, ultimo: null, quedas: 0,
    acao: null, caido: 0, vaiCair: 0, hic: 2 + (id % 3), jogando: null, alvoVisto: null,
    chapeu: false, boca: false, pulo: false, bracos: false,
  };
}

const mesmaRoupa = (a: Roupa | null, b: Roupa | null) => a === b || (!!a && !!b && a.tema === b.tema && a.lado === b.lado);

export class Garagem {
  readonly bonecos = new Map<number, Boneco>();
  readonly euId: number;
  private readonly meu: Boneco;
  podeCantar = false;
  temas: [Tema, Tema] = ['moto', 'moto'];
  /** O que o dono preparou (só chega para ele). */
  preparo: Aniversariante[] = [];
  parabensInicio: number | null = null;
  /** De quem é a festa que está acontecendo: só se sabe quando ela começa. */
  aniversariantes: Aniversariante[] = [];
  recordes: Recorde[] = [];
  /** O relógio do servidor menos o daqui, da última leitura. */
  diferenca = 0;
  festa: FaseDaFesta = null;
  velas = true;
  /** Segundos desde que a SUA tela começou a apagar; −1 quando ela está acesa. */
  apagao = -1;
  /** Mudou para onde o seu boneco vai: a tela manda a posição já, sem esperar a volta seguinte. */
  mudouMeuAlvo = false;
  ocorrencias: Ocorrencia[] = [];
  private ultimoAgora = 0;
  /** O sorteio do que se pega no balcão: trocável no teste. */
  sortear: (n: number) => number = (n) => Math.floor(Math.random() * n);

  /** Sem `onde`, chega pela porta — cada conta num ponto dela, senão dois entrando juntos ficam com o nome um em cima do outro. */
  constructor(euId: number, nome: string, onde: Ponto = { x: PORTA.x + (euId * 37 % 61) - 30, y: PORTA.y }) {
    this.euId = euId;
    this.meu = novoBoneco(euId, nome, onde);
    this.bonecos.set(euId, this.meu);
  }

  get eu(): Boneco { return this.meu; }
  /** Juntando ou cantando: quem anda os bonecos é a festa, de todo mundo, em toda tela. */
  get festaAndando() { return this.festa?.fase === 'reunindo' || this.festa?.fase === 'cantando'; }
  get mesaNaTela() { return this.festa !== null; }
  /** Depois do canto, com a mesa ainda montada: dá para comer o bolo. */
  get boloServido() { return this.festa?.fase === 'montada'; }
  obstaculos() { return obstaculosDa(this.mesaNaTela); }
  /** Quem está jogando em cada fliperama (o id), ou ninguém. */
  noFliperama(qual: number): number | null {
    for (const b of this.bonecos.values()) if (b.jogando === qual) return b.id;
    return null;
  }

  /** O seu boneco do jeito que o servidor guarda. */
  meuBoneco(): BonecoNoServidor {
    const b = this.eu;
    const fim = b.rota[b.rota.length - 1];
    return {
      x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10,
      alvo: fim ? { x: Math.round(fim.x * 10) / 10, y: Math.round(fim.y * 10) / 10 } : null,
      dir: b.dir, cheio: b.cheio, goles: b.goles, ultimo: b.ultimo, quedas: b.quedas, jogando: b.jogando,
    };
  }

  /**
   * A leitura do servidor. Resposta mais velha que a última aplicada não entra (a regra das mesas).
   * Do seu boneco vem só o nome — onde ele está é você quem sabe; dos outros, a posição vira
   * caminho, o gole vira gole e a queda vira queda, cada um uma vez só.
   */
  receber(l: LeituraDaGaragem, agoraLocal = Date.now()) {
    if (l.agora < this.ultimoAgora) return;
    this.ultimoAgora = l.agora;
    this.diferenca = l.agora - agoraLocal;
    this.podeCantar = l.podeCantar;
    if (l.temas && eTema(l.temas[0]) && eTema(l.temas[1])) this.temas = [l.temas[0], l.temas[1]];
    this.preparo = l.preparo ?? [];
    this.parabensInicio = l.parabens?.inicio ?? null;
    if (l.parabens?.aniversariantes) this.aniversariantes = l.parabens.aniversariantes;
    if (l.recordes) this.recordes = l.recordes;
    const vistos = new Set<number>([this.euId]);
    for (const p of l.pessoas) {
      vistos.add(p.id);
      if (p.id === this.euId) { this.meu.nome = p.nome; continue; }
      let b = this.bonecos.get(p.id);
      if (b) b.nome = p.nome;
      const ultimo = comidaDe(p.ultimo);
      if (!b) {
        // Chegou agora: aparece onde está, com a história dele, sem tocar os goles de antes.
        b = novoBoneco(p.id, p.nome, { x: p.x, y: p.y });
        Object.assign(b, { dir: p.dir, cheio: p.cheio, goles: p.goles, ultimo, quedas: p.quedas, jogando: p.jogando ?? null });
        this.bonecos.set(p.id, b);
        if (p.alvo && !this.festaAndando) this.ir(b, p.alvo);
        continue;
      }
      b.cheio = p.cheio;
      b.jogando = this.festaAndando ? null : p.jogando ?? null;
      if (p.quedas > b.quedas) { b.quedas = p.quedas; this.cair(b); }
      if (p.goles > b.goles) {
        b.goles = p.goles; b.ultimo = ultimo;
        if (b.caido <= 0) this.consumiu(b, ultimo ?? 'cerveja');
      }
      if (this.festaAndando || b.caido > 0) continue;
      const longe = Math.hypot(b.x - p.x, b.y - p.y);
      if (longe > TELETRANSPORTE) { b.x = p.x; b.y = p.y; b.rota = []; b.alvoVisto = null; }
      const chave = p.alvo ? `${Math.round(p.alvo.x)},${Math.round(p.alvo.y)}` : null;
      if (chave !== b.alvoVisto) {
        b.alvoVisto = chave;
        if (p.alvo) this.ir(b, p.alvo); else if (longe > 2) this.ir(b, { x: p.x, y: p.y }); else b.rota = [];
      } else if (!p.alvo && !b.rota.length && longe > 2) this.ir(b, { x: p.x, y: p.y });
      if (!b.rota.length) b.dir = p.dir;
    }
    for (const id of [...this.bonecos.keys()]) if (!vistos.has(id)) this.bonecos.delete(id);
  }

  // --- o que o SEU boneco faz -------------------------------------------------------------

  private podeMexer() { return !this.festaAndando && this.eu.caido <= 0 && this.eu.vaiCair <= 0; }

  /**
   * Clicou na garagem: num balcão, vai pegar; num fliperama, vai jogar; na mesa, depois do canto,
   * pega um pedaço do bolo; no chão, anda. Devolve o que o clique virou, para a tela saber.
   */
  clicar(q: Ponto): 'balcao' | 'fliperama' | 'andar' | null {
    if (!this.podeMexer()) return null;
    if (this.eu.jogando !== null) this.sairDoFliperama();
    const balcao = BALCOES.find((k) => naCaixa(q, k));
    if (balcao) { this.irPegar(this.eu, balcao.para, () => balcao.itens[this.sortear(balcao.itens.length)]); return 'balcao'; }
    if (this.boloServido && naCaixa(q, PEDACO_DE_BOLO)) { this.irPegar(this.eu, PEDACO_DE_BOLO.para, () => 'bolo'); return 'balcao'; }
    const qual = FLIPERAMAS.findIndex((k) => naCaixa(q, k));
    if (qual >= 0) { this.irJogar(qual); return 'fliperama'; }
    this.ir(this.eu, q);
    this.mudouMeuAlvo = true;
    return 'andar';
  }

  /** Setas ou WASD: um passinho por quadro na direção apertada. */
  andarComTeclas(vx: number, vy: number) {
    if (!this.podeMexer() || (!vx && !vy) || this.eu.jogando !== null) return;
    const n = Math.hypot(vx, vy);
    this.ir(this.eu, { x: this.eu.x + vx / n * 6, y: this.eu.y + vy / n * 6 });
    this.mudouMeuAlvo = true;
  }

  private irPegar(b: Boneco, para: Ponto, oQue: () => Comida) {
    const perto = Math.abs(b.x - para.x) <= 16 && b.y >= para.y - 2 && b.y <= para.y + 10;
    if (perto) { this.pegar(b, oQue()); return; }
    // Cada um para num dos quatro pontos em volta, em duas fileiras: na bancada, três no mesmo isopor
    // ficavam com os nomes um em cima do outro.
    const vaga = b.id % 4;
    const ponto = { x: para.x + (vaga % 2 ? 14 : -14), y: para.y + (vaga < 2 ? 0 : 8) };
    this.ir(b, ponto, 'cima', () => this.pegar(b, oQue()));
    this.mudouMeuAlvo = true;
  }

  private pegar(b: Boneco, comida: Comida) {
    if (b.caido > 0 || b.vaiCair > 0 || (b.acao && b.acao.t < 0.9)) return;
    b.cheio = Math.max(0, b.cheio + COMIDAS[comida].barriga);
    b.goles += 1; b.ultimo = comida;
    this.consumiu(b, comida);
    if (b.cheio >= LIMITE_DA_BARRIGA) b.vaiCair = ATE_CAIR;
    this.mudouMeuAlvo = true;
  }

  private consumiu(b: Boneco, comida: Comida) {
    b.dir = 'baixo';
    b.acao = { comida, t: 0 };
    this.ocorrencias.push({ tipo: 'consumo', comida, id: b.id, meu: b.id === this.euId, x: b.x, y: b.y });
  }

  private cair(b: Boneco) {
    b.caido = CAIDO; b.rota = []; b.acao = null; b.aoChegar = null; b.vaiCair = 0;
    const meu = b.id === this.euId;
    if (meu) {
      if (b.jogando !== null) this.sairDoFliperama();
      b.cheio = 0; b.quedas += 1; this.apagao = 0; this.mudouMeuAlvo = true;
    }
    this.ocorrencias.push({ tipo: 'desmaio', id: b.id, meu });
  }

  // --- o fliperama --------------------------------------------------------------------------

  /** Vai até o fliperama e, chegando, começa a jogar — se ninguém chegou antes. */
  private irJogar(qual: number) {
    const k = FLIPERAMAS[qual];
    const comecar = () => {
      const quem = this.noFliperama(qual);
      if (quem !== null && quem !== this.euId) { this.ocorrencias.push({ tipo: 'ocupado', x: k.para.x, y: k.para.y - 28 }); return; }
      this.eu.jogando = qual;
      this.eu.dir = 'cima';
      this.mudouMeuAlvo = true;
      this.ocorrencias.push({ tipo: 'fliperama', qual });
    };
    const perto = Math.abs(this.eu.x - k.para.x) <= 3 && Math.abs(this.eu.y - k.para.y) <= 3;
    if (perto) comecar();
    else { this.ir(this.eu, k.para, 'cima', comecar); this.mudouMeuAlvo = true; }
  }

  /** Largou o fliperama (Esc, clicou fora, desmaiou ou a festa começou). */
  sairDoFliperama() {
    if (this.eu.jogando === null) return;
    this.eu.jogando = null;
    this.mudouMeuAlvo = true;
    this.ocorrencias.push({ tipo: 'fliperama', qual: null });
  }

  // --- andar --------------------------------------------------------------------------------

  private ir(b: Boneco, alvo: Ponto, olhar: Direcao | null = null, aoChegar: (() => void) | null = null) {
    const fim = soltar(alvo, this.obstaculos());
    b.rota = planejar(b, fim, this.obstaculos());
    b.olhar = olhar; b.replanos = 0; b.aoChegar = aoChegar;
  }

  private andar(b: Boneco, dt: number) {
    if (b.caido > 0 || !b.rota.length) { b.andando = false; return; }
    const alvo = b.rota[0];
    const dx = alvo.x - b.x, dy = alvo.y - b.y, d = Math.hypot(dx, dy);
    if (d < 0.8) {
      b.x = alvo.x; b.y = alvo.y; b.rota.shift();
      if (!b.rota.length) {
        b.andando = false;
        if (b.olhar) b.dir = b.olhar;
        const f = b.aoChegar; b.aoChegar = null; f?.();
      }
      return;
    }
    const v = Math.min(d, (b.vel ?? VELOCIDADE) * dt);
    let nx = b.x + dx / d * v, ny = b.y + dy / d * v;
    const obst = this.obstaculos();
    if (bloqueado(nx, ny, obst)) {
      if (!bloqueado(nx, b.y, obst)) ny = b.y;
      else if (!bloqueado(b.x, ny, obst)) nx = b.x;
      else {
        const fim = b.rota[b.rota.length - 1];
        if (++b.replanos > 3) { b.rota = []; b.andando = false; return; }
        b.rota = planejar(b, fim, obst);
        return;
      }
    }
    b.x = nx; b.y = ny; b.andando = true;
    b.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'dir' : 'esq') : (dy > 0 ? 'baixo' : 'cima');
  }

  // --- a festa ------------------------------------------------------------------------------

  /** Leva todo mundo ao seu lugar a tempo da luz apagar — com a velocidade que dá, igual em toda tela. */
  private reunir(faltam: number) {
    const lugares = lugaresDaFesta([...this.bonecos.values()], this.aniversariantes);
    for (const b of this.bonecos.values()) {
      const l = lugares.get(b.id);
      if (!l) continue;
      b.caido = 0; b.vaiCair = 0; b.acao = null; b.aoChegar = null; b.jogando = null;
      this.ir(b, l.ponto, l.olhar);
      b.vel = Math.max(VELOCIDADE, comprimento(b, b.rota) / Math.max(0.5, faltam - 0.3));
    }
  }

  /** Quem chegou atrasado (ou entrou na garagem com a música tocando) aparece no lugar. */
  private noLugar() {
    const lugares = lugaresDaFesta([...this.bonecos.values()], this.aniversariantes);
    for (const b of this.bonecos.values()) {
      const l = lugares.get(b.id);
      if (!l) continue;
      b.x = l.ponto.x; b.y = l.ponto.y; b.dir = l.olhar; b.rota = []; b.vel = null; b.andando = false;
    }
  }

  /** A roupa de festa de cada um: só quem faz aniversário, e só com a mesa na tela. */
  roupaDe(id: number): Roupa | null {
    if (!this.mesaNaTela) return null;
    const i = this.aniversariantes.findIndex((a) => a.id === id);
    return i < 0 ? null : { tema: this.aniversariantes[i].tema, lado: i as Lado };
  }

  // --- o passo ------------------------------------------------------------------------------

  passo(dt: number, agoraLocal = Date.now()) {
    const decorrido = this.parabensInicio === null ? null : (agoraLocal + this.diferenca - this.parabensInicio) / 1000;
    const antes = this.festa;
    const agora = faseDaFesta(decorrido);
    this.festa = agora;

    if (agora && !antes) {
      this.velas = true;
      this.ocorrencias.push({ tipo: 'mesa' });
      if (this.eu.jogando !== null) this.sairDoFliperama();
      if (agora.fase === 'reunindo') this.reunir(REUNIR - agora.t);
    }
    if (agora?.fase === 'cantando' && antes?.fase !== 'cantando') {
      this.noLugar();
      this.ocorrencias.push({ tipo: 'canto', aPartirDe: agora.t });
    }
    if (antes?.fase === 'cantando' && agora?.fase !== 'cantando') this.ocorrencias.push({ tipo: 'fimDoCanto' });
    if (!agora && antes) this.velas = true;

    const cantando = agora?.fase === 'cantando' ? agora.t : null;
    const tocando = cantando === null ? undefined : ROTEIRO.notas.find((n) => cantando >= n.t && cantando < n.t + n.dur);
    const palma = cantando !== null && ROTEIRO.palmas.some((k) => cantando >= k && cantando < k + 0.12);
    const depois = cantando !== null && cantando >= ROTEIRO.ratimbum;
    const festeiros = new Set(this.aniversariantes.map((a) => a.id));
    if (cantando !== null) {
      if (depois && this.velas) { this.velas = false; this.ocorrencias.push({ tipo: 'ratimbum' }); }
      const quem = [...this.bonecos.values()].filter((b) => !festeiros.has(b.id));
      for (const n of ROTEIRO.notas) {
        if (n.t > cantando - dt && n.t <= cantando && quem.length) {
          const b = quem[Math.floor(Math.random() * quem.length)];
          this.ocorrencias.push({ tipo: 'nota', x: b.x, y: b.y });
        }
      }
    }

    for (const b of this.bonecos.values()) {
      const roupa = this.roupaDe(b.id);
      if (!mesmaRoupa(roupa, b.aparencia.roupa)) b.aparencia = aparenciaDe(b.id, roupa);
      b.chapeu = this.festaAndando;
      b.boca = !!tocando || palma || (depois && cantando! < ROTEIRO.ratimbum + 3.7);
      b.pulo = (!!tocando && cantando! - tocando.t < 0.14) || palma;
      b.bracos = depois && cantando! < ROTEIRO.fim - 1;
      if (!this.festaAndando) b.vel = null;

      this.andar(b, dt);
      if (b.acao) { b.acao.t += dt; if (b.acao.t > 1) b.acao = null; }
      if (b.vaiCair > 0) { b.vaiCair -= dt; if (b.vaiCair <= 0) { b.vaiCair = 0; if (b.id === this.euId) this.cair(b); } }
      if (b.caido > 0) b.caido = Math.max(0, b.caido - dt);
      if (b.cheio >= TONTO && b.caido <= 0 && !this.festaAndando) {
        b.hic -= dt;
        if (b.hic <= 0) {
          b.hic = 2.5 + Math.random() * 3;
          this.ocorrencias.push({ tipo: 'soluco', id: b.id, meu: b.id === this.euId, x: b.x, y: b.y });
        }
      }
    }
    if (this.apagao >= 0) { this.apagao += dt; if (this.apagao > APAGAO + 0.4) this.apagao = -1; }
  }

  /** Esvazia o que aconteceu desde a última vez. */
  colher(): Ocorrencia[] {
    const o = this.ocorrencias;
    this.ocorrencias = [];
    return o;
  }
}
