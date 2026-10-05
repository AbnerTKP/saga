// O Catan: o tabuleiro, as regras e o que cada um enxerga. Puro como o `xadrez.mjs` — sem SQL,
// sem HTTP e sem saber quem são as pessoas: aqui um jogador é a posição dele na mesa (0 a 3), e
// quem traduz posição em conta é `catans.mjs`.
//
// A regra mora TODA aqui, e o app só desenha: os dados rolam neste processo, o baralho de
// desenvolvimento é embaralhado aqui, o roubo é sorteado aqui, e cada leitura (`vista`) já traz
// o que quem pergunta pode fazer agora — onde cabe uma aldeia, que estrada vale, a taxa do banco.
// Duas cópias da regra discordariam na primeira estrada cortada, e quem perderia a maior estrada
// seria quem confiou na tela.
//
// O sorteio é injetado (`sorteio()`, um número em [0, 1)), para o teste jogar partidas inteiras
// com dados decididos de antemão. A hora também (`agora`, em ms): o relógio da vez é um INSTANTE
// guardado na partida, e quem o vence é a próxima leitura ou ação — não há timer esperando
// ninguém, o mesmo acordo do relógio do xadrez.

export class ErroDeJogo extends Error {}

export const RECURSOS = ['madeira', 'tijolo', 'la', 'trigo', 'minerio'];
export const CORES = ['vermelho', 'azul', 'laranja', 'branco'];
export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 4;
export const PONTOS_PARA_VENCER = 10;
/** Quem tem mais que isto quando sai 7 devolve metade. */
export const LIMITE_DA_MAO = 7;
/** O tempo de cada vez, em segundos, que o anfitrião escolhe antes de começar (decisão do dono, 04/10/2026). */
export const TEMPOS_DA_VEZ = [30, 60];
/** Quanto uma oferta de troca espera resposta: passou disso, quem não respondeu recusou. */
export const PRAZO_DA_TROCA = 15_000;
/**
 * Quantos prazos uma leitura vence de uma vez, no máximo. Com a Saga aberta alguém pergunta pela
 * mesa a cada segundo e vence um prazo por vez; a cascata é de quando ninguém perguntou por um
 * tempo, e o limite é para um defeito virar uma partida parada em vez de um servidor pendurado.
 */
const PRAZOS_POR_LEITURA = 1000;

const PRODUZ = { floresta: 'madeira', colina: 'tijolo', pasto: 'la', campo: 'trigo', montanha: 'minerio', deserto: null };
const TERRENOS = [
  ...Array(4).fill('floresta'), ...Array(4).fill('pasto'), ...Array(4).fill('campo'),
  ...Array(3).fill('colina'), ...Array(3).fill('montanha'), 'deserto',
];
const FICHAS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const PORTOS = ['3:1', '3:1', '3:1', '3:1', 'madeira', 'tijolo', 'la', 'trigo', 'minerio'];
/** O baralho de desenvolvimento do jogo base. */
const BARALHO = [
  ...Array(14).fill('cavaleiro'), ...Array(5).fill('ponto'),
  ...Array(2).fill('estradas'), ...Array(2).fill('fartura'), ...Array(2).fill('monopolio'),
];
export const CUSTOS = {
  estrada: { madeira: 1, tijolo: 1 },
  aldeia: { madeira: 1, tijolo: 1, la: 1, trigo: 1 },
  cidade: { trigo: 2, minerio: 3 },
  desenvolvimento: { la: 1, trigo: 1, minerio: 1 },
};
const PECAS = { estrada: 15, aldeia: 5, cidade: 4 };

// ---------------------------------------------------------------------------------------------
// A geometria. Hexágonos de ponta para cima em coordenadas axiais (q, r), raio 2: 19 terrenos.
//
// Os cruzamentos e as arestas se chamam pela POSIÇÃO: o cruzamento é "x,y" numa grade inteira
// (x em meias-larguras de hexágono, y em meios-raios), e a aresta é o par dos seus dois
// cruzamentos. Assim o app desenha qualquer peça sabendo só o nome dela — não há tabela de
// posições viajando junto, nem uma geometria copiada do lado de lá.
// ---------------------------------------------------------------------------------------------

/** Os seis cantos, de −30° em sentido horário (y cresce para baixo), na grade inteira. */
const CANTOS = [[1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2]];
/** Os vizinhos na mesma ordem das arestas: a aresta i liga o canto i ao canto i+1. */
const VIZINHOS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

export const chaveDoHex = (q, r) => `${q},${r}`;
const cruzamento = (q, r, i) => `${2 * q + r + CANTOS[i][0]},${3 * r + CANTOS[i][1]}`;
const aresta = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** As posições dos terrenos, em linhas de cima para baixo: 3, 4, 5, 4, 3. */
export const POSICOES = [];
for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) if (Math.abs(q + r) <= 2) POSICOES.push([q, r]);

/**
 * Onde ficam os nove portos: [q, r, aresta do hexágono que dá para o mar]. Espaçados em volta da
 * ilha como no tabuleiro impresso; o que SAI em cada um é sorteado.
 */
const LUGARES_DOS_PORTOS = [[0, -2, 4], [1, -2, 5], [2, -1, 0], [1, 1, 0], [0, 2, 1], [-1, 2, 2], [-2, 2, 3], [-2, 0, 3], [-1, -1, 4]];

function montarGeometria() {
  const cruzamentos = new Map();   // v -> { hexes, vizinhos, arestas }
  const arestas = new Map();       // a -> [v, v]
  const cantosDoHex = new Map();   // hex -> [v × 6]
  const vizinhosDoHex = new Map(); // hex -> [hex]
  const pegar = (v) => {
    if (!cruzamentos.has(v)) cruzamentos.set(v, { hexes: [], vizinhos: new Set(), arestas: [] });
    return cruzamentos.get(v);
  };
  const existe = new Set(POSICOES.map(([q, r]) => chaveDoHex(q, r)));
  for (const [q, r] of POSICOES) {
    const h = chaveDoHex(q, r);
    const vs = [0, 1, 2, 3, 4, 5].map((i) => cruzamento(q, r, i));
    cantosDoHex.set(h, vs);
    vizinhosDoHex.set(h, VIZINHOS.map(([dq, dr]) => chaveDoHex(q + dq, r + dr)).filter((k) => existe.has(k)));
    vs.forEach((v, i) => {
      pegar(v).hexes.push(h);
      const w = vs[(i + 1) % 6];
      const a = aresta(v, w);
      if (!arestas.has(a)) {
        arestas.set(a, v < w ? [v, w] : [w, v]);
        pegar(v).vizinhos.add(w); pegar(w).vizinhos.add(v);
        pegar(v).arestas.push(a); pegar(w).arestas.push(a);
      }
    });
  }
  const portos = LUGARES_DOS_PORTOS.map(([q, r, i]) => [cruzamento(q, r, i), cruzamento(q, r, (i + 1) % 6)]);
  return { cruzamentos, arestas, cantosDoHex, vizinhosDoHex, portos };
}
export const GEOMETRIA = montarGeometria();
const G = GEOMETRIA;

