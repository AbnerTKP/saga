// As regras do xadrez, e só elas.
//
// Quem valida o lance é o SERVIDOR, não o app de quem joga: o app de um só mostra para onde a
// peça pode ir; quem diz se valeu é daqui. Sem isso, um app velho ou mexido poria qualquer
// posição no tabuleiro dos outros — e quem chega para assistir no meio da partida precisa
// ver o mesmo tabuleiro que os jogadores, que só existe se um lugar só decide.
//
// Puro de propósito: sem banco, sem HTTP, sem relógio. A partida guarda FEN e lances; tudo
// o que se pergunta sobre ela sai daqui. É a parte que dá para errar em silêncio (um roque
// que atravessa casa atacada, um en passant que descobre o próprio rei), então é a parte
// testada contra as contagens de perft que todo motor de xadrez usa como prova.
//
// Por dentro, o tabuleiro é um vetor de 64 casas na ordem do FEN (a8 = 0, h1 = 63) e o lance
// é um número. Não é enfeite: a contagem de perft visita meio milhão de posições, e objeto
// novo por lance a deixaria lenta demais para rodar junto com o resto dos testes. Para fora
// sai sempre o objeto simples — `Posicao` e `Lance` — que vira JSON sem conversão.

export const POSICAO_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Lance que não vale, ou FEN que não se lê. A mensagem é para gente: pode ir para a tela. */
export class ErroDeLance extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeLance';
  }
}

// ---- peças e casas -------------------------------------------------------------------

const PEAO = 1, CAVALO = 2, BISPO = 3, TORRE = 4, DAMA = 5, REI = 6;
const BRANCO = 0, PRETO = 8;
const LETRAS = ' pnbrqk';
const ARQUIVOS = 'abcdefgh';

const codigoDe = (letra) => {
  const tipo = LETRAS.indexOf(letra.toLowerCase());
  return tipo | (letra === letra.toLowerCase() ? PRETO : BRANCO);
};
const letraDe = (codigo) => {
  const letra = LETRAS[codigo & 7];
  return codigo & PRETO ? letra : letra.toUpperCase();
};
const nomeDaCasa = (casa) => `${ARQUIVOS[casa & 7]}${8 - (casa >> 3)}`;
const casaDoNome = (nome) => (8 - Number(nome[1])) * 8 + ARQUIVOS.indexOf(nome[0]);
const ehNomeDeCasa = (nome) => typeof nome === 'string' && /^[a-h][1-8]$/.test(nome);

// Roque em bits: K = 1, Q = 2, k = 4, q = 8. A máscara diz o que sobra quando um lance sai
// de uma casa ou chega nela: mexeu o rei, perde os dois; mexeu (ou perdeu) a torre, perde
// aquele lado. Uma tabela só cobre as duas coisas — inclusive a torre capturada em casa.
const ROQUES = [['K', 1], ['Q', 2], ['k', 4], ['q', 8]];
const MASCARA_DE_ROQUE = new Int8Array(64).fill(15);
MASCARA_DE_ROQUE[60] = 12; MASCARA_DE_ROQUE[63] = 14; MASCARA_DE_ROQUE[56] = 13;
MASCARA_DE_ROQUE[4] = 3; MASCARA_DE_ROQUE[7] = 11; MASCARA_DE_ROQUE[0] = 7;

// Tabelas de alcance, feitas uma vez: para cada casa, onde o cavalo e o rei chegam e as
// casas de cada raio, já cortadas na borda. É o que tira da geração de lances toda conta
// de "saiu do tabuleiro?".
function casasAPartirDe(casa, passos, repetir) {
  const linha = casa >> 3, coluna = casa & 7;
  return passos.map(([dl, dc]) => {
    const raio = [];
    for (let l = linha + dl, c = coluna + dc; l >= 0 && l < 8 && c >= 0 && c < 8; l += dl, c += dc) {
      raio.push(l * 8 + c);
      if (!repetir) break;
    }
    return Int8Array.from(raio);
  });
}
const juntar = (listas) => Int8Array.from(listas.flatMap((l) => [...l]));
const SALTOS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const VIZINHOS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const RETAS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONAIS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ALCANCE_DO_CAVALO = [], ALCANCE_DO_REI = [], RAIOS_RETOS = [], RAIOS_DIAGONAIS = [];
for (let casa = 0; casa < 64; casa++) {
  ALCANCE_DO_CAVALO.push(juntar(casasAPartirDe(casa, SALTOS, false)));
  ALCANCE_DO_REI.push(juntar(casasAPartirDe(casa, VIZINHOS, false)));
  RAIOS_RETOS.push(casasAPartirDe(casa, RETAS, true));
  RAIOS_DIAGONAIS.push(casasAPartirDe(casa, DIAGONAIS, true));
}

