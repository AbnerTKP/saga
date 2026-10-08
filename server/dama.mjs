// As regras da dama brasileira, e só elas — escolha do dono em 07/10/2026, contra a americana.
//
// Como no xadrez, quem valida o lance é o SERVIDOR: o app só mostra a rota que a peça pode
// fazer, e quem diz se valeu é daqui. A captura obrigatória pela MAIOR quantidade é justamente
// o tipo de regra em que duas cópias, uma em cada ponta, discordariam — e quem perderia a
// partida seria quem confiou na tela.
//
// O que vale, da regra oficial (CBJD):
// - 8x8, jogo nas casas escuras (a1 é escura), 12 pedras de cada lado, as brancas começam.
// - A pedra anda uma casa na diagonal, para a frente. CAPTURA para a frente e para trás.
// - A dama anda quantas casas quiser na diagonal livre, e captura de longe: passa por casas
//   vazias, salta UMA peça do outro e pousa em qualquer casa vazia depois dela.
// - Capturar é obrigatório, e entre as capturas possíveis é obrigatória a que toma MAIS peças
//   (pedra e dama valem o mesmo). Empatadas no máximo, quem joga escolhe.
// - Numa captura de várias, as peças tomadas só saem do tabuleiro no fim: até lá elas ocupam
//   a casa (não se pousa nem se passa por elas) e não se salta a mesma duas vezes.
// - A pedra vira dama ao TERMINAR o lance na última fileira. Se chega lá no meio de uma
//   captura que continua, segue capturando como pedra e não vira dama.
// - Perde quem fica sem peças ou sem lance.
// - Empate: a mesma posição três vezes, ou 20 lances de cada lado só de damas, sem captura
//   nem lance de pedra.
//
// Puro como o xadrez: sem banco, sem HTTP, sem relógio. O tabuleiro é o vetor de 64 casas na
// ordem do FEN do xadrez (a8 = 0, h1 = 63), com 'P'/'D' para as brancas e 'p'/'d' para as
// pretas — a mesma leitura de casas que o app já tem para o xadrez serve para a dama.

export const POSICAO_INICIAL = '1p1p1p1p/p1p1p1p1/1p1p1p1p/8/8/P1P1P1P1/1P1P1P1P/P1P1P1P1 w 0';

/** Lances seguidos só de damas, sem captura nem pedra, que empatam: 20 de cada lado. */
export const LANCES_DE_DAMA_PARA_EMPATE = 40;

/** Lance que não vale, ou posição que não se lê. A mensagem é para gente: pode ir para a tela. */
export class ErroDeLance extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeLance';
  }
}

const ARQUIVOS = 'abcdefgh';
const DIRECOES = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const nomeDe = (i) => `${ARQUIVOS[i % 8]}${8 - Math.floor(i / 8)}`;
const ehNomeDeCasa = (s) => typeof s === 'string' && /^[a-h][1-8]$/.test(s);
const indiceDe = (nome) => (8 - Number(nome[1])) * 8 + ARQUIVOS.indexOf(nome[0]);
const dentro = (l, c) => l >= 0 && l < 8 && c >= 0 && c < 8;
const ladoDe = (p) => (p === p.toUpperCase() ? 'w' : 'b');
const ehDama = (p) => p === 'D' || p === 'd';
/** A fileira em que a pedra vira dama, contada de cima (0 é a fileira 8). */
const ultimaFileira = (lado) => (lado === 'w' ? 0 : 7);

// ---- ler e escrever ------------------------------------------------------------------