// ---------------------------------------------------------------------------------------------
// O sorteio do tabuleiro.
// ---------------------------------------------------------------------------------------------

function embaralhar(lista, sorteio) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(sorteio() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Um tabuleiro novo: terrenos, números e portos embaralhados — com 6 e 8 nunca vizinhos, como
 * se faz à mesa, porque dois números vermelhos juntos decidem a partida na colocação.
 */
export function sortearTabuleiro(sorteio = Math.random) {
  // Um sorteio de verdade acha um tabuleiro bom em poucas voltas; o limite é para um sorteio
  // viciado (o de um teste, por exemplo) dar erro em vez de pendurar o servidor.
  for (let tentativa = 0; tentativa < 10_000; tentativa++) {
    const terrenos = embaralhar(TERRENOS, sorteio);
    const fichas = embaralhar(FICHAS, sorteio);
    const hexes = [];
    let k = 0;
    POSICOES.forEach(([q, r], i) => {
      const terreno = terrenos[i];
      hexes.push({ q, r, terreno, numero: terreno === 'deserto' ? null : fichas[k++] });
    });
    const porChave = new Map(hexes.map((h) => [chaveDoHex(h.q, h.r), h]));
    const vermelho = (h) => h.numero === 6 || h.numero === 8;
    const juntos = hexes.some((h) => vermelho(h)
      && G.vizinhosDoHex.get(chaveDoHex(h.q, h.r)).some((k2) => vermelho(porChave.get(k2))));
    if (juntos) continue;
    const tipos = embaralhar(PORTOS, sorteio);
    return { hexes, portos: G.portos.map((vs, i) => ({ tipo: tipos[i], cruzamentos: vs })) };
  }
  throw new Error('O sorteio não achou um tabuleiro sem 6 e 8 vizinhos.');
}

// ---------------------------------------------------------------------------------------------
// A partida.
// ---------------------------------------------------------------------------------------------

const vazia = () => Object.fromEntries(RECURSOS.map((r) => [r, 0]));
const soma = (m) => RECURSOS.reduce((s, r) => s + (m[r] ?? 0), 0);
const temTudo = (mao, custo) => Object.entries(custo).every(([r, n]) => mao[r] >= n);
function mover(de, para, custo) {
  for (const [r, n] of Object.entries(custo)) { de[r] -= n; para[r] += n; }
}

/**
 * Uma partida nova para `n` jogadores. A ordem já é a da mesa: quem chama embaralha os lugares
 * antes, se quiser — aqui o jogador 0 começa. Com `segundos` (30 ou 60), a vez tem relógio, e ele
 * começa a correr em `agora`; sem, a partida espera quem estiver na vez.
 */
export function novaPartida(n, { sorteio = Math.random, tabuleiro = sortearTabuleiro(sorteio), segundos = null, agora } = {}) {
  if (!Number.isInteger(n) || n < MIN_JOGADORES || n > MAX_JOGADORES) throw new ErroDeJogo(`O Catan é de ${MIN_JOGADORES} a ${MAX_JOGADORES} jogadores.`);
  const deserto = tabuleiro.hexes.find((h) => h.terreno === 'deserto');
  const ordem = [...Array(n).keys()];
  const p = {
    hexes: tabuleiro.hexes,
    portos: tabuleiro.portos,
    ladrao: chaveDoHex(deserto.q, deserto.r),
    jogadores: ordem.map((j) => ({
      cor: CORES[j], mao: vazia(), cartas: [], cavaleiros: 0,
      pecas: { ...PECAS }, fora: false,
    })),
    construcoes: {},   // cruzamento -> { j, tipo }
    estradas: {},      // aresta -> j
    banco: Object.fromEntries(RECURSOS.map((r) => [r, 19])),
    baralho: embaralhar(BARALHO, sorteio),
    fase: 'inicio',
    vez: 0,
    turno: 0,
    rodada: 0,
    // O começo: ida e volta, e em cada passo uma aldeia e depois a estrada que encosta nela.
    inicio: { ordem: [...ordem, ...[...ordem].reverse()], passo: 0, falta: 'aldeia', aldeia: null },
    dados: null,
    rolagens: 0,
    contagem: Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((k) => [k, 0])),
    descartes: {},
    depoisDoLadrao: 'acoes',
    estradasGratis: 0,
    desenvolvimentoNoTurno: false,
    oferta: null,
    maiorEstrada: null,   // { j, tamanho }
    maiorExercito: null,  // { j, tamanho }
    historico: [],
    vencedor: null,
    relogio: null,
  };
  if (segundos !== null) ligarRelogio(p, segundos, agora);
  return p;
}

const anotar =(p, e) => { p.historico.push({ ...e, rodada: p.rodada }); if (p.historico.length > 200) p.historico.shift(); };
const ativos = (p) => p.jogadores.map((_, j) => j).filter((j) => !p.jogadores[j].fora);

// --- o que vale onde ---

function podeAldeia(p, j, v, noInicio) {
  const c = G.cruzamentos.get(v);
  if (!c || p.construcoes[v]) return false;
  for (const w of c.vizinhos) if (p.construcoes[w]) return false;
  return noInicio || c.arestas.some((a) => p.estradas[a] === j);
}

function podeEstrada(p, j, a) {
  const vs = G.arestas.get(a);
  if (!vs || p.estradas[a] !== undefined) return false;
  if (p.fase === 'inicio') return vs.includes(p.inicio.aldeia);
  return vs.some((v) => {
    const casa = p.construcoes[v];
    if (casa?.j === j) return true;
    // Aldeia de outro no cruzamento corta a passagem: a estrada não continua por cima dela.
    if (casa) return false;
    return G.cruzamentos.get(v).arestas.some((b) => b !== a && p.estradas[b] === j);
  });
}

function lugaresDeAldeia(p, j) {
  const noInicio = p.fase === 'inicio';
  return [...G.cruzamentos.keys()].filter((v) => podeAldeia(p, j, v, noInicio));
}
const lugaresDeEstrada = (p, j) => [...G.arestas.keys()].filter((a) => podeEstrada(p, j, a));
const lugaresDeCidade = (p, j) => Object.entries(p.construcoes).filter(([, c]) => c.j === j && c.tipo === 'aldeia').map(([v]) => v);