// ---- o lance como número ---------------------------------------------------------------

const EN_PASSANT = 1, ROQUE = 2, DUPLO = 4;
const lance = (de, para, promocao = 0, marca = 0) => de | (para << 6) | (promocao << 12) | (marca << 15);
const origemDe = (l) => l & 63;
const destinoDe = (l) => (l >> 6) & 63;
const promocaoDe = (l) => (l >> 12) & 7;
const marcaDe = (l) => (l >> 15) & 7;

// ---- a posição por dentro --------------------------------------------------------------

function estadoDe(posicao) {
  const casas = new Int8Array(64);
  const reis = new Int8Array(2).fill(-1);
  for (let casa = 0; casa < 64; casa++) {
    const letra = posicao.casas[casa];
    if (!letra) continue;
    casas[casa] = codigoDe(letra);
    if (letra === 'K') reis[0] = casa;
    if (letra === 'k') reis[1] = casa;
  }
  let roque = 0;
  for (const [letra, bit] of ROQUES) if (posicao.roque.includes(letra)) roque |= bit;
  return {
    casas, reis, roque,
    vez: posicao.vez === 'w' ? BRANCO : PRETO,
    ep: posicao.enPassant ? casaDoNome(posicao.enPassant) : -1,
    meio: posicao.meiosLances,
    numero: posicao.numeroDoLance,
    pilha: [],
  };
}

function posicaoDe(e) {
  const casas = [];
  for (let casa = 0; casa < 64; casa++) casas.push(e.casas[casa] ? letraDe(e.casas[casa]) : null);
  return {
    casas,
    vez: e.vez === BRANCO ? 'w' : 'b',
    roque: ROQUES.filter(([, bit]) => e.roque & bit).map(([letra]) => letra).join(''),
    enPassant: e.ep >= 0 ? nomeDaCasa(e.ep) : null,
    meiosLances: e.meio,
    numeroDoLance: e.numero,
  };
}

/** A casa está atacada pelo lado `por`? É a pergunta do xeque, do roque e da legalidade. */
function atacada(e, casa, por) {
  const c = e.casas;
  const linha = casa >> 3, coluna = casa & 7;
  // O peão ataca para a frente dele: quem ataca a casa está uma fileira ATRÁS dela.
  if (por === BRANCO) {
    if (linha < 7) {
      if (coluna > 0 && c[casa + 7] === (BRANCO | PEAO)) return true;
      if (coluna < 7 && c[casa + 9] === (BRANCO | PEAO)) return true;
    }
  } else if (linha > 0) {
    if (coluna > 0 && c[casa - 9] === (PRETO | PEAO)) return true;
    if (coluna < 7 && c[casa - 7] === (PRETO | PEAO)) return true;
  }
  const cavalo = por | CAVALO, rei = por | REI;
  const saltos = ALCANCE_DO_CAVALO[casa];
  for (let i = 0; i < saltos.length; i++) if (c[saltos[i]] === cavalo) return true;
  const vizinhos = ALCANCE_DO_REI[casa];
  for (let i = 0; i < vizinhos.length; i++) if (c[vizinhos[i]] === rei) return true;
  const torre = por | TORRE, bispo = por | BISPO, dama = por | DAMA;
  const retos = RAIOS_RETOS[casa];
  for (let r = 0; r < 4; r++) {
    const raio = retos[r];
    for (let i = 0; i < raio.length; i++) {
      const p = c[raio[i]];
      if (p) { if (p === torre || p === dama) return true; break; }
    }
  }
  const diagonais = RAIOS_DIAGONAIS[casa];
  for (let r = 0; r < 4; r++) {
    const raio = diagonais[r];
    for (let i = 0; i < raio.length; i++) {
      const p = c[raio[i]];
      if (p) { if (p === bispo || p === dama) return true; break; }
    }
  }
  return false;
}