/** Lê "colocação vez contador". O contador é o dos lances seguidos só de damas. */
export function lerFen(fen) {
  if (typeof fen !== 'string') throw new ErroDeLance('Posição inválida.');
  const [colocacao, vez, contador = '0'] = fen.trim().split(/\s+/);
  const linhas = (colocacao ?? '').split('/');
  if (linhas.length !== 8) throw new ErroDeLance('Posição inválida: o tabuleiro tem oito fileiras.');
  const casas = [];
  for (const linha of linhas) {
    let n = 0;
    for (const ch of linha) {
      if (ch >= '1' && ch <= '8') { for (let k = 0; k < Number(ch); k++) casas.push(null); n += Number(ch); continue; }
      if (!'PDpd'.includes(ch)) throw new ErroDeLance(`Posição inválida: "${ch}" não é peça de dama.`);
      casas.push(ch);
      n++;
    }
    if (n !== 8) throw new ErroDeLance('Posição inválida: cada fileira tem oito casas.');
  }
  casas.forEach((p, i) => {
    if (p && (Math.floor(i / 8) + (i % 8)) % 2 === 0) throw new ErroDeLance(`Posição inválida: peça em casa clara (${nomeDe(i)}).`);
  });
  if (vez !== 'w' && vez !== 'b') throw new ErroDeLance('Posição inválida: a vez é das brancas ou das pretas.');
  const semCaptura = Number(contador);
  if (!Number.isInteger(semCaptura) || semCaptura < 0) throw new ErroDeLance('Posição inválida: o contador é um número.');
  return { casas, vez, semCaptura };
}

export function escreverFen(posicao) {
  const linhas = [];
  for (let l = 0; l < 8; l++) {
    let linha = '', vazias = 0;
    for (let c = 0; c < 8; c++) {
      const p = posicao.casas[l * 8 + c];
      if (!p) { vazias++; continue; }
      if (vazias) { linha += vazias; vazias = 0; }
      linha += p;
    }
    if (vazias) linha += vazias;
    linhas.push(linha);
  }
  return `${linhas.join('/')} ${posicao.vez} ${posicao.semCaptura}`;
}

// ---- os lances -----------------------------------------------------------------------

/**
 * Todas as capturas da peça em `origem`, até o fim de cada sequência. A peça sai da casa de
 * origem enquanto anda (ela pode passar por ela de novo, dando a volta), e as tomadas ficam
 * onde estão até o fim — é o que impede pousar nelas ou saltá-las duas vezes.
 */
function capturasDe(casas, origem) {
  const peca = casas[origem];
  const lado = ladoDe(peca);
  const dama = ehDama(peca);
  const tab = casas.slice();
  tab[origem] = null;
  const sequencias = [];

  const andar = (de, caminho, tomadas) => {
    const l0 = Math.floor(de / 8), c0 = de % 8;
    let continuou = false;
    for (const [dl, dc] of DIRECOES) {
      let l = l0 + dl, c = c0 + dc;
      if (dama) while (dentro(l, c) && !tab[l * 8 + c]) { l += dl; c += dc; }
      if (!dentro(l, c)) continue;
      const alvo = l * 8 + c;
      const p = tab[alvo];
      if (!p || ladoDe(p) === lado || tomadas.includes(alvo)) continue;
      // Depois da peça tomada: a pedra pousa logo atrás; a dama, em qualquer casa livre adiante.
      let ll = l + dl, cc = c + dc;
      while (dentro(ll, cc) && !tab[ll * 8 + cc]) {
        const pouso = ll * 8 + cc;
        continuou = true;
        andar(pouso, [...caminho, pouso], [...tomadas, alvo]);
        if (!dama) break;
        ll += dl; cc += dc;
      }
    }
    if (!continuou && tomadas.length) sequencias.push({ caminho, tomadas });
  };

  andar(origem, [], []);
  return sequencias;
}

function simplesDe(casas, origem) {
  const peca = casas[origem];
  const lado = ladoDe(peca);
  const l0 = Math.floor(origem / 8), c0 = origem % 8;
  const frente = lado === 'w' ? -1 : 1;
  const destinos = [];
  for (const [dl, dc] of DIRECOES) {
    if (!ehDama(peca) && dl !== frente) continue;
    let l = l0 + dl, c = c0 + dc;
    while (dentro(l, c) && !casas[l * 8 + c]) {
      destinos.push(l * 8 + c);
      if (!ehDama(peca)) break;
      l += dl; c += dc;
    }
  }
  return destinos;
}

/** O lance como sai daqui: casas pelo nome, que vira JSON sem conversão. */
function descrever(origem, caminho, tomadas) {
  const nomes = caminho.map(nomeDe);
  return {
    de: nomeDe(origem),
    para: nomes.at(-1),
    caminho: nomes,
    capturadas: tomadas.map(nomeDe),
    san: tomadas.length ? [nomeDe(origem), ...nomes].join('x') : `${nomeDe(origem)}-${nomes[0]}`,
  };
}