/** A taxa de cada recurso no banco para o jogador: 4, 3 com um porto 3:1, 2 com o porto dele. */
export function taxas(p, j) {
  const t = Object.fromEntries(RECURSOS.map((r) => [r, 4]));
  for (const porto of p.portos) {
    if (!porto.cruzamentos.some((v) => p.construcoes[v]?.j === j)) continue;
    if (porto.tipo === '3:1') for (const r of RECURSOS) t[r] = Math.min(t[r], 3);
    else t[porto.tipo] = 2;
  }
  return t;
}

/** Quem pode ser roubado ao pôr o ladrão em `hex`: tem casa encostada e alguma carta na mão. */
function vitimasEm(p, hex, ladrao) {
  const quem = new Set();
  for (const v of G.cantosDoHex.get(hex) ?? []) {
    const c = p.construcoes[v];
    if (c && c.j !== ladrao && !p.jogadores[c.j].fora && soma(p.jogadores[c.j].mao) > 0) quem.add(c.j);
  }
  return [...quem].sort();
}

/**
 * A estrada mais comprida de alguém: o maior caminho sem repetir trecho. Uma casa de OUTRO
 * jogador no meio corta o caminho — é assim que se rouba a maior estrada de alguém.
 */
export function tamanhoDaEstrada(p, j) {
  const minhas = Object.keys(p.estradas).filter((a) => p.estradas[a] === j);
  if (!minhas.length) return 0;
  let melhor = 0;
  const usadas = new Set();
  const andar = (v, n) => {
    if (n > melhor) melhor = n;
    const casa = p.construcoes[v];
    if (n > 0 && casa && casa.j !== j) return;
    for (const a of G.cruzamentos.get(v).arestas) {
      if (p.estradas[a] !== j || usadas.has(a)) continue;
      usadas.add(a);
      const [x, y] = G.arestas.get(a);
      andar(x === v ? y : x, n + 1);
      usadas.delete(a);
    }
  };
  const pontas = new Set(minhas.flatMap((a) => G.arestas.get(a)));
  for (const v of pontas) andar(v, 0);
  return melhor;
}

/**
 * Quem fica com a maior estrada. Quem tem continua tendo enquanto ninguém passar dele; se for
 * cortado e ficar para trás, ela vai para quem tiver a maior — e, empatados os de cima, para
 * ninguém, como manda o manual.
 */
function recalcularMaiorEstrada(p) {
  const tam = p.jogadores.map((jog, j) => (jog.fora ? 0 : tamanhoDaEstrada(p, j)));
  const atual = p.maiorEstrada?.j ?? null;
  const antes = atual;
  if (atual !== null && tam[atual] >= 5 && tam.every((t, j) => j === atual || t <= tam[atual])) {
    p.maiorEstrada = { j: atual, tamanho: tam[atual] };
  } else {
    const max = Math.max(...tam);
    const donos = tam.map((t, j) => (t === max ? j : -1)).filter((j) => j >= 0);
    p.maiorEstrada = max >= 5 && donos.length === 1 ? { j: donos[0], tamanho: max } : null;
  }
  const depois = p.maiorEstrada?.j ?? null;
  if (depois !== antes) anotar(p, { t: 'maiorEstrada', j: depois, de: antes });
}

function recalcularMaiorExercito(p, j) {
  const n = p.jogadores[j].cavaleiros;
  if (n < 3) return;
  if (p.maiorExercito && (p.maiorExercito.j === j || p.maiorExercito.tamanho >= n)) {
    if (p.maiorExercito.j === j) p.maiorExercito.tamanho = n;
    return;
  }
  anotar(p, { t: 'maiorExercito', j, de: p.maiorExercito?.j ?? null });
  p.maiorExercito = { j, tamanho: n };
}

/** Os pontos que todo mundo vê. As cartas de ponto só entram em `pontos(p, j, true)`. */
export function pontos(p, j, comEscondidos = false) {
  let n = 0;
  for (const c of Object.values(p.construcoes)) if (c.j === j) n += c.tipo === 'cidade' ? 2 : 1;
  if (p.maiorEstrada?.j === j) n += 2;
  if (p.maiorExercito?.j === j) n += 2;
  if (comEscondidos) n += p.jogadores[j].cartas.filter((c) => c.tipo === 'ponto').length;
  return n;
}

/** Vence quem chega a 10 NA PRÓPRIA VEZ — contando as cartas de ponto que ninguém via. */
function conferirVitoria(p) {
  if (p.fase === 'fim' || p.fase === 'inicio') return;
  if (pontos(p, p.vez, true) >= PONTOS_PARA_VENCER) {
    p.fase = 'fim';
    p.vencedor = p.vez;
    p.oferta = null;
    anotar(p, { t: 'venceu', j: p.vez });
  }
}

/** O próximo passo do começo — pulando quem saiu —, ou o primeiro turno de verdade. */
function avancarInicio(p) {
  const { ordem } = p.inicio;
  p.inicio.falta = 'aldeia';
  p.inicio.aldeia = null;
  while (p.inicio.passo < ordem.length && p.jogadores[ordem[p.inicio.passo]].fora) p.inicio.passo++;
  if (p.inicio.passo < ordem.length) {
    p.vez = ordem[p.inicio.passo];
    return;
  }
  p.fase = 'rolar';
  p.vez = ativos(p)[0];
  p.turno = 1;
  p.rodada = 1;
  anotar(p, { t: 'comecou' });
}

function proximaVez(p) {
  const n = p.jogadores.length;
  let j = p.vez;
  do {
    j = (j + 1) % n;
    if (j === 0) p.rodada++;
  } while (p.jogadores[j].fora);
  p.vez = j;
  p.turno++;
  p.fase = 'rolar';
  p.dados = null;
  p.desenvolvimentoNoTurno = false;
  p.oferta = null;
  p.estradasGratis = 0;
  conferirVitoria(p);
}

