/**
 * As telas do Dragão Quadrado fora da luta — título, escolha de lutador, convite, opções, VS,
 * vitória, a pergunta de desistir e o cartão de convite —, desenhadas no mesmo quadro de 384x216 da
 * luta, com as letras, o contorno e o dourado do placar. O dono pediu o jogo "como se fosse um jogo
 * completo dentro", tudo na direção de arte do jogo; escolheu, vendo as telas feitas por este motor,
 * o título com o Torneio e os nove em fila e a escolha com a grade no meio.
 *
 * Cada tela devolve as REGIÕES clicáveis que desenhou: o mouse acerta o que se vê porque as duas
 * coisas saem da mesma conta, e não de um mapa escrito à parte que um dia desencontra.
 *
 * Nada aqui anima sozinho. A tela parada é desenhada uma vez; quem chama redesenha quando algo muda
 * (tecla, mouse, resposta do servidor) e no piscar do cursor, duas vezes por segundo — foi a regra
 * que saiu de 16/09/2026, quando animações pequenas redesenhando a janela sem parar levaram a Saga
 * a 100% de CPU no Mac do dono.
 */
import { SPRITE } from './boneco.ts';
import { desenharCenario, pontilhar } from './cenario.ts';
import { cenarioPronto, retratoPronto } from './desenho.ts';
import { FICHAS } from './fichas.ts';
import { escrever, FONTE, medir } from './fonte.ts';
import { TELA } from './medidas.ts';
import { quadroDoPixel } from './pixel/sprites.ts';
import './pixel/todos.ts';
import { type Cor, type Quadro, colar, cor, criarQuadro, misturar, pixel, retangulo } from './quadro.ts';
import { IDS_DOS_CENARIOS, IDS_DOS_LUTADORES, type IdDoCenario, type IdDoLutador } from './tipos.ts';

const W = TELA.largura, H = TELA.altura;

/** As cores do placar e as que as telas acrescentam — azul do 1P, vinho do 2P, dourado do que está escolhido. */
export const CORES = {
  contorno: cor('#1b1022'), aro: cor('#bdb3d9'), fundo: cor('#2c2040'), fundoEscuro: cor('#170f24'), vazio: cor('#3b2d50'),
  branco: cor('#ffffff'), creme: cor('#fff3a8'), ouro: cor('#ffc83a'), ouroSombra: cor('#cf7618'), laranja: cor('#f08a24'),
  azul: cor('#3b5aa8'), azulEscuro: cor('#1e2c62'), azulClaro: cor('#7fa6ff'), vinho: cor('#a83b55'), vinhoEscuro: cor('#4a1428'),
  vinhoClaro: cor('#ff7b95'), lilas: cor('#9d8fcf'), lilasEscuro: cor('#5b4d86'), ki: cor('#55d6ff'), kiClaro: cor('#e8fcff'),
  kiEscuro: cor('#1f8ee0'), cinza: cor('#7d8db4'), vermelho: cor('#e2353c'), realce: cor('#4a3a6e'),
};
const P = CORES;

export const NOMES_DOS_CENARIOS: Record<IdDoCenario, string> = { torneio: 'TORNEIO', planeta: 'PLANETA VERDE', ilha: 'ILHA DA TARTARUGA', canion: 'CÂNION' };
export const textoDosRounds = (r: 1 | 2) => (r === 1 ? 'LUTA ÚNICA' : 'MELHOR DE 3');

/**
 * O rosto na escolha. Os da Super Feira aparecem no Blue: no normal o rosto deles é o mesmo do
 * Goiaba e do Vegetal, e a grade teria dois pares de gêmeos.
 */
export const formaNaEscolha = (id: IdDoLutador): 0 | 1 => (id === 'goiabaSuper' || id === 'vegetalSuper' ? 1 : 0);

// ———— o que se clica ————

export type Alvo =
  | { tipo: 'item'; indice: number }
  | { tipo: 'lutador'; id: IdDoLutador }
  | { tipo: 'botao' }
  | { tipo: 'opcoes' }
  | { tipo: 'pessoa'; indice: number }
  | { tipo: 'linha'; indice: number; passo?: -1 | 1 }
  | { tipo: 'testar' }
  | { tipo: 'aceitar' }
  | { tipo: 'recusar' };

export type Regiao = { x: number; y: number; l: number; a: number; alvo: Alvo };

/** A região sob o ponto — a última desenhada ganha, porque é a que está por cima. */
export function regiaoEm(regioes: Regiao[], x: number, y: number): Regiao | null {
  for (let i = regioes.length - 1; i >= 0; i--) {
    const r = regioes[i];
    if (x >= r.x && x < r.x + r.l && y >= r.y && y < r.y + r.a) return r;
  }
  return null;
}

// ———— o pincel ————

function degrade(q: Quadro, x: number, y: number, l: number, a: number, cima: Cor, baixo: Cor) {
  for (let r = 0; r < a; r++) {
    const t = r / Math.max(1, a - 1);
    for (let c = 0; c < l; c++) pixel(q, x + c, y + r, pontilhar(x + c, y + r, t) ? baixo : cima);
  }
}

/** A moldura do placar: contorno escuro, aro claro e o miolo em degradê pontilhado. */
function painel(q: Quadro, x: number, y: number, l: number, a: number, cima: Cor = P.fundo, baixo: Cor = P.fundoEscuro, aro: Cor = P.aro) {
  retangulo(q, x - 2, y - 2, l + 4, a + 4, P.contorno);
  retangulo(q, x - 1, y - 1, l + 2, a + 2, aro);
  degrade(q, x, y, l, a, cima, baixo);
}