/**
 * Os lances que valem para quem tem a vez. Havendo captura, só as capturas que tomam o
 * máximo de peças; não havendo, os lances simples.
 */
export function lancesLegais(posicao) {
  const { casas, vez } = posicao;
  const minhas = [];
  casas.forEach((p, i) => { if (p && ladoDe(p) === vez) minhas.push(i); });

  const capturas = [];
  for (const i of minhas) for (const s of capturasDe(casas, i)) capturas.push({ origem: i, ...s });
  if (capturas.length) {
    const maximo = Math.max(...capturas.map((s) => s.tomadas.length));
    return capturas.filter((s) => s.tomadas.length === maximo).map((s) => descrever(s.origem, s.caminho, s.tomadas));
  }
  const simples = [];
  for (const i of minhas) for (const d of simplesDe(casas, i)) simples.push(descrever(i, [d], []));
  return simples;
}

/**
 * Joga um lance e devolve a posição nova; a de entrada não é tocada. O lance é `de` e
 * `para` e, quando há mais de um caminho entre as duas casas (só acontece com dama), o
 * `caminho` inteiro — as casas onde ela pousa, terminando em `para`.
 */
export function jogar(posicao, { de, para, caminho } = {}) {
  if (!ehNomeDeCasa(de) || !ehNomeDeCasa(para)) throw new ErroDeLance('O lance precisa de casa de saída e de chegada.');
  const todos = lancesLegais(posicao);
  let candidatos = todos.filter((l) => l.de === de && l.para === para);
  if (Array.isArray(caminho) && caminho.length) {
    candidatos = candidatos.filter((l) => l.caminho.length === caminho.length && l.caminho.every((c, k) => c === caminho[k]));
  }
  if (!candidatos.length) {
    if (todos.some((l) => l.capturadas.length) && !todos.some((l) => l.de === de && l.para === para)) {
      throw new ErroDeLance('A captura é obrigatória, e tem de ser a que toma mais peças.');
    }
    throw new ErroDeLance('Esse lance não vale nesta posição.');
  }
  if (candidatos.length > 1) throw new ErroDeLance('Esse lance tem mais de um caminho: escolha por onde ir.');
  const lance = candidatos[0];

  const casas = posicao.casas.slice();
  const origem = indiceDe(lance.de), destino = indiceDe(lance.para);
  let peca = casas[origem];
  const eraPedra = !ehDama(peca);
  casas[origem] = null;
  for (const t of lance.capturadas) casas[indiceDe(t)] = null;
  if (eraPedra && Math.floor(destino / 8) === ultimaFileira(ladoDe(peca))) peca = peca === 'P' ? 'D' : 'd';
  casas[destino] = peca;

  const soDeDama = !eraPedra && !lance.capturadas.length;
  return {
    posicao: { casas, vez: posicao.vez === 'w' ? 'b' : 'w', semCaptura: soDeDama ? posicao.semCaptura + 1 : 0 },
    lance,
  };
}

// ---- como está a partida -------------------------------------------------------------

/** A posição para contar repetição: a colocação e a vez, sem o contador. */
export function chaveDeRepeticao(posicao) {
  const [colocacao, vez] = escreverFen(posicao).split(' ');
  return `${colocacao} ${vez}`;
}

/**
 * Se a partida acabou, e como. Não existe xeque na dama: o campo vai sempre falso, para a
 * mesa tratar os dois jogos do mesmo jeito.
 */
export function situacao(posicao, chaves = []) {
  const vez = posicao.vez;
  const outro = vez === 'w' ? 'b' : 'w';
  const resposta = (fim) => ({ vez, xeque: false, fim });
  if (!posicao.casas.some((p) => p && ladoDe(p) === vez)) return resposta({ motivo: 'semPecas', vencedor: outro });
  if (!lancesLegais(posicao).length) return resposta({ motivo: 'semLances', vencedor: outro });
  if (posicao.semCaptura >= LANCES_DE_DAMA_PARA_EMPATE) return resposta({ motivo: 'vinteLances', vencedor: null });
  const chave = chaveDeRepeticao(posicao);
  if (chaves.filter((k) => k === chave).length >= 3) return resposta({ motivo: 'repeticao', vencedor: null });
  return resposta(null);
}