/** Produção do número que saiu. Banco sem o bastante para todos não paga ninguém daquele recurso. */
function produzir(p, n) {
  const devido = p.jogadores.map(() => vazia());
  for (const h of p.hexes) {
    if (h.numero !== n || chaveDoHex(h.q, h.r) === p.ladrao) continue;
    const r = PRODUZ[h.terreno];
    for (const v of G.cantosDoHex.get(chaveDoHex(h.q, h.r))) {
      const c = p.construcoes[v];
      if (c && !p.jogadores[c.j].fora) devido[c.j][r] += c.tipo === 'cidade' ? 2 : 1;
    }
  }
  const ganhos = {};
  const faltou = [];
  for (const r of RECURSOS) {
    const quem = devido.map((d, j) => (d[r] > 0 ? j : -1)).filter((j) => j >= 0);
    const total = quem.reduce((s, j) => s + devido[j][r], 0);
    if (!total) continue;
    if (total > p.banco[r] && quem.length > 1) { faltou.push(r); continue; }
    for (const j of quem) {
      const k = Math.min(devido[j][r], p.banco[r]);
      if (!k) continue;
      p.banco[r] -= k;
      p.jogadores[j].mao[r] += k;
      (ganhos[j] ??= {})[r] = k;
    }
  }
  anotar(p, { t: 'produziu', numero: n, ganhos, faltou });
}

function exigir(cond, texto) { if (!cond) throw new ErroDeJogo(texto); }
function exigirVez(p, j) { exigir(p.vez === j, 'Não é a sua vez.'); }
function exigirFase(p, ...fases) {
  exigir(fases.includes(p.fase), p.fase === 'fim' ? 'A partida já terminou.' : 'Agora não dá para fazer isso.');
}
function lerRecurso(r) { exigir(RECURSOS.includes(r), 'Recurso desconhecido.'); return r; }
/** `{ madeira: 1, … }` vindo de fora: só recursos, só inteiros de 0 para cima. */
function lerMonte(m) {
  exigir(m && typeof m === 'object', 'Faltou dizer as cartas.');
  const out = vazia();
  for (const [r, n] of Object.entries(m)) {
    lerRecurso(r);
    exigir(Number.isInteger(n) && n >= 0 && n <= 19, 'Quantidade inválida.');
    out[r] = n;
  }
  return out;
}

function pagar(p, j, custo) {
  exigir(temTudo(p.jogadores[j].mao, custo), 'Faltam cartas para isso.');
  mover(p.jogadores[j].mao, p.banco, custo);
}

function podeJogarCarta(p, j, tipo) {
  if (p.vez !== j || p.desenvolvimentoNoTurno || !['rolar', 'acoes'].includes(p.fase)) return false;
  return p.jogadores[j].cartas.some((c) => c.tipo === tipo && c.turno < p.turno);
}
function gastarCarta(p, j, tipo) {
  exigirVez(p, j);
  exigirFase(p, 'rolar', 'acoes');
  exigir(!p.desenvolvimentoNoTurno, 'Só uma carta de desenvolvimento por turno.');
  const cartas = p.jogadores[j].cartas;
  const i = cartas.findIndex((c) => c.tipo === tipo && c.turno < p.turno);
  exigir(i >= 0, cartas.some((c) => c.tipo === tipo) ? 'A carta comprada neste turno só vale no próximo.' : 'Você não tem essa carta.');
  cartas.splice(i, 1);
  p.desenvolvimentoNoTurno = true;
  // Depois da carta, a vez volta ao que era: antes de rolar continua antes de rolar.
  return p.fase;
}