const emXeque = (e) => atacada(e, e.reis[e.vez >> 3], e.vez ^ PRETO);

function promocoes(de, para, lista) {
  lista.push(lance(de, para, DAMA), lance(de, para, TORRE), lance(de, para, BISPO), lance(de, para, CAVALO));
}

function gerarPeao(e, de, lista) {
  const c = e.casas, cor = e.vez;
  const passo = cor === BRANCO ? -8 : 8;
  const linha = de >> 3, coluna = de & 7;
  const promove = linha === (cor === BRANCO ? 1 : 6);
  const frente = de + passo;
  if (c[frente] === 0) {
    if (promove) promocoes(de, frente, lista);
    else {
      lista.push(lance(de, frente));
      if (linha === (cor === BRANCO ? 6 : 1) && c[frente + passo] === 0) lista.push(lance(de, frente + passo, 0, DUPLO));
    }
  }
  for (let lado = -1; lado <= 1; lado += 2) {
    if ((lado < 0 && coluna === 0) || (lado > 0 && coluna === 7)) continue;
    const alvo = frente + lado;
    const p = c[alvo];
    if (p !== 0 && (p & PRETO) !== cor) {
      if (promove) promocoes(de, alvo, lista);
      else lista.push(lance(de, alvo));
    } else if (alvo === e.ep) {
      lista.push(lance(de, alvo, 0, EN_PASSANT));
    }
  }
}

function gerarSaltos(e, de, alcance, lista) {
  const c = e.casas, cor = e.vez;
  for (let i = 0; i < alcance.length; i++) {
    const para = alcance[i];
    const p = c[para];
    if (p === 0 || (p & PRETO) !== cor) lista.push(lance(de, para));
  }
}

function gerarRaios(e, de, raios, lista) {
  const c = e.casas, cor = e.vez;
  for (let r = 0; r < 4; r++) {
    const raio = raios[r];
    for (let i = 0; i < raio.length; i++) {
      const para = raio[i];
      const p = c[para];
      if (p === 0) { lista.push(lance(de, para)); continue; }
      if ((p & PRETO) !== cor) lista.push(lance(de, para));
      break;
    }
  }
}

// Roque só com o caminho livre, a torre no lugar e o rei sem atravessar casa atacada — nem
// a de saída. A casa de chegada também é conferida aqui, embora a legalidade a pegasse
// depois: sai mais barato não gerar o lance.
function gerarRoques(e, lista) {
  const c = e.casas, cor = e.vez, inimigo = cor ^ PRETO;
  const livreESeguro = (vazias, seguras) =>
    vazias.every((casa) => c[casa] === 0) && seguras.every((casa) => !atacada(e, casa, inimigo));
  if (cor === BRANCO && e.reis[0] === 60) {
    if (e.roque & 1 && c[63] === (BRANCO | TORRE) && livreESeguro([61, 62], [60, 61, 62])) lista.push(lance(60, 62, 0, ROQUE));
    if (e.roque & 2 && c[56] === (BRANCO | TORRE) && livreESeguro([59, 58, 57], [60, 59, 58])) lista.push(lance(60, 58, 0, ROQUE));
  } else if (cor === PRETO && e.reis[1] === 4) {
    if (e.roque & 4 && c[7] === (PRETO | TORRE) && livreESeguro([5, 6], [4, 5, 6])) lista.push(lance(4, 6, 0, ROQUE));
    if (e.roque & 8 && c[0] === (PRETO | TORRE) && livreESeguro([3, 2, 1], [4, 3, 2])) lista.push(lance(4, 2, 0, ROQUE));
  }
}