function escurecer(q: Quadro, t: number, x = 0, y = 0, l = q.largura, a = q.altura, c: Cor = P.contorno) {
  for (let yy = Math.max(0, y); yy < Math.min(q.altura, y + a); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(q.largura, x + l); xx++) {
      const i = yy * q.largura + xx;
      q.px[i] = misturar(q.px[i], c, t);
    }
  }
}

/** Triângulo de 3x5 apontando para a direita (1) ou para a esquerda (-1). */
function seta(q: Quadro, x: number, y: number, direcao: 1 | -1, c: Cor) {
  for (let i = 0; i < 3; i++) for (let j = -(2 - i); j <= 2 - i; j++) pixel(q, direcao === 1 ? x + i : x + 2 - i, y + 2 + j, c);
}

function ampliar(s: Quadro, f: number): Quadro {
  if (f === 1) return s;
  const r = criarQuadro(s.largura * f, s.altura * f);
  for (let y = 0; y < s.altura; y++) for (let x = 0; x < s.largura; x++) {
    const c = s.px[y * s.largura + x];
    if (c) retangulo(r, x * f, y * f, f, f, c);
  }
  return r;
}

function contornar(s: Quadro, c: Cor, m = 1): Quadro {
  const r = criarQuadro(s.largura + 2 * m, s.altura + 2 * m);
  for (let y = 0; y < s.altura; y++) for (let x = 0; x < s.largura; x++) if (s.px[y * s.largura + x]) retangulo(r, x, y, 2 * m + 1, 2 * m + 1, c);
  colar(r, s, m, m);
  return r;
}

const letreiros = new Map<string, Quadro>();
/** Texto grande ampliado, em degradê, com sombra e contorno: o jeito de logo de fliperama. */
function letreiro(texto: string, f: number, tons: Cor[], sombra: Cor = P.vinhoEscuro): Quadro {
  const chave = `${texto}|${f}|${tons.join(',')}|${sombra}`;
  const pronto = letreiros.get(chave);
  if (pronto) return pronto;
  const acima = FONTE.grande.acima + 1, abaixo = FONTE.grande.abaixo;
  const t = criarQuadro(Math.max(1, medir(texto, 'grande')), FONTE.grande.altura + acima + abaixo);
  escrever(t, texto, 0, acima, P.branco, { tamanho: 'grande' });
  const g = ampliar(t, f);
  const y0 = acima * f, y1 = (acima + FONTE.grande.altura) * f;
  for (let y = 0; y < g.altura; y++) {
    const k = Math.max(0, Math.min(1, (y - y0) / Math.max(1, y1 - y0))) * (tons.length - 1);
    const i = Math.min(tons.length - 2, Math.floor(k));
    for (let x = 0; x < g.largura; x++) if (g.px[y * g.largura + x]) g.px[y * g.largura + x] = pontilhar(x, y, k - i) ? tons[i + 1] : tons[i];
  }
  const comSombra = criarQuadro(g.largura + f, g.altura + f);
  colar(comSombra, ampliar(t, f), f, f, false, sombra);
  colar(comSombra, g, 0, 0);
  const pronto2 = contornar(comSombra, P.contorno, 2);
  letreiros.set(chave, pronto2);
  return pronto2;
}
const DOURADO = [P.creme, P.ouro, P.laranja, P.ouroSombra];
const DOURADO_CURTO = [P.creme, P.ouro, P.ouroSombra];

/** A esfera do nome: quadrada, laranja, com as estrelas vermelhas — uma ou quatro. */
function esferaQuadrada(q: Quadro, x: number, y: number, lado: number, estrelas: 1 | 4) {
  const r = Math.max(2, Math.round(lado / 6));
  const dentro = (xx: number, yy: number, m: number) => {
    const cx = Math.min(Math.max(xx, r + m), lado - 1 - r - m), cy = Math.min(Math.max(yy, r + m), lado - 1 - r - m);
    return (xx - cx) ** 2 + (yy - cy) ** 2 <= r ** 2 && xx >= m && yy >= m && xx < lado - m && yy < lado - m;
  };
  for (let yy = -2; yy < lado + 2; yy++) for (let xx = -2; xx < lado + 2; xx++) {
    const px = x + xx, py = y + yy;
    if (dentro(xx, yy, 0)) {
      pixel(q, px, py, pontilhar(px, py, ((xx + yy) / (2 * lado)) * 1.2) ? cor('#e8661a') : cor('#ffb347'));
      if (!dentro(xx, yy, 2)) pixel(q, px, py, cor('#c24a10'));
    } else if (dentro(xx + 2, yy, 0) || dentro(xx - 2, yy, 0) || dentro(xx, yy + 2, 0) || dentro(xx, yy - 2, 0)) {
      pixel(q, px, py, P.contorno);
    }
  }
  retangulo(q, x + 3, y + 3, Math.max(2, Math.round(lado / 5)), 2, cor('#fff3d0'));
  retangulo(q, x + 3, y + 3, 2, Math.max(2, Math.round(lado / 5)), cor('#fff3d0'));
  const s = Math.max(2, Math.round(lado / 10));
  const pos = estrelas === 1 ? [[0.5, 0.5]] : [[0.36, 0.36], [0.64, 0.36], [0.36, 0.64], [0.64, 0.64]];
  for (const [fx, fy] of pos) {
    const cx = Math.round(x + lado * fx - s / 2), cy = Math.round(y + lado * fy - s / 2);
    retangulo(q, cx - 1, cy - 1, s + 2, s + 2, cor('#8a1a1a'));
    retangulo(q, cx, cy, s, s, P.vermelho);
  }
}