const acoes = {
  aldeia(p, j, { v }) {
    exigirVez(p, j);
    exigirFase(p, 'inicio', 'acoes');
    const jog = p.jogadores[j];
    if (p.fase === 'inicio') {
      exigir(p.inicio.falta === 'aldeia', 'Agora é a estrada.');
      exigir(podeAldeia(p, j, v, true), 'Aldeia não cabe aí: precisa de um cruzamento livre, a dois de qualquer outra.');
    } else {
      exigir(jog.pecas.aldeia > 0, 'Suas cinco aldeias já estão no tabuleiro.');
      exigir(podeAldeia(p, j, v, false), 'Aldeia não cabe aí: precisa encostar numa estrada sua e ficar a dois cruzamentos de qualquer outra.');
      pagar(p, j, CUSTOS.aldeia);
    }
    jog.pecas.aldeia--;
    p.construcoes[v] = { j, tipo: 'aldeia' };
    anotar(p, { t: 'aldeia', j });
    if (p.fase === 'inicio') {
      p.inicio.falta = 'estrada';
      p.inicio.aldeia = v;
      // A SEGUNDA aldeia do começo já rende: uma carta de cada terreno em volta dela.
      if (p.inicio.passo >= p.jogadores.length) {
        const ganhos = vazia();
        for (const h of G.cruzamentos.get(v).hexes) {
          const r = PRODUZ[p.hexes.find((x) => chaveDoHex(x.q, x.r) === h).terreno];
          if (r && p.banco[r] > 0) { p.banco[r]--; jog.mao[r]++; ganhos[r]++; }
        }
        anotar(p, { t: 'recebeu', j, recursos: ganhos });
      }
    }
    // Uma aldeia no meio da estrada de alguém pode cortá-la.
    recalcularMaiorEstrada(p);
    conferirVitoria(p);
  },

  estrada(p, j, { a }) {
    exigirVez(p, j);
    exigirFase(p, 'inicio', 'acoes', 'estradas');
    const jog = p.jogadores[j];
    if (p.fase === 'inicio') exigir(p.inicio.falta === 'estrada', 'Primeiro a aldeia.');
    exigir(jog.pecas.estrada > 0, 'Suas quinze estradas já estão no tabuleiro.');
    exigir(podeEstrada(p, j, a), p.fase === 'inicio' ? 'A estrada sai da aldeia que você acabou de pôr.' : 'A estrada precisa continuar uma estrada, aldeia ou cidade sua.');
    if (p.fase === 'acoes') pagar(p, j, CUSTOS.estrada);
    jog.pecas.estrada--;
    p.estradas[a] = j;
    anotar(p, { t: 'estrada', j, gratis: p.fase === 'estradas' || undefined });
    recalcularMaiorEstrada(p);

    if (p.fase === 'inicio') {
      p.inicio.passo++;
      avancarInicio(p);
      return;
    }
    if (p.fase === 'estradas') {
      p.estradasGratis--;
      if (p.estradasGratis <= 0 || jog.pecas.estrada === 0 || !lugaresDeEstrada(p, j).length) {
        p.estradasGratis = 0;
        p.fase = p.depoisDoLadrao;
      }
    }
    conferirVitoria(p);
  },

  cidade(p, j, { v }) {
    exigirVez(p, j);
    exigirFase(p, 'acoes');
    const jog = p.jogadores[j];
    exigir(p.construcoes[v]?.j === j && p.construcoes[v].tipo === 'aldeia', 'A cidade vai no lugar de uma aldeia sua.');
    exigir(jog.pecas.cidade > 0, 'Suas quatro cidades já estão no tabuleiro.');
    pagar(p, j, CUSTOS.cidade);
    jog.pecas.cidade--;
    jog.pecas.aldeia++;
    p.construcoes[v] = { j, tipo: 'cidade' };
    anotar(p, { t: 'cidade', j });
    conferirVitoria(p);
  },

  comprar(p, j) {
    exigirVez(p, j);
    exigirFase(p, 'acoes');
    exigir(p.baralho.length > 0, 'As cartas de desenvolvimento acabaram.');
    pagar(p, j, CUSTOS.desenvolvimento);
    const tipo = p.baralho.pop();
    p.jogadores[j].cartas.push({ tipo, turno: p.turno });
    anotar(p, { t: 'comprou', j, carta: tipo });
    conferirVitoria(p);
  },

  rolar(p, j, _dados, sorteio) {
    exigirVez(p, j);
    exigirFase(p, 'rolar');
    const d = [1 + Math.floor(sorteio() * 6), 1 + Math.floor(sorteio() * 6)];
    const n = d[0] + d[1];
    p.dados = d;
    p.rolagens++;
    p.contagem[n]++;
    anotar(p, { t: 'rolou', j, dados: d });
    if (n !== 7) {
      produzir(p, n);
      p.fase = 'acoes';
      return;
    }
    p.descartes = {};
    for (const k of ativos(p)) {
      const total = soma(p.jogadores[k].mao);
      if (total > LIMITE_DA_MAO) p.descartes[k] = Math.floor(total / 2);
    }
    p.depoisDoLadrao = 'acoes';
    p.fase = Object.keys(p.descartes).length ? 'descartar' : 'ladrao';
  },

  descartar(p, j, { recursos }) {
    exigirFase(p, 'descartar');
    const devido = p.descartes[j];
    exigir(devido, 'Você não precisa descartar.');
    const monte = lerMonte(recursos);
    exigir(soma(monte) === devido, `Escolha exatamente ${devido} ${devido === 1 ? 'carta' : 'cartas'}.`);
    exigir(temTudo(p.jogadores[j].mao, monte), 'Você não tem essas cartas.');
    mover(p.jogadores[j].mao, p.banco, monte);
    delete p.descartes[j];
    anotar(p, { t: 'descartou', j, quantas: devido });
    if (!Object.keys(p.descartes).length) p.fase = 'ladrao';
  },

  ladrao(p, j, { hex, vitima }, sorteio) {
    exigirVez(p, j);
    exigirFase(p, 'ladrao');
    exigir(G.cantosDoHex.has(hex), 'Esse terreno não existe.');
    exigir(hex !== p.ladrao, 'O ladrão precisa mudar de lugar.');
    const podem = vitimasEm(p, hex, j);
    let alvo = null;
    if (podem.length === 1 && (vitima === undefined || vitima === null)) alvo = podem[0];
    else if (podem.length) {
      exigir(podem.includes(vitima), 'Escolha de quem roubar.');
      alvo = vitima;
    }
    p.ladrao = hex;
    anotar(p, { t: 'ladrao', j, hex });
    if (alvo !== null) {
      const mao = p.jogadores[alvo].mao;
      const monte = RECURSOS.flatMap((r) => Array(mao[r]).fill(r));
      const r = monte[Math.floor(sorteio() * monte.length)];
      mao[r]--;
      p.jogadores[j].mao[r]++;
      anotar(p, { t: 'roubou', j, de: alvo, recurso: r });
    }
    p.fase = p.depoisDoLadrao;
  },

  cavaleiro(p, j) {
    const volta = gastarCarta(p, j, 'cavaleiro');
    p.jogadores[j].cavaleiros++;
    anotar(p, { t: 'jogou', j, carta: 'cavaleiro' });
    recalcularMaiorExercito(p, j);
    p.depoisDoLadrao = volta;
    p.fase = 'ladrao';
    conferirVitoria(p);
  },

  estradas(p, j) {
    exigir(p.jogadores[j].pecas.estrada > 0 && lugaresDeEstrada(p, j).length > 0, 'Não há onde pôr estrada.');
    const volta = gastarCarta(p, j, 'estradas');
    anotar(p, { t: 'jogou', j, carta: 'estradas' });
    p.depoisDoLadrao = volta;
    p.estradasGratis = 2;
    p.fase = 'estradas';
  },

  pararEstradas(p, j) {
    exigirVez(p, j);
    exigirFase(p, 'estradas');
    p.estradasGratis = 0;
    p.fase = p.depoisDoLadrao;
  },

  fartura(p, j, { recursos }) {
    exigir(Array.isArray(recursos) && recursos.length === 2, 'Escolha duas cartas.');
    recursos.forEach(lerRecurso);
    const pedido = vazia();
    for (const r of recursos) pedido[r]++;
    exigir(temTudo(p.banco, pedido), 'O banco não tem essas cartas.');
    gastarCarta(p, j, 'fartura');
    mover(p.banco, p.jogadores[j].mao, pedido);
    anotar(p, { t: 'jogou', j, carta: 'fartura', recursos: pedido });
  },

  monopolio(p, j, { recurso }) {
    lerRecurso(recurso);
    gastarCarta(p, j, 'monopolio');
    let total = 0;
    for (const k of ativos(p)) {
      if (k === j) continue;
      const n = p.jogadores[k].mao[recurso];
      p.jogadores[k].mao[recurso] = 0;
      total += n;
    }
    p.jogadores[j].mao[recurso] += total;
    anotar(p, { t: 'jogou', j, carta: 'monopolio', recurso, total });
  },

  banco(p, j, { da, quer }) {
    exigirVez(p, j);
    exigirFase(p, 'acoes');
    lerRecurso(da); lerRecurso(quer);
    exigir(da !== quer, 'Troque por outro recurso.');
    const taxa = taxas(p, j)[da];
    exigir(p.jogadores[j].mao[da] >= taxa, `O banco pede ${taxa} de ${da === 'la' ? 'lã' : da}.`);
    exigir(p.banco[quer] > 0, 'O banco não tem essa carta.');
    p.jogadores[j].mao[da] -= taxa; p.banco[da] += taxa;
    p.banco[quer]--; p.jogadores[j].mao[quer]++;
    anotar(p, { t: 'banco', j, da, quer, taxa });
  },

  oferecer(p, j, { da, quer }, _sorteio, agora) {
    exigirVez(p, j);
    exigirFase(p, 'acoes');
    const dou = lerMonte(da), peco = lerMonte(quer);
    exigir(soma(dou) > 0 && soma(peco) > 0, 'A troca precisa de cartas dos dois lados.');
    exigir(RECURSOS.every((r) => !(dou[r] && peco[r])), 'Não dá para dar e pedir o mesmo recurso.');
    exigir(temTudo(p.jogadores[j].mao, dou), 'Você não tem essas cartas.');
    p.oferta = {
      da: dou, quer: peco, respostas: {}, contras: {},
      aberta: true, prazo: p.relogio ? agora + PRAZO_DA_TROCA : null,
    };
    anotar(p, { t: 'ofereceu', j, da: dou, quer: peco });
  },

  cancelarOferta(p, j) {
    exigirVez(p, j);
    p.oferta = null;
  },

  responder(p, j, { resposta }) {
    exigirFase(p, 'acoes');
    exigir(p.oferta, 'Não há troca oferecida.');
    exigir(p.oferta.aberta, 'O tempo para responder a essa troca acabou.');
    exigir(p.vez !== j, 'A troca é sua: espere as respostas.');
    exigir(['aceita', 'recusa'].includes(resposta), 'Aceite ou recuse.');
    if (resposta === 'aceita') exigir(temTudo(p.jogadores[j].mao, p.oferta.quer), 'Você não tem o que ele pede.');
    p.oferta.respostas[j] = resposta;
  },

  /** Quem não está na vez propõe outra troca a quem está: `da` é o que ELE dá. */
  contraproposta(p, j, { da, quer }) {
    exigirFase(p, 'acoes');
    exigir(p.oferta, 'Não há troca oferecida.');
    exigir(p.oferta.aberta, 'O tempo para responder a essa troca acabou.');
    exigir(p.vez !== j, 'A troca é sua.');
    const dou = lerMonte(da), peco = lerMonte(quer);
    exigir(soma(dou) > 0 && soma(peco) > 0, 'A troca precisa de cartas dos dois lados.');
    exigir(temTudo(p.jogadores[j].mao, dou), 'Você não tem essas cartas.');
    p.oferta.contras[j] = { da: dou, quer: peco };
    p.oferta.respostas[j] = 'contra';
  },

  fecharTroca(p, j, { com, contra = false }) {
    exigirVez(p, j);
    exigirFase(p, 'acoes');
    exigir(p.oferta, 'Não há troca oferecida.');
    exigir(Number.isInteger(com) && p.jogadores[com] && !p.jogadores[com].fora && com !== j, 'Com quem?');
    let dou, recebo;
    if (contra) {
      const c = p.oferta.contras[com];
      exigir(c, 'Essa pessoa não propôs outra troca.');
      dou = c.quer; recebo = c.da;
    } else {
      exigir(p.oferta.respostas[com] === 'aceita', 'Essa pessoa não aceitou.');
      dou = p.oferta.da; recebo = p.oferta.quer;
    }
    exigir(temTudo(p.jogadores[j].mao, dou), 'Você não tem mais essas cartas.');
    exigir(temTudo(p.jogadores[com].mao, recebo), 'A outra pessoa não tem mais essas cartas.');
    mover(p.jogadores[j].mao, p.jogadores[com].mao, dou);
    mover(p.jogadores[com].mao, p.jogadores[j].mao, recebo);
    p.oferta = null;
    anotar(p, { t: 'trocou', j, com, deu: dou, recebeu: recebo });
  },

  passar(p, j) {
    exigirVez(p, j);
    exigirFase(p, 'acoes');
    proximaVez(p);
  },
};