/** Os lances que as peças fazem, sem olhar ainda se deixam o próprio rei em xeque. */
function gerar(e) {
  const lista = [];
  const c = e.casas, cor = e.vez;
  for (let casa = 0; casa < 64; casa++) {
    const p = c[casa];
    if (p === 0 || (p & PRETO) !== cor) continue;
    switch (p & 7) {
      case PEAO: gerarPeao(e, casa, lista); break;
      case CAVALO: gerarSaltos(e, casa, ALCANCE_DO_CAVALO[casa], lista); break;
      case BISPO: gerarRaios(e, casa, RAIOS_DIAGONAIS[casa], lista); break;
      case TORRE: gerarRaios(e, casa, RAIOS_RETOS[casa], lista); break;
      case DAMA: gerarRaios(e, casa, RAIOS_DIAGONAIS[casa], lista); gerarRaios(e, casa, RAIOS_RETOS[casa], lista); break;
      case REI: gerarSaltos(e, casa, ALCANCE_DO_REI[casa], lista); break;
    }
  }
  gerarRoques(e, lista);
  return lista;
}

function fazer(e, l) {
  const c = e.casas;
  const de = origemDe(l), para = destinoDe(l), promocao = promocaoDe(l), marca = marcaDe(l);
  const p = c[de];
  const cor = p & PRETO;
  let capturada = c[para];
  e.pilha.push(capturada, e.roque, e.ep, e.meio);
  if (marca === EN_PASSANT) {
    const casaDoPeao = cor === BRANCO ? para + 8 : para - 8;
    capturada = c[casaDoPeao];
    c[casaDoPeao] = 0;
  }
  c[para] = promocao ? (cor | promocao) : p;
  c[de] = 0;
  if (marca === ROQUE) {
    if (para === 62) { c[61] = c[63]; c[63] = 0; }
    else if (para === 58) { c[59] = c[56]; c[56] = 0; }
    else if (para === 6) { c[5] = c[7]; c[7] = 0; }
    else { c[3] = c[0]; c[0] = 0; }
  }
  if ((p & 7) === REI) e.reis[cor >> 3] = para;
  e.roque &= MASCARA_DE_ROQUE[de] & MASCARA_DE_ROQUE[para];
  e.ep = marca === DUPLO ? (de + para) >> 1 : -1;
  e.meio = (p & 7) === PEAO || capturada !== 0 ? 0 : e.meio + 1;
  if (cor === PRETO) e.numero++;
  e.vez = cor ^ PRETO;
}

function desfazer(e, l) {
  const c = e.casas;
  const de = origemDe(l), para = destinoDe(l), promocao = promocaoDe(l), marca = marcaDe(l);
  const meio = e.pilha.pop(), ep = e.pilha.pop(), roque = e.pilha.pop(), capturada = e.pilha.pop();
  const cor = e.vez ^ PRETO;
  const p = promocao ? (cor | PEAO) : c[para];
  c[de] = p;
  if (marca === EN_PASSANT) {
    c[para] = 0;
    c[cor === BRANCO ? para + 8 : para - 8] = (cor ^ PRETO) | PEAO;
  } else {
    c[para] = capturada;
  }
  if (marca === ROQUE) {
    if (para === 62) { c[63] = c[61]; c[61] = 0; }
    else if (para === 58) { c[56] = c[59]; c[59] = 0; }
    else if (para === 6) { c[7] = c[5]; c[5] = 0; }
    else { c[0] = c[3]; c[3] = 0; }
  }
  if ((p & 7) === REI) e.reis[cor >> 3] = de;
  e.roque = roque;
  e.ep = ep;
  e.meio = meio;
  if (cor === PRETO) e.numero--;
  e.vez = cor;
}

/** Faz o lance e pergunta se o rei de quem jogou ficou em xeque — é o que separa legal de ilegal. */
function deixaOReiSeguro(e, l) {
  const quem = e.vez;
  fazer(e, l);
  const seguro = !atacada(e, e.reis[quem >> 3], quem ^ PRETO);
  desfazer(e, l);
  return seguro;
}

const legais = (e) => gerar(e).filter((l) => deixaOReiSeguro(e, l));
const temLanceLegal = (e) => gerar(e).some((l) => deixaOReiSeguro(e, l));

// ---- FEN ---------------------------------------------------------------------------------

const fenInvalido = (motivo) => new ErroDeLance(`FEN inválido: ${motivo}.`);