const sprites = new Map<string, { q: Quadro; peX: number; peY: number }>();
/** O lutador numa pose, recortado ao que tem tinta e ampliado, com o pé onde estava. */
function spriteDe(id: IdDoLutador, forma: 0 | 1, pose: string, f: number) {
  const chave = `${id}|${forma}|${pose}|${f}`;
  const pronto = sprites.get(chave);
  if (pronto) return pronto;
  const s = quadroDoPixel(id, forma, pose);
  if (!s) return null;
  let x0 = s.largura, y0 = s.altura, x1 = -1, y1 = -1;
  for (let y = 0; y < s.altura; y++) for (let x = 0; x < s.largura; x++) {
    if (!s.px[y * s.largura + x]) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return null;
  const r = criarQuadro(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) r.px[(y - y0) * r.largura + x - x0] = s.px[y * s.largura + x];
  const feito = { q: ampliar(r, f), peX: (SPRITE.ancoraX - x0) * f, peY: (SPRITE.ancoraY - y0) * f };
  sprites.set(chave, feito);
  return feito;
}

function colarLutador(q: Quadro, id: IdDoLutador, forma: 0 | 1, pose: string, peX: number, peY: number, f = 1, espelhar = false) {
  const s = spriteDe(id, forma, pose, f);
  if (!s) return;
  peX = Math.round(peX); peY = Math.round(peY);
  for (let i = -10 * f; i <= 10 * f; i++) if (i % 2 === 0 || Math.abs(i) < 9 * f) pixel(q, peX + i, peY, P.contorno);
  const x = espelhar ? peX - (s.q.largura - s.peX) : peX - s.peX;
  colar(q, s.q, x, peY - s.peY, espelhar);
}

const cenarios = new Map<string, Quadro>();
/** O cenário inteiro na posição de câmera pedida, desenhado uma vez — as telas não o animam. */
function fundoDoCenario(id: IdDoCenario, camX = 128): Quadro {
  const chave = `${id}|${camX}`;
  let q = cenarios.get(chave);
  if (!q) { q = criarQuadro(W, H); desenharCenario(q, cenarioPronto(id), camX, 40); cenarios.set(chave, q); }
  return q;
}

function recorte(s: Quadro, x: number, y: number, l: number, a: number): Quadro {
  const r = criarQuadro(l, a);
  for (let yy = 0; yy < a; yy++) for (let xx = 0; xx < l; xx++) r.px[yy * l + xx] = s.px[(y + yy) * s.largura + x + xx];
  return r;
}

function copiarPara(q: Quadro, s: Quadro) { q.px.set(s.px); }

function retratoNaMoldura(q: Quadro, id: IdDoLutador, x: number, y: number) {
  retangulo(q, x - 2, y - 2, 36, 36, P.contorno);
  retangulo(q, x - 1, y - 1, 34, 34, P.aro);
  degrade(q, x, y, 32, 32, P.vazio, cor('#241a35'));
  colar(q, retratoPronto(id, formaNaEscolha(id)), x, y);
}

/** A moldura do cursor em volta de um retrato, com a etiqueta 1P ou 2P. */
function molduraDoCursor(q: Quadro, x: number, y: number, lado: number, c: Cor, rotulo: string, embaixo: boolean) {
  for (let k = 0; k < 2; k++) {
    const e = 3 + k, t = lado + 2 * e;
    retangulo(q, x - e, y - e, t, 1, c); retangulo(q, x - e, y + lado + e - 1, t, 1, c);
    retangulo(q, x - e, y - e, 1, t, c); retangulo(q, x + lado + e - 1, y - e, 1, t, c);
  }
  const ly = embaixo ? y + lado + 1 : y - 8, lx = embaixo ? x + lado - 12 : x - 5;
  retangulo(q, lx - 1, ly - 1, 15, 9, P.contorno);
  retangulo(q, lx, ly, 13, 7, c);
  escrever(q, rotulo, lx + 7, ly + 1, P.branco, { alinhar: 'centro' });
}

type Texto = { contorno?: Cor; alinhar?: 'esquerda' | 'centro' | 'direita'; corDeBaixo?: Cor; tamanho?: 'pequena' | 'grande' };

/** O artigo de cada lutador: a Geladeira e a Goteira, o resto é o. */
export const artigo = (id: IdDoLutador) => (id === 'geladeira' || id === 'goteira' ? 'A' : 'O');
const texto = (q: Quadro, t: string, x: number, y: number, c: Cor, o: Texto = {}) =>
  escrever(q, t, x, y, c, { contorno: P.contorno, ...o });

/** O texto que não cabe perde o fim e ganha reticências. */
export function caber(t: string, largura: number): string {
  const s = t.toUpperCase();
  if (medir(s) <= largura) return s;
  let r = s;
  while (r.length > 1 && medir(`${r}...`) > largura) r = r.slice(0, -1);
  return `${r.trimEnd()}...`;
}

/** Botão de pixel: dourado quando aceso, apagado quando não se pode. */
function botao(q: Quadro, rotulo: string, x: number, y: number, l: number, aceso: boolean, ativo = true) {
  retangulo(q, x - 1, y - 1, l + 2, 13, P.contorno);
  retangulo(q, x, y, l, 11, !ativo ? P.vazio : aceso ? P.ouro : P.lilasEscuro);
  if (ativo && aceso) retangulo(q, x, y, l, 1, P.creme);
  texto(q, rotulo, x + l / 2, y + 3, !ativo ? P.cinza : aceso ? P.contorno : P.branco, { contorno: undefined, alinhar: 'centro' });
}

/**
 * O nome do lutador em letra grande; o que não cabe (GOIABA SUPER FEIRA) fica com a primeira palavra
 * grande e o resto embaixo, pequeno. Devolve se quebrou.
 */
function nomeGrande(q: Quadro, nome: string, x: number, y: number, largura: number, alinhar: 'esquerda' | 'centro' | 'direita', claro: Cor): boolean {
  if (medir(nome, 'grande') <= largura) {
    texto(q, nome, x, y, P.branco, { tamanho: 'grande', alinhar, corDeBaixo: claro });
    return false;
  }
  const [primeira, ...resto] = nome.split(' ');
  texto(q, primeira, x, y, P.branco, { tamanho: 'grande', alinhar, corDeBaixo: claro });
  texto(q, caber(resto.join(' '), largura), x, y + 17, claro, { alinhar });
  return true;
}

/** O recado no meio da luta ("A CONEXÃO CAIU. VOLTANDO..."), numa moldura pequena acima dos pés. */
export function desenharAvisoNaLuta(q: Quadro, recado: string) {
  const t = caber(recado, W - 60);
  const l = medir(t) + 16;
  painel(q, Math.round((W - l) / 2), 150, l, 11, P.fundo, P.fundoEscuro, P.lilasEscuro);
  texto(q, t, W / 2, 153, P.branco, { alinhar: 'centro' });
}

// ———— o título ————

export type ItemDeMenu = { rotulo: string; apagado?: boolean };
export type DadosDoTitulo = { itens: ItemDeMenu[]; selecionado: number; aviso?: string | null };

let fundoDoTitulo: { q: Quadro; menuY: number } | null = null;
function prepararTitulo() {
  if (fundoDoTitulo) return fundoDoTitulo;
  const q = criarQuadro(W, H);
  copiarPara(q, fundoDoCenario('torneio'));
  escurecer(q, 0.55, 0, 0, W, 140);
  escurecer(q, 0.2, 0, 140, W, 76);
  const d = letreiro('DRAGÃO', 3, DOURADO);
  colar(q, d, Math.round((W - d.largura) / 2), 3);
  const qd = letreiro('QUADRADO', 1, [P.kiClaro, P.ki, P.kiEscuro], cor('#0f2a55'));
  const qy = 3 + d.altura - 2;
  colar(q, qd, Math.round((W - qd.largura) / 2), qy);
  esferaQuadrada(q, Math.round((W - qd.largura) / 2) - 22, qy + 2, 15, 1);
  esferaQuadrada(q, Math.round((W + qd.largura) / 2) + 7, qy + 2, 15, 4);
  IDS_DOS_LUTADORES.forEach((id, i) => colarLutador(q, id, formaNaEscolha(id), 'parado0', 26 + i * 41.5, 204, 1, i >= 5));
  fundoDoTitulo = { q, menuY: qy + qd.altura + 8 };
  return fundoDoTitulo;
}

/** Menu vertical no meio: a opção escolhida em dourado, entre setas. Devolve as regiões. */
function menuVertical(q: Quadro, itens: ItemDeMenu[], selecionado: number, cx: number, y: number, passo = 13, larguraMinima = 88): Regiao[] {
  const l = Math.max(larguraMinima, ...itens.map((i) => medir(i.rotulo.toUpperCase()) + 26));
  painel(q, Math.round(cx - l / 2), y - 5, l, itens.length * passo + 3, cor('#241a35'), P.fundoEscuro, P.lilasEscuro);
  return itens.map((item, i) => {
    const aceso = i === selecionado && !item.apagado;
    const t = item.rotulo.toUpperCase();
    const ty = y + i * passo;
    texto(q, t, cx, ty, item.apagado ? P.cinza : aceso ? P.ouro : P.aro, { alinhar: 'centro', corDeBaixo: item.apagado ? undefined : aceso ? P.ouroSombra : P.lilas });
    if (aceso) {
      const lt = medir(t);
      seta(q, Math.round(cx - lt / 2 - 8), ty, 1, P.ouro);
      seta(q, Math.round(cx + lt / 2 + 5), ty, -1, P.ouro);
    }
    return { x: Math.round(cx - l / 2), y: ty - 4, l, a: passo, alvo: { tipo: 'item', indice: i } };
  });
}

function faixaDeAviso(q: Quadro, aviso: string | null | undefined) {
  if (!aviso) return;
  escurecer(q, 0.75, 0, H - 14, W, 14);
  texto(q, caber(aviso, W - 16), W / 2, H - 9, P.vinhoClaro, { alinhar: 'centro' });
}

export function desenharTitulo(q: Quadro, t: DadosDoTitulo): Regiao[] {
  const f = prepararTitulo();
  copiarPara(q, f.q);
  // com quatro itens (a arena de alguém aberta) o passo aperta, para o menu não cobrir as cabeças da fila
  const regioes = t.itens.length ? menuVertical(q, t.itens, t.selecionado, W / 2, f.menuY + 5, t.itens.length > 3 ? 11 : 13) : [];
  faixaDeAviso(q, t.aviso);
  return regioes;
}

// ———— a escolha de lutador ————

export type PainelDaEscolha = {
  /** O apelido de quem está (ou vai estar) desse lado; nulo no lugar livre. */
  jogador: string | null;
  lutador: IdDoLutador | null;
  /** O que o painel diz no alto: PRONTO!, ESCOLHENDO, LUGAR LIVRE… */
  rotulo: string;
  /** Rótulo em dourado (é a sua vez de agir) ou apagado. */
  destaque: boolean;
};

export type DadosDaEscolha = {
  paineis: [PainelDaEscolha, PainelDaEscolha];
  /** Onde fica a moldura 1P e a 2P na grade. */
  cursores: [IdDoLutador | null, IdDoLutador | null];
  cenario: IdDoCenario;
  rounds: 1 | 2;
  /** O botão embaixo da grade: LUTAR para quem abriu, CONVIDAR quando falta alguém; nulo sem nada a fazer. */
  botao: { rotulo: string; ativo: boolean; aceso: boolean } | null;
  /** O recado no lugar do botão, para quem não tem botão: "ESPERANDO TKP COMEÇAR". */
  recado: string | null;
  legenda: string;
  aviso?: string | null;
};

let fundoDaEscolha: Quadro | null = null;
function prepararEscolha() {
  if (fundoDaEscolha) return fundoDaEscolha;
  const q = criarQuadro(W, H);
  degrade(q, 0, 0, W, H, cor('#2a1d44'), P.contorno);
  for (let y = 0; y < H; y += 2) for (let x = (y / 2) % 8; x < W; x += 8) pixel(q, x, y, cor('#33254f'));
  const t = letreiro('ESCOLHA SEU LUTADOR', 1, DOURADO_CURTO);
  colar(q, t, Math.round((W - t.largura) / 2), 1);
  fundoDaEscolha = q;
  return q;
}

const GRADE = { x: 134, y: 34, passo: 40 };
export const posicaoNaGrade = (id: IdDoLutador): [number, number] => {
  const i = IDS_DOS_LUTADORES.indexOf(id);
  return [GRADE.x + (i % 3) * GRADE.passo, GRADE.y + Math.floor(i / 3) * GRADE.passo];
};

function painelDoLado(q: Quadro, lado: 0 | 1, p: PainelDaEscolha) {
  const x = lado === 0 ? 10 : 264, meio = x + 55;
  const [cima, baixo, claro] = lado === 0 ? [P.azul, P.azulEscuro, P.azulClaro] : [P.vinho, P.vinhoEscuro, P.vinhoClaro];
  painel(q, x, 30, 110, 136, cima, baixo);
  if (p.lutador) colarLutador(q, p.lutador, formaNaEscolha(p.lutador), 'parado0', meio, 158, 2, lado === 1);
  else {
    // o lugar livre: a silhueta de quem ainda não chegou
    const s = spriteDe('goiaba', 0, 'parado0', 2);
    if (s) colar(q, s.q, lado === 1 ? meio - (s.q.largura - s.peX) : meio - s.peX, 158 - s.peY, lado === 1, misturar(baixo, P.contorno, 0.35));
  }
  texto(q, p.rotulo, meio, 36, p.destaque ? P.ouro : P.aro, { alinhar: 'centro', corDeBaixo: p.destaque ? P.ouroSombra : undefined });
  const nome = p.lutador ? FICHAS[p.lutador].nome.toUpperCase() : '???';
  const quebra = nomeGrande(q, nome, meio, 172, 118, 'centro', claro);
  texto(q, caber(`${lado + 1}P  ${p.jogador ?? 'LIVRE'}`, 118), meio, quebra ? 196 : 191, claro, { alinhar: 'centro' });
}

export function desenharEscolha(q: Quadro, e: DadosDaEscolha): Regiao[] {
  copiarPara(q, prepararEscolha());
  const regioes: Regiao[] = [];
  painelDoLado(q, 0, e.paineis[0]);
  painelDoLado(q, 1, e.paineis[1]);
  for (const id of IDS_DOS_LUTADORES) {
    const [x, y] = posicaoNaGrade(id);
    retratoNaMoldura(q, id, x, y);
    regioes.push({ x: x - 3, y: y - 3, l: 38, a: 38, alvo: { tipo: 'lutador', id } });
  }
  // o 2P primeiro: quando os dois estão no mesmo retrato, a moldura do 1P fica por fora e se vê
  if (e.cursores[1]) { const [x, y] = posicaoNaGrade(e.cursores[1]); molduraDoCursor(q, x, y, 32, P.vinhoClaro, '2P', false); }
  if (e.cursores[0]) { const [x, y] = posicaoNaGrade(e.cursores[0]); molduraDoCursor(q, x - (e.cursores[0] === e.cursores[1] ? 2 : 0), y - (e.cursores[0] === e.cursores[1] ? 2 : 0), 32 + (e.cursores[0] === e.cursores[1] ? 4 : 0), P.ki, '1P', true); }
  // cenário e rounds: clicar abre as opções
  painel(q, 134, 158, 116, 20);
  colar(q, recorte(fundoDoCenario(e.cenario), 150, 124, 34, 20), 135, 158);
  retangulo(q, 169, 158, 1, 20, P.contorno);
  texto(q, caber(NOMES_DOS_CENARIOS[e.cenario], 76), 173, 161, P.branco);
  texto(q, textoDosRounds(e.rounds), 173, 170, P.ouro);
  regioes.push({ x: 132, y: 156, l: 120, a: 24, alvo: { tipo: 'opcoes' } });
  if (e.botao) {
    botao(q, e.botao.rotulo, 134, 184, 116, e.botao.aceso, e.botao.ativo);
    if (e.botao.ativo) regioes.push({ x: 133, y: 183, l: 118, a: 13, alvo: { tipo: 'botao' } });
  } else if (e.recado) {
    texto(q, caber(e.recado, 124), 192, 187, P.lilas, { alinhar: 'centro' });
  }
  texto(q, caber(e.legenda, W - 10), W / 2, 206, P.lilas, { alinhar: 'centro' });
  faixaDeAviso(q, e.aviso);
  return regioes;
}

// ———— o convite ————

export type LinhaDoConvite =
  | { tipo: 'grupo'; rotulo: string }
  | { tipo: 'pessoa'; nome: string; foto: Quadro | null; situacao: 'livre' | 'chamado' | 'recusou' | 'naArena' };

export type DadosDoConvite = { linhas: LinhaDoConvite[]; selecionada: number };

const VISIVEIS = 8;

/** A foto que ainda não chegou (ou não existe): a inicial num quadrado lilás. */
function fotoOuInicial(q: Quadro, nome: string, foto: Quadro | null, x: number, y: number) {
  retangulo(q, x - 1, y - 1, 16, 16, P.contorno);
  if (foto) { colar(q, foto, x, y); return; }
  degrade(q, x, y, 14, 14, P.lilasEscuro, P.vazio);
  texto(q, nome.slice(0, 1).toUpperCase(), x + 7, y + 5, P.branco, { contorno: undefined, alinhar: 'centro' });
}

export function desenharConvite(q: Quadro, c: DadosDoConvite): Regiao[] {
  escurecer(q, 0.62);
  painel(q, 82, 20, 220, 180);
  const t = letreiro('CONVIDAR', 1, DOURADO_CURTO);
  colar(q, t, Math.round(W / 2 - t.largura / 2), 13);
  const regioes: Regiao[] = [];
  // rola para a selecionada caber: as linhas de pessoa contam 20 px, os grupos 14
  const altura = (l: LinhaDoConvite) => (l.tipo === 'grupo' ? 14 : 20);
  let inicio = 0;
  const somar = (de: number, ate: number) => c.linhas.slice(de, ate + 1).reduce((s, l) => s + altura(l), 0);
  while (inicio < c.selecionada && somar(inicio, c.selecionada) > 146) inicio++;
  let y = 38;
  if (c.linhas.every((l) => l.tipo === 'grupo') || c.linhas.length === 0) {
    texto(q, 'NINGUÉM ONLINE PARA CHAMAR', W / 2, 96, P.lilas, { alinhar: 'centro' });
  }
  for (let i = inicio; i < c.linhas.length && y + altura(c.linhas[i]) <= 186; i++) {
    const l = c.linhas[i];
    if (l.tipo === 'grupo') {
      texto(q, l.rotulo, 94, y + 4, P.lilas);
      retangulo(q, 94 + medir(l.rotulo) + 4, y + 6, 192 - medir(l.rotulo), 1, P.lilasEscuro);
      y += 14;
      continue;
    }
    const aceso = i === c.selecionada;
    if (aceso) { retangulo(q, 88, y - 2, 208, 19, P.realce); seta(q, 90, y + 5, 1, P.ouro); }
    fotoOuInicial(q, l.nome, l.foto, 97, y);
    texto(q, caber(l.nome, 110), 117, y + 5, l.situacao === 'naArena' ? P.cinza : P.branco);
    if (l.situacao === 'livre' || l.situacao === 'recusou') {
      const rotulo = l.situacao === 'recusou' ? 'DE NOVO' : 'CHAMAR';
      if (l.situacao === 'recusou' && !aceso) texto(q, 'RECUSOU', 288, y + 5, P.vinhoClaro, { alinhar: 'direita' });
      else {
        const lb = medir(rotulo) + 8;
        botao(q, rotulo, 290 - lb, y + 2, lb, aceso);
      }
    } else if (l.situacao === 'chamado') {
      texto(q, aceso ? 'CANCELAR' : 'CHAMADO...', 288, y + 5, aceso ? P.ouro : P.ki, { alinhar: 'direita' });
    } else {
      texto(q, 'NA ARENA', 288, y + 5, P.cinza, { alinhar: 'direita' });
    }
    regioes.push({ x: 88, y: y - 2, l: 208, a: 19, alvo: { tipo: 'pessoa', indice: i } });
    y += 20;
  }
  if (inicio > 0) seta(q, W / 2 - 1, 30, 1, P.lilas);
  texto(q, 'ENTER CHAMAR   ESC VOLTAR', W / 2, 190, P.lilas, { alinhar: 'centro' });
  return regioes;
}

// ———— as opções ————

export type DadosDasOpcoes = {
  linha: number;
  cenario: IdDoCenario;
  rounds: 1 | 2;
  /** 0 a 1. */
  volume: number;
  /** Cenário e rounds são de quem abriu a arena; para os outros (e sem arena), a linha fica apagada. */
  mudaArena: boolean;
};

/** As linhas que se escolhem, na ordem: cenário, rounds, som e voltar. */
export const LINHAS_DAS_OPCOES = ['cenario', 'rounds', 'som', 'voltar'] as const;

/** As teclas da luta, como no `teclado.ts`. A seta para baixo não existe na fonte pequena: `↓` é desenhada à mão. */
const CONTROLES: [string, string][] = [['SETAS', 'ANDAR'], ['J', 'SOCO'], ['K', 'CHUTE'], ['L', 'RAJADA'], ['I', 'CARREGAR'], ['O', 'ESPECIAL'], ['↓ O', 'SUPER'], ['U', 'SUMIR'], ['P', 'TRANSFORMAR']];

/** A tecla desenhada como tecla: fundo claro, letra escura. Devolve a largura. */
function tecla(q: Quadro, k: string, x: number, y: number): number {
  const seta = k.startsWith('↓');
  const resto = seta ? k.slice(1).trim() : k;
  const l = medir(resto) + 4 + (seta ? 5 : 0);
  retangulo(q, x - 1, y - 2, l + 2, 9, P.contorno);
  retangulo(q, x, y - 1, l, 7, P.aro);
  if (seta) {
    retangulo(q, x + 3, y, 1, 3, P.contorno);
    for (let i = 0; i < 3; i++) retangulo(q, x + 3 - (2 - i), y + 2 + i, 2 * (2 - i) + 1, 1, P.contorno);
  }
  escrever(q, resto, x + 2 + (seta ? 5 : 0), y, P.contorno);
  return l;
}

export function desenharOpcoes(q: Quadro, o: DadosDasOpcoes): Regiao[] {
  escurecer(q, 0.62);
  painel(q, 40, 24, 304, 176);
  const t = letreiro('OPÇÕES', 1, DOURADO_CURTO);
  colar(q, t, Math.round(W / 2 - t.largura / 2), 12);
  const regioes: Regiao[] = [];
  const rotulo = (texto_: string, y: number, indice: number, apagado = false) => {
    const aceso = o.linha === indice;
    if (aceso) seta(q, 50, y, 1, P.ouro);
    texto(q, texto_, 58, y, apagado ? P.cinza : aceso ? P.ouro : P.aro, { corDeBaixo: apagado ? undefined : aceso ? P.ouroSombra : P.lilas });
    regioes.push({ x: 44, y: y - 4, l: 104, a: 13, alvo: { tipo: 'linha', indice } });
  };
  const setas = (y: number, indice: number, ativo: boolean, xEsq = 150, xDir = 256) => {
    const c = !ativo ? P.vazio : o.linha === indice ? P.ouro : P.lilas;
    seta(q, xEsq, y, -1, c);
    seta(q, xDir, y, 1, c);
    if (ativo) {
      regioes.push({ x: xEsq - 4, y: y - 5, l: 12, a: 15, alvo: { tipo: 'linha', indice, passo: -1 } });
      regioes.push({ x: xDir - 4, y: y - 5, l: 12, a: 15, alvo: { tipo: 'linha', indice, passo: 1 } });
    }
  };
  // cenário
  rotulo('CENÁRIO', 54, 0, !o.mudaArena);
  setas(52, 0, o.mudaArena);
  retangulo(q, 157, 36, 94, 40, P.contorno);
  colar(q, recorte(fundoDoCenario(o.cenario), 140, 132, 92, 38), 158, 37);
  if (!o.mudaArena) escurecer(q, 0.45, 158, 37, 92, 38);
  texto(q, NOMES_DOS_CENARIOS[o.cenario], 204, 80, o.mudaArena ? P.branco : P.cinza, { alinhar: 'centro' });
  texto(q, `${IDS_DOS_CENARIOS.indexOf(o.cenario) + 1} DE ${IDS_DOS_CENARIOS.length}`, 290, 54, P.lilas);
  // rounds
  rotulo('ROUNDS', 98, 1, !o.mudaArena);
  setas(96, 1, o.mudaArena);
  texto(q, textoDosRounds(o.rounds), 204, 98, o.mudaArena ? P.branco : P.cinza, { alinhar: 'centro' });
  // som
  rotulo('SOM DO JOGO', 118, 2);
  setas(116, 2, true, 150, 250);
  const cheios = Math.round(o.volume * 10);
  for (let i = 0; i < 10; i++) {
    retangulo(q, 157 + i * 9, 113, 8, 11, P.contorno);
    retangulo(q, 158 + i * 9, 114, 6, 9, i < cheios ? (i < 5 ? P.ki : i < 8 ? P.ouro : P.laranja) : P.vazio);
  }
  texto(q, `${Math.round(o.volume * 100)}%`, 260, 118, P.branco);
  const lb = medir('T TESTAR') + 8;
  botao(q, 'T TESTAR', 336 - lb, 115, lb, false, o.volume > 0);
  if (o.volume > 0) regioes.push({ x: 335 - lb, y: 114, l: lb + 2, a: 13, alvo: { tipo: 'testar' } });
  // controles
  texto(q, 'CONTROLES', 58, 138, P.aro, { corDeBaixo: P.lilas });
  CONTROLES.forEach(([k, v], i) => {
    const x = 158 + (i % 3) * 60, y = 138 + Math.floor(i / 3) * 12;
    texto(q, v, x + tecla(q, k, x, y) + 3, y, P.branco);
  });
  texto(q, 'SEGURE PARA TRÁS PARA DEFENDER', 158, 176, P.lilas);
  rotulo('VOLTAR', 188, 3);
  if (!o.mudaArena) texto(q, 'CENÁRIO E ROUNDS: SÓ QUEM ABRE A ARENA', 336, 188, P.lilas, { alinhar: 'direita' });
  return regioes;
}

// ———— o VS ————

export type DadosDoVs = {
  lados: [{ jogador: string; lutador: IdDoLutador }, { jogador: string; lutador: IdDoLutador }];
  cenario: IdDoCenario;
  rounds: 1 | 2;
};

let fundoDoVs: Quadro | null = null;
export function desenharVs(q: Quadro, v: DadosDoVs) {
  if (!fundoDoVs) {
    fundoDoVs = criarQuadro(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const esq = x < W / 2 + (y - H / 2) * 0.5;
      const faixa = ((x + y * 2) >> 3) % 2 === 0;
      pixel(fundoDoVs, x, y, misturar(esq ? (faixa ? P.azul : P.azulEscuro) : (faixa ? P.vinho : P.vinhoEscuro), P.contorno, 0.25));
    }
  }
  copiarPara(q, fundoDoVs);
  const [a, b] = v.lados;
  colarLutador(q, a.lutador, formaNaEscolha(a.lutador), 'socoForte', 110, 186, 2, false);
  colarLutador(q, b.lutador, formaNaEscolha(b.lutador), 'rajada', 274, 186, 2, true);
  const vs = letreiro('VS', 3, DOURADO);
  colar(q, vs, Math.round(W / 2 - vs.largura / 2), 70);
  const qa = nomeGrande(q, FICHAS[a.lutador].nome.toUpperCase(), 12, 12, 170, 'esquerda', P.azulClaro);
  texto(q, caber(a.jogador, 170), 12, qa ? 38 : 30, P.azulClaro);
  const qb = nomeGrande(q, FICHAS[b.lutador].nome.toUpperCase(), W - 12, 12, 170, 'direita', P.vinhoClaro);
  texto(q, caber(b.jogador, 170), W - 12, qb ? 38 : 30, P.vinhoClaro, { alinhar: 'direita' });
  escurecer(q, 0.7, 0, 196, W, 20);
  texto(q, `${NOMES_DOS_CENARIOS[v.cenario]}   ${textoDosRounds(v.rounds)}`, W / 2, 204, P.ouro, { alinhar: 'centro' });
}

// ———— o fim ————

export type DadosDoFim = {
  /** 0 ou 1 é o lado que venceu; 2 é empate; nulo é luta sem resultado. */
  vencedor: 0 | 1 | 2 | null;
  lados: [{ jogador: string; lutador: IdDoLutador } | null, { jogador: string; lutador: IdDoLutador } | null];
  motivo: 'luta' | 'abandono' | 'semResultado' | null;
  cenario: IdDoCenario;
  itens: ItemDeMenu[];
  selecionado: number;
  aviso?: string | null;
};

export function desenharFim(q: Quadro, f: DadosDoFim): Regiao[] {
  copiarPara(q, fundoDoCenario(f.cenario, 128));
  escurecer(q, 0.45);
  const venceu = f.vencedor === 0 || f.vencedor === 1 ? f.lados[f.vencedor] : null;
  const titulo = venceu ? 'VITÓRIA!' : f.vencedor === 2 ? 'EMPATE' : 'FIM DA LUTA';
  const v = letreiro(titulo, 2, DOURADO);
  colar(q, v, Math.round(W / 2 - v.largura / 2), 4);
  if (venceu) colarLutador(q, venceu.lutador, formaNaEscolha(venceu.lutador), 'vitoria', 118, 196, 2, f.vencedor === 1);
  else {
    if (f.lados[0]) colarLutador(q, f.lados[0].lutador, 0, 'derrota', 70, 196, 2, false);
    if (f.lados[1]) colarLutador(q, f.lados[1].lutador, 0, 'derrota', 160, 196, 2, true);
  }
  painel(q, 206, 64, 156, 116);
  const perdeu = f.vencedor === 0 ? f.lados[1] : f.vencedor === 1 ? f.lados[0] : null;
  if (venceu) {
    texto(q, caber(`${venceu.jogador} VENCEU`, 148), 284, 74, P.branco, { alinhar: 'centro' });
    texto(q, caber(`COM ${artigo(venceu.lutador)} ${FICHAS[venceu.lutador].nome}`, 148), 284, 84, f.vencedor === 0 ? P.azulClaro : P.vinhoClaro, { alinhar: 'centro' });
  } else {
    texto(q, f.vencedor === 2 ? 'NINGUÉM VENCEU' : 'A LUTA NÃO TERMINOU', 284, 78, P.branco, { alinhar: 'centro' });
  }
  const detalhe = f.motivo === 'abandono' && perdeu ? `${perdeu.jogador} DESISTIU` : f.motivo === 'semResultado' ? 'SEM RESULTADO' : `NO ${NOMES_DOS_CENARIOS[f.cenario]}`;
  texto(q, caber(detalhe, 148), 284, 98, P.ouro, { alinhar: 'centro' });
  const regioes = menuVertical(q, f.itens, f.selecionado, 284, 124, 14, 120);
  faixaDeAviso(q, f.aviso);
  return regioes;
}

// ———— a pergunta (desistir, fechar a arena) ————

export type DadosDaPergunta = { titulo: string; detalhe: string; itens: ItemDeMenu[]; selecionado: number };

export function desenharPergunta(q: Quadro, p: DadosDaPergunta): Regiao[] {
  escurecer(q, 0.6);
  painel(q, 102, 58, 180, 100);
  const t = letreiro(p.titulo, 1, DOURADO_CURTO);
  colar(q, t, Math.round(W / 2 - t.largura / 2), 50);
  texto(q, caber(p.detalhe, 170), W / 2, 84, P.aro, { alinhar: 'centro' });
  return menuVertical(q, p.itens, p.selecionado, W / 2, 110, 14, 100);
}

// ———— o cartão de convite ————

export const CARTAO = { largura: 184, altura: 72 };

export type DadosDoCartao = {
  de: string;
  foto: Quadro | null;
  cenario: IdDoCenario;
  rounds: 1 | 2;
  contra: IdDoLutador | null;
  servidor: string | null;
  apontado: 'aceitar' | 'recusar' | null;
};

export function desenharCartaoDeConvite(q: Quadro, c: DadosDoCartao): Regiao[] {
  const { largura: L, altura: A } = CARTAO;
  q.px.fill(0);
  painel(q, 2, 2, L - 4, A - 4, P.fundo, P.fundoEscuro, P.ouro);
  // o cenário da arena ao fundo, bem escuro, atrás do texto
  const capa = recorte(fundoDoCenario(c.cenario), 150, 110, L - 4, A - 4);
  escurecer(capa, 0.7);
  colar(q, capa, 2, 2);
  esferaQuadrada(q, 8, 7, 11, 4);
  texto(q, 'CONVITE PARA LUTAR', 24, 10, P.ouro, { corDeBaixo: P.ouroSombra });
  fotoOuInicial(q, c.de, c.foto, 8, 24);
  texto(q, caber(`${c.de} TE CHAMOU`, 150), 28, 25, P.branco);
  const detalhe = [NOMES_DOS_CENARIOS[c.cenario], textoDosRounds(c.rounds)].join(' - ');
  texto(q, caber(c.contra ? `${detalhe} - ${FICHAS[c.contra].nome}` : detalhe, 150), 28, 34, P.lilas);
  if (c.servidor) texto(q, caber(`EM ${c.servidor}`, 150), 28, 43, P.cinza);
  const regioes: Regiao[] = [];
  const lb1 = 56, lb2 = 64;
  botao(q, 'LUTAR', L - lb1 - lb2 - 12, A - 16, lb1, c.apontado !== 'recusar');
  botao(q, 'RECUSAR', L - lb2 - 6, A - 16, lb2, c.apontado === 'recusar');
  regioes.push({ x: L - lb1 - lb2 - 13, y: A - 17, l: lb1 + 2, a: 13, alvo: { tipo: 'aceitar' } });
  regioes.push({ x: L - lb2 - 7, y: A - 17, l: lb2 + 2, a: 13, alvo: { tipo: 'recusar' } });
  return regioes;
}