/**
 * Uma ação na partida. `j` é quem age; `acao` é `{ tipo, … }`; `agora` é a hora do servidor, que
 * a partida com relógio exige. Primeiro vencem os prazos que já passaram — a jogada que chega
 * depois do fim da vez não salva ninguém, e o que o relógio fez fica feito mesmo que ela seja
 * recusada, porque aconteceu antes dela. Depois, muda `p` no lugar, ou lança `ErroDeJogo` sem ter
 * mexido em mais nada.
 */
export function agir(p, j, acao, sorteio = Math.random, agora) {
  vencerPrazos(p, agora, sorteio);
  exigir(p.jogadores[j] && !p.jogadores[j].fora, 'Você não está nesta partida.');
  const tipo = String(acao?.tipo);
  exigir(Object.hasOwn(acoes, tipo), 'Ação desconhecida.');
  if (p.fase === 'fim') throw new ErroDeJogo('A partida já terminou.');
  acoes[tipo](p, j, acao, sorteio, agora);
  acertarRelogio(p, agora);
  // O último descarte de um 7 que o relógio rolou devolve a vez a quem já não tinha tempo: o
  // ladrão dele sai agora, e não na leitura seguinte com a tela mostrando um prazo vencido.
  vencerPrazos(p, agora, sorteio);
}

// ---------------------------------------------------------------------------------------------
// O relógio (decisão do dono, 04/10/2026, desfazendo a de 27/09 de jogar sem ele). Cada vez tem
// 30 ou 60 segundos, escolhidos na mesa; estourou, o jogo joga por quem estava na vez — o mínimo
// para a vez passar —, e a partida nunca fica parada esperando alguém que foi buscar café.
//
// São três prazos, todos INSTANTES do relógio do servidor guardados na partida:
// - `relogio.prazo`: a vez de `p.vez`. Recomeça inteiro a cada vez nova — e cada passo da
//   colocação inicial é uma vez, para o jogador que põe duas seguidas ter tempo para as duas.
// - `relogio.descarte`: o 7. O descarte é de VÁRIOS ao mesmo tempo, e quem rolou não tem culpa da
//   demora deles: enquanto ele dura, o relógio da vez fica parado (`pausa`, o que sobrava) e
//   volta com o mesmo tanto quando o último descartar.
// - `oferta.prazo`: 15 s fixos para responder à troca, correndo junto com o da vez.
// ---------------------------------------------------------------------------------------------

/** Quem está na vez, e em que passo dela. Mudou, a vez é outra e o relógio recomeça. */
const chaveDaVez = (p) => `${p.turno}:${p.vez}:${p.inicio?.passo ?? ''}`;

function exigirHora(agora) {
  if (!Number.isFinite(agora)) throw new Error('A partida tem relógio: falta dizer que horas são.');
}

/**
 * Liga o relógio na vez de agora. É o que `novaPartida` faz com `segundos`; o teste o usa depois
 * de montar uma posição à mão.
 */