/**
 * Lê um FEN. Aceita também o FEN de quatro campos, sem os relógios — que viram 0 e 1.
 *
 * Direito de roque que a posição já não permite (rei ou torre fora de casa) é descartado em
 * vez de recusado: não muda lance nenhum e é comum em FEN escrito à mão. O resto que não
 * pode existir recusa: rei a mais ou a menos, peão na primeira ou na última fileira, en
 * passant sem o peão que acabou de avançar, e o rei de quem NÃO joga em xeque — posição a
 * que nenhuma partida chega.
 */
export function lerFen(fen) {
  if (typeof fen !== 'string') throw fenInvalido('não é texto');
  const campos = fen.trim().split(/\s+/);
  if (campos.length !== 6 && campos.length !== 4) throw fenInvalido('são seis campos');
  const [colocacao, vez, roque, enPassant, meiosLances = '0', numeroDoLance = '1'] = campos;

  const linhas = colocacao.split('/');
  if (linhas.length !== 8) throw fenInvalido('o tabuleiro tem oito fileiras');
  const casas = [];
  for (const linha of linhas) {
    let largura = 0;
    let numeroAntes = false;
    for (const ch of linha) {
      if (ch >= '1' && ch <= '8') {
        if (numeroAntes) throw fenInvalido('dois números seguidos numa fileira');
        for (let i = 0; i < Number(ch); i++) casas.push(null);
        largura += Number(ch);
        numeroAntes = true;
      } else if ('pnbrqkPNBRQK'.includes(ch)) {
        casas.push(ch);
        largura += 1;
        numeroAntes = false;
      } else {
        throw fenInvalido(`"${ch}" não é peça`);
      }
    }
    if (largura !== 8) throw fenInvalido('toda fileira tem oito casas');
  }
  if (casas.filter((l) => l === 'K').length !== 1 || casas.filter((l) => l === 'k').length !== 1) {
    throw fenInvalido('cada lado tem um rei');
  }
  for (let casa = 0; casa < 8; casa++) {
    if ('pP'.includes(casas[casa]) || 'pP'.includes(casas[56 + casa])) throw fenInvalido('peão na primeira ou na última fileira');
  }

  if (vez !== 'w' && vez !== 'b') throw fenInvalido('a vez é "w" ou "b"');
  if (roque !== '-' && !/^K?Q?k?q?$/.test(roque)) throw fenInvalido('roque é "-" ou letras de KQkq');
  const noLugar = { K: casas[60] === 'K' && casas[63] === 'R', Q: casas[60] === 'K' && casas[56] === 'R', k: casas[4] === 'k' && casas[7] === 'r', q: casas[4] === 'k' && casas[0] === 'r' };
  const roqueQueVale = roque === '-' ? '' : [...roque].filter((letra) => noLugar[letra]).join('');

  let ep = null;
  if (enPassant !== '-') {
    if (!/^[a-h][36]$/.test(enPassant)) throw fenInvalido('en passant é "-" ou uma casa da 3ª ou 6ª fileira');
    const casa = casaDoNome(enPassant);
    const peao = vez === 'w' ? casa + 8 : casa - 8;
    const esperado = vez === 'w' ? 'p' : 'P';
    if (enPassant[1] !== (vez === 'w' ? '6' : '3') || casas[casa] !== null || casas[peao] !== esperado) {
      throw fenInvalido('en passant sem o peão que acabou de avançar');
    }
    ep = enPassant;
  }

  if (!/^\d+$/.test(meiosLances) || !/^\d+$/.test(numeroDoLance) || Number(numeroDoLance) < 1) {
    throw fenInvalido('os relógios são números');
  }
  const posicao = {
    casas, vez, roque: roqueQueVale, enPassant: ep,
    meiosLances: Number(meiosLances), numeroDoLance: Number(numeroDoLance),
  };
  const e = estadoDe(posicao);
  const quemNaoJoga = e.vez ^ PRETO;
  if (atacada(e, e.reis[quemNaoJoga >> 3], e.vez)) throw fenInvalido('o rei de quem não joga está em xeque');
  return posicao;
}

export function escreverFen(posicao) {
  const fileiras = [];
  for (let linha = 0; linha < 8; linha++) {
    let fileira = '';
    let vazias = 0;
    for (let coluna = 0; coluna < 8; coluna++) {
      const letra = posicao.casas[linha * 8 + coluna];
      if (!letra) { vazias += 1; continue; }
      if (vazias) { fileira += vazias; vazias = 0; }
      fileira += letra;
    }
    if (vazias) fileira += vazias;
    fileiras.push(fileira);
  }
  return [fileiras.join('/'), posicao.vez, posicao.roque || '-', posicao.enPassant || '-',
    posicao.meiosLances, posicao.numeroDoLance].join(' ');
}

// ---- lances para fora --------------------------------------------------------------------

/**
 * O lance em objeto, com a notação. A SAN é a de toda súmula (K Q R B N em inglês): é a que
 * qualquer programa de xadrez lê, e a tela desenha as peças por cima dela.
 */
function descrever(e, l, todos) {
  const c = e.casas;
  const de = origemDe(l), para = destinoDe(l), promocao = promocaoDe(l), marca = marcaDe(l);
  const p = c[de];
  const tipo = p & 7;
  const capturada = marca === EN_PASSANT ? ((e.vez ^ PRETO) | PEAO) : c[para];
  let san;
  if (marca === ROQUE) {
    san = (para & 7) === 6 ? 'O-O' : 'O-O-O';
  } else if (tipo === PEAO) {
    san = `${capturada ? `${ARQUIVOS[de & 7]}x` : ''}${nomeDaCasa(para)}${promocao ? `=${LETRAS[promocao].toUpperCase()}` : ''}`;
  } else {
    // Desambiguação: outra peça igual chegando à mesma casa. Primeiro a coluna de saída; se
    // ela não basta, a fileira; se nenhuma das duas basta sozinha, as duas.
    const rivais = todos.filter((o) => destinoDe(o) === para && origemDe(o) !== de && c[origemDe(o)] === p).map(origemDe);
    let origem = '';
    if (rivais.length) {
      if (!rivais.some((r) => (r & 7) === (de & 7))) origem = ARQUIVOS[de & 7];
      else if (!rivais.some((r) => r >> 3 === de >> 3)) origem = String(8 - (de >> 3));
      else origem = nomeDaCasa(de);
    }
    san = `${LETRAS[tipo].toUpperCase()}${origem}${capturada ? 'x' : ''}${nomeDaCasa(para)}`;
  }
  fazer(e, l);
  if (emXeque(e)) san += temLanceLegal(e) ? '+' : '#';
  desfazer(e, l);
  return {
    de: nomeDaCasa(de),
    para: nomeDaCasa(para),
    peca: letraDe(p),
    captura: capturada ? letraDe(capturada) : null,
    promocao: promocao ? LETRAS[promocao] : null,
    roque: marca === ROQUE ? ((para & 7) === 6 ? 'curto' : 'longo') : null,
    enPassant: marca === EN_PASSANT,
    san,
  };
}

export function lancesLegais(posicao) {
  const e = estadoDe(posicao);
  const todos = legais(e);
  return todos.map((l) => descrever(e, l, todos));
}

const PROMOCOES = { q: DAMA, r: TORRE, b: BISPO, n: CAVALO };

/** Joga um lance e devolve a posição nova. A de entrada não é tocada. */
export function jogar(posicao, { de, para, promocao } = {}) {
  if (!ehNomeDeCasa(de) || !ehNomeDeCasa(para)) throw new ErroDeLance('O lance precisa de casa de saída e de chegada.');
  const e = estadoDe(posicao);
  const origem = casaDoNome(de), destino = casaDoNome(para);
  const todos = legais(e);
  const candidatos = todos.filter((l) => origemDe(l) === origem && destinoDe(l) === destino);
  if (!candidatos.length) throw new ErroDeLance('Esse lance não vale nesta posição.');

  const semPromocao = promocao === undefined || promocao === null || promocao === '';
  let escolhido;
  if (promocaoDe(candidatos[0])) {
    if (semPromocao) throw new ErroDeLance('Escolha a peça da promoção.');
    const tipo = PROMOCOES[String(promocao).toLowerCase()];
    escolhido = candidatos.find((l) => promocaoDe(l) === tipo);
    if (!escolhido) throw new ErroDeLance('A promoção é para dama, torre, bispo ou cavalo.');
  } else {
    if (!semPromocao) throw new ErroDeLance('Promoção só existe quando o peão chega à última fileira.');
    escolhido = candidatos[0];
  }

  const feito = descrever(e, escolhido, todos);
  fazer(e, escolhido);
  e.pilha.length = 0;
  return { posicao: posicaoDe(e), lance: feito };
}