export function ligarRelogio(p, segundos, agora) {
  if (!TEMPOS_DA_VEZ.includes(segundos)) throw new ErroDeJogo(`A vez é de ${TEMPOS_DA_VEZ.join(' ou de ')} segundos.`);
  p.relogio = { segundos, chave: null, prazo: null, descarte: null, pausa: null };
  acertarRelogio(p, agora);
}

/** Depois de toda mudança: vez nova recomeça o relógio; o 7 o pausa, e o fim do descarte o devolve. */
function acertarRelogio(p, agora) {
  const r = p.relogio;
  if (!r) return;
  exigirHora(agora);
  if (p.fase === 'fim') {
    Object.assign(r, { prazo: null, descarte: null, pausa: null });
    return;
  }
  const ms = r.segundos * 1000;
  const chave = chaveDaVez(p);
  if (chave !== r.chave) Object.assign(r, { chave, prazo: agora + ms, descarte: null, pausa: null });
  if (p.fase === 'descartar') {
    if (r.descarte === null) Object.assign(r, { pausa: Math.max(0, r.prazo - agora), prazo: null, descarte: agora + ms });
  } else if (r.descarte !== null) {
    Object.assign(r, { prazo: agora + r.pausa, descarte: null, pausa: null });
  }
}

/**
 * O tempo da vez acabou: o jogo faz por `p.vez` o mínimo para a vez passar, pelas mesmas ações de
 * quem joga — então nada do que ele faz foge da regra. Na colocação, aldeia e estrada num lugar
 * sorteado; antes de rolar, rola; no ladrão, um terreno e uma vítima sorteados; na carta de
 * estradas, para; nas ações, passa (e a oferta aberta vai junto). Saiu 7 com descarte, para ali:
 * o descarte tem prazo próprio, e o relógio desta vez já está zerado para quando ele acabar.
 */
function jogarPeloRelogio(p, sorteio) {
  const j = p.vez;
  const dono = chaveDaVez(p);
  const escolher = (lista) => lista[Math.floor(sorteio() * lista.length)];
  anotar(p, { t: 'tempo', j, fase: p.fase });
  // Uma vez tem poucos passos (aldeia e estrada; ou rolar, ladrão e passar). O limite é só para um
  // defeito virar uma volta a mais da cascata, e não um laço sem fim.
  for (let passo = 0; passo < 10 && chaveDaVez(p) === dono && !['fim', 'descartar'].includes(p.fase); passo++) {
    if (p.fase === 'inicio') {
      if (p.inicio.falta === 'aldeia') acoes.aldeia(p, j, { v: escolher(lugaresDeAldeia(p, j)) });
      else {
        const lugares = lugaresDeEstrada(p, j);
        if (lugares.length) acoes.estrada(p, j, { a: escolher(lugares) });
        else { p.inicio.passo++; avancarInicio(p); }
      }
    } else if (p.fase === 'rolar') acoes.rolar(p, j, {}, sorteio);
    else if (p.fase === 'ladrao') {
      const hex = escolher([...G.cantosDoHex.keys()].filter((h) => h !== p.ladrao));
      const podem = vitimasEm(p, hex, j);
      acoes.ladrao(p, j, { hex, vitima: podem.length ? escolher(podem) : undefined }, sorteio);
    } else if (p.fase === 'estradas') acoes.pararEstradas(p, j);
    else if (p.fase === 'acoes') acoes.passar(p, j);
  }
}

/** O prazo do 7 acabou: quem ainda devia descarta por sorteio, carta a carta da mão. */
function descartarPeloRelogio(p, sorteio) {
  for (const k of Object.keys(p.descartes).map(Number)) {
    const mao = p.jogadores[k].mao;
    const monte = RECURSOS.flatMap((r) => Array(mao[r]).fill(r));
    const escolhidas = vazia();
    for (let i = 0; i < p.descartes[k]; i++) escolhidas[monte.splice(Math.floor(sorteio() * monte.length), 1)[0]]++;
    anotar(p, { t: 'tempo', j: k, fase: 'descartar' });
    acoes.descartar(p, k, { recursos: escolhidas });
  }
}

/**
 * Os 15 s da troca acabaram: quem não respondeu recusou. Sem aceite nem contraproposta, a oferta
 * fecha; com, ela fica — fechada para respostas — para quem ofereceu escolher com quem trocar,
 * dentro do relógio da própria vez.
 */
function vencerOferta(p) {
  const o = p.oferta;
  o.aberta = false;
  for (const k of ativos(p)) if (k !== p.vez && !o.respostas[k]) o.respostas[k] = 'recusa';
  if (!Object.values(o.respostas).some((r) => r === 'aceita' || r === 'contra')) {
    p.oferta = null;
    anotar(p, { t: 'ofertaVenceu', j: p.vez });
  }
}

/**
 * Vence, em ordem, todo prazo que passou até `agora` — cada um NO INSTANTE em que venceu, e não no
 * da leitura: a vez seguinte de quem estourou começa quando a dele acabou. Quem chama é toda
 * leitura e toda ação; ninguém perguntou por dez minutos, a cascata põe a partida em dia de uma vez.
 */
export function vencerPrazos(p, agora, sorteio = Math.random) {
  const r = p.relogio;
  if (!r) return;
  exigirHora(agora);
  for (let volta = 0; volta < PRAZOS_POR_LEITURA && p.fase !== 'fim'; volta++) {
    const oferta = p.oferta?.aberta && p.oferta.prazo !== null ? p.oferta.prazo : Infinity;
    const descarte = r.descarte ?? Infinity;
    const vez = r.prazo ?? Infinity;
    const t = Math.min(oferta, descarte, vez);
    if (t > agora) return;
    if (t === oferta) vencerOferta(p);
    else if (t === descarte) descartarPeloRelogio(p, sorteio);
    else jogarPeloRelogio(p, sorteio);
    acertarRelogio(p, t);
  }
}

/**
 * Alguém saiu da partida. As peças dele ficam no tabuleiro (e continuam cortando estradas), as
 * cartas voltam ao banco, e a vez anda se era dele. Sobrando um, esse vence.
 */
export function sair(p, j, agora) {
  tirarDaPartida(p, j);
  acertarRelogio(p, agora);
}