// ---- como está a partida -------------------------------------------------------------

/**
 * A posição para contar repetição: o FEN sem os dois relógios.
 *
 * Com um cuidado que o FEN não tem: a casa de en passant só entra se a captura for possível
 * de fato. O FEN a anota depois de TODO avanço duplo, e a regra diz que duas posições são a
 * mesma quando os lances possíveis são os mesmos — sem isto, a posição logo depois de 1.e4
 * nunca repetiria a mesma posição vista depois, e a tripla repetição escaparia.
 */
export function chaveDeRepeticao(posicao) {
  const [colocacao, vez, roque] = escreverFen(posicao).split(' ');
  let ep = '-';
  if (posicao.enPassant) {
    const e = estadoDe(posicao);
    if (legais(e).some((l) => marcaDe(l) === EN_PASSANT)) ep = posicao.enPassant;
  }
  return `${colocacao} ${vez} ${roque} ${ep}`;
}

// Os casos em que ninguém consegue dar mate, lance nenhum: rei contra rei, rei e uma peça
// menor contra rei, e um bispo de cada lado andando na mesma cor de casa.
function materialInsuficiente(e) {
  let cavalos = 0;
  const bispos = [];
  for (let casa = 0; casa < 64; casa++) {
    const p = e.casas[casa];
    if (!p) continue;
    const tipo = p & 7;
    if (tipo === REI) continue;
    if (tipo === PEAO || tipo === TORRE || tipo === DAMA) return false;
    if (tipo === CAVALO) cavalos++;
    else bispos.push({ lado: p & PRETO, corDaCasa: ((casa >> 3) + (casa & 7)) % 2 });
  }
  if (cavalos + bispos.length <= 1) return true;
  return cavalos === 0 && bispos.length === 2
    && bispos[0].lado !== bispos[1].lado && bispos[0].corDaCasa === bispos[1].corDaCasa;
}

/**
 * De quem é a vez, se há xeque e se a partida acabou.
 *
 * `chaves` são as chaves de repetição de todas as posições da partida, a atual incluída. O
 * mate vem antes de tudo: o lance que dá mate vale mesmo sendo o centésimo meio-lance. Os
 * empates por cinquenta lances e por repetição aqui são automáticos — numa call entre
 * amigos ninguém vai "reivindicar" empate, e partida que nunca acaba é pior.
 */
export function situacao(posicao, chaves = []) {
  const e = estadoDe(posicao);
  const vez = posicao.vez;
  const xeque = emXeque(e);
  const resposta = (fim) => ({ vez, xeque, fim });
  if (!temLanceLegal(e)) {
    return resposta(xeque ? { motivo: 'mate', vencedor: vez === 'w' ? 'b' : 'w' } : { motivo: 'afogamento', vencedor: null });
  }
  if (materialInsuficiente(e)) return resposta({ motivo: 'material', vencedor: null });
  if (posicao.meiosLances >= 100) return resposta({ motivo: 'cinquentaLances', vencedor: null });
  const chave = chaveDeRepeticao(posicao);
  if (chaves.filter((k) => k === chave).length >= 3) return resposta({ motivo: 'repeticao', vencedor: null });
  return resposta(null);
}

// ---- perft -------------------------------------------------------------------------------

function contar(e, profundidade) {
  const lista = gerar(e);
  const quem = e.vez;
  const inimigo = quem ^ PRETO, qual = quem >> 3;
  let n = 0;
  for (let i = 0; i < lista.length; i++) {
    const l = lista[i];
    fazer(e, l);
    if (!atacada(e, e.reis[qual], inimigo)) n += profundidade === 1 ? 1 : contar(e, profundidade - 1);
    desfazer(e, l);
  }
  return n;
}

/**
 * Quantas posições existem a `profundidade` meio-lances daqui. Não serve à partida: é a
 * prova do gerador de lances, comparada com as contagens conhecidas de todo motor.
 */
export function perft(posicao, profundidade) {
  if (profundidade <= 0) return 1;
  return contar(estadoDe(posicao), profundidade);
}