function tirarDaPartida(p, j) {
  const jog = p.jogadores[j];
  if (!jog || jog.fora || p.fase === 'fim') return;
  jog.fora = true;
  mover(jog.mao, p.banco, { ...jog.mao });
  delete p.descartes[j];
  if (p.oferta) { delete p.oferta.respostas[j]; delete p.oferta.contras[j]; }
  anotar(p, { t: 'saiu', j });
  const restam = ativos(p);
  if (restam.length < MIN_JOGADORES) {
    p.fase = 'fim';
    p.vencedor = restam[0] ?? null;
    p.oferta = null;
    if (p.vencedor !== null) anotar(p, { t: 'venceu', j: p.vencedor, porAbandono: true });
    return;
  }
  if (p.maiorEstrada?.j === j || p.maiorExercito?.j === j) {
    if (p.maiorExercito?.j === j) p.maiorExercito = null;
    recalcularMaiorEstrada(p);
  }
  if (p.fase === 'descartar' && !Object.keys(p.descartes).length) p.fase = 'ladrao';
  if (p.vez !== j) return;
  if (p.fase === 'inicio') {
    // Saiu com a aldeia posta e a estrada por pôr: o passo dele acabou ali.
    if (p.inicio.falta === 'estrada') p.inicio.passo++;
    avancarInicio(p);
    return;
  }
  // Saiu no meio do 7: os descartes dos outros já foram feitos, e ninguém move o ladrão.
  proximaVez(p);
}

// ---------------------------------------------------------------------------------------------
// O que cada um enxerga.
// ---------------------------------------------------------------------------------------------

/** O histórico como cada um pode vê-lo: a carta roubada só para os dois envolvidos. */
function historicoPara(p, j) {
  return p.historico.slice(-60).map((e) => {
    if (e.t === 'roubou' && j !== e.j && j !== e.de) { const { recurso: _r, ...resto } = e; return resto; }
    if (e.t === 'comprou' && j !== e.j && p.fase !== 'fim') { const { carta: _c, ...resto } = e; return resto; }
    return e;
  });
}

/**
 * A partida vista por `j` (a posição na mesa, ou `null` para quem assiste). A mão e as cartas
 * de desenvolvimento dos outros chegam só como quantidade; no fim, tudo aparece.
 */
export function vista(p, j) {
  const fim = p.fase === 'fim';
  const eu = j !== null && p.jogadores[j] ? j : null;
  const minha = eu !== null ? p.jogadores[eu] : null;
  const daVez = eu !== null && p.vez === eu && !minha.fora;

  const pode = {};
  if (eu !== null && !minha.fora && !fim) {
    if (daVez && p.fase === 'rolar') pode.rolar = true;
    if (daVez && p.fase === 'acoes') {
      pode.passar = true;
      pode.trocar = true;
      pode.banco = taxas(p, eu);
    }
    if (daVez && p.fase === 'inicio') {
      if (p.inicio.falta === 'aldeia') pode.aldeias = lugaresDeAldeia(p, eu);
      else pode.estradas = lugaresDeEstrada(p, eu);
    }
    if (daVez && p.fase === 'acoes') {
      const m = minha.mao;
      if (minha.pecas.aldeia > 0 && temTudo(m, CUSTOS.aldeia)) pode.aldeias = lugaresDeAldeia(p, eu);
      if (minha.pecas.estrada > 0 && temTudo(m, CUSTOS.estrada)) pode.estradas = lugaresDeEstrada(p, eu);
      if (minha.pecas.cidade > 0 && temTudo(m, CUSTOS.cidade)) pode.cidades = lugaresDeCidade(p, eu);
      if (p.baralho.length && temTudo(m, CUSTOS.desenvolvimento)) pode.comprar = true;
    }
    if (daVez && p.fase === 'estradas') { pode.estradas = lugaresDeEstrada(p, eu); pode.pararEstradas = true; }
    if (daVez && p.fase === 'ladrao') {
      pode.ladrao = Object.fromEntries([...G.cantosDoHex.keys()].filter((h) => h !== p.ladrao).map((h) => [h, vitimasEm(p, h, eu)]));
    }
    if (p.fase === 'descartar' && p.descartes[eu]) pode.descartar = p.descartes[eu];
    const cartas = ['cavaleiro', 'estradas', 'fartura', 'monopolio'].filter((t) => podeJogarCarta(p, eu, t));
    if (cartas.length) pode.jogar = cartas;
    if (p.oferta?.aberta && !daVez && p.fase === 'acoes') pode.responder = true;
  }

  return {
    hexes: p.hexes.map(({ q, r, terreno, numero }) => ({ q, r, terreno, numero })),
    portos: p.portos.map(({ tipo, cruzamentos }) => ({ tipo, cruzamentos })),
    ladrao: p.ladrao,
    construcoes: Object.entries(p.construcoes).map(([v, c]) => ({ v, j: c.j, tipo: c.tipo })),
    estradas: Object.entries(p.estradas).map(([a, k]) => ({ a, j: k })),
    jogadores: p.jogadores.map((jog, k) => ({
      cor: jog.cor,
      cartas: soma(jog.mao),
      desenvolvimento: jog.cartas.length,
      cavaleiros: jog.cavaleiros,
      estrada: tamanhoDaEstrada(p, k),
      pontos: pontos(p, k, fim || k === eu),
      pecas: { ...jog.pecas },
      fora: jog.fora,
      descartar: p.descartes[k] ?? 0,
      ...(fim ? { mao: { ...jog.mao }, cartasDeDesenvolvimento: jog.cartas.map((c) => c.tipo) } : {}),
    })),
    maiorEstrada: p.maiorEstrada,
    maiorExercito: p.maiorExercito,
    banco: { ...p.banco },
    baralho: p.baralho.length,
    fase: p.fase,
    vez: p.vez,
    rodada: p.rodada,
    inicio: p.fase === 'inicio' ? { falta: p.inicio.falta, segunda: p.inicio.passo >= p.jogadores.length } : null,
    dados: p.dados,
    rolagens: p.rolagens,
    contagem: { ...p.contagem },
    estradasGratis: p.estradasGratis,
    oferta: p.oferta ? {
      da: { ...p.oferta.da }, quer: { ...p.oferta.quer },
      respostas: { ...p.oferta.respostas }, contras: structuredClone(p.oferta.contras),
      aberta: p.oferta.aberta, prazo: p.oferta.prazo,
    } : null,
    // Os prazos são instantes do relógio do SERVIDOR; a mesa manda o `agora` dela junto, e a tela
    // desconta o que passou desde a resposta, como no xadrez.
    relogio: p.relogio ? {
      segundos: p.relogio.segundos, prazo: p.relogio.prazo, descarte: p.relogio.descarte, pausa: p.relogio.pausa,
    } : null,
    historico: historicoPara(p, eu),
    vencedor: p.vencedor,
    eu,
    mao: minha ? { ...minha.mao } : null,
    cartas: minha ? minha.cartas.map((c) => ({ tipo: c.tipo, nova: c.turno >= p.turno })) : null,
    pode,
  };
}
