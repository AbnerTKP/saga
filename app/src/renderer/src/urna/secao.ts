/**
 * A seção eleitoral vista de lado, em dia de 2º turno: uma sala de escola com a lousa, a mesa
 * receptora com dois mesários e o terminal, o mural com as duas chapas e a cabine de papelão com a
 * urna. O bonequinho entra pela porta, passa pela mesa (título, digital no leitor, assinatura no
 * caderno, celular entregue) e vai à cabine — lá a tela vira a urna em primeira pessoa (`cabine.ts`).
 *
 * O fundo é pintado uma vez e guardado; por cima vão só o que muda: o bonequinho, a dica, a fala do
 * mesário e o título aberto. As pessoas são desenhadas por conta (retângulos com contorno), e não
 * por sprite, porque o passo é uma conta: a perna da frente e o braço do outro lado andam juntos.
 */
import { type Cor, type Quadro, colar, cor, criarQuadro, linha, pixel, retangulo } from '../dragao/quadro.ts';
import { escrever, medir } from '../dragao/fonte.ts';
import { pontilhar } from '../dragao/cenario.ts';
import { type Regiao, H, W, caber, caixa, rosto, rostoPequeno } from './comum.ts';
import { CANDIDATOS } from './candidatos.ts';

/** Onde as coisas estão no chão, para quem anda: a porta, a frente da mesa, o mural e a cabine. */
export const LUGARES = { porta: 26, mesa: 150, mural: 260, cabine: 318, pe: 204 } as const;

/** O leitor de digital: esperando o dedo, lendo (com o quanto já leu), não reconheceu, reconheceu. */
export type Leitor = { estado: 'esperando' | 'lendo' | 'falhou' | 'ok'; progresso: number };

export type Fala = { quem: string; texto: string };

export type DadosDaSecao = {
  /** O pé do bonequinho, em x. */
  x: number;
  /** De 0 a 3 andando; parado é -1. */
  passo: number;
  virado: 'direita' | 'esquerda';
  comTitulo: boolean;
  /** "ESPAÇO: ENTREGAR O TÍTULO", em cima da cabeça. */
  dica: string | null;
  fala: Fala | null;
  /** O título aberto no meio da tela. */
  titulo: { apelido: string; inscricao: string } | null;
  /** O leitor de digital da mesa, aberto no meio da tela. */
  leitor: Leitor | null;
  /** O caderno de votação aberto, com a assinatura até onde já foi (0 a 1). */
  caderno: { apelido: string; progresso: number } | null;
  /** O mural das chapas, de perto. */
  mural: boolean;
  /** Depois da mesa, o celular fica nela: na cabine não entra. */
  celularNaMesa: boolean;
  /** Quantas vezes já votou nesta abertura: o adesivo EU VOTEI aparece depois da primeira. */
  votou: boolean;
};

const C = {
  contorno: cor('#2a211d'),
  parede: cor('#e9e0c3'), paredeSombra: cor('#d9ceac'), barrado: cor('#6f9c80'), barradoEscuro: cor('#557d65'), faixa: cor('#f3ecd3'),
  chao: cor('#b8a88a'), chaoEscuro: cor('#a39373'), rodape: cor('#5b4b3a'),
  madeira: cor('#9a6b44'), madeiraClara: cor('#b8845a'), madeiraEscura: cor('#6f4a2d'),
  lousa: cor('#2f5645'), lousaClara: cor('#3b6a55'), giz: cor('#e8efe6'), gizApagado: cor('#9fb8ab'),
  porta: cor('#7b5236'), portaClara: cor('#94663f'), macaneta: cor('#e6c35c'),
  vidro: cor('#a9d3e8'), vidroClaro: cor('#d7eef7'), caixilho: cor('#f4f1e6'),
  mesa: cor('#c7b08a'), mesaClara: cor('#dcc8a3'), mesaEscura: cor('#9c8561'), pano: cor('#2e6fb0'), panoEscuro: cor('#245a91'),
  papel: cor('#f7f5ec'), papelSombra: cor('#d8d4c4'),
  terminal: cor('#d9dbd6'), terminalEscuro: cor('#8e918c'), telinha: cor('#2c4a3c'),
  papelao: cor('#8f949b'), papelaoClaro: cor('#a7acb3'), papelaoEscuro: cor('#71767d'),
  urna: cor('#dcdedb'), urnaEscura: cor('#9ea19d'),
  pele: cor('#e3a982'), peleSombra: cor('#bf8360'), peleMorena: cor('#a86b45'), peleMorenaSombra: cor('#83502f'),
  cabelo: cor('#3b2a20'), cabeloClaro: cor('#8a6a45'), grisalho: cor('#b9b4ad'),
  camisa: cor('#3e8fb8'), camisaSombra: cor('#2d6d8e'), calca: cor('#343946'), calcaSombra: cor('#252833'), sapato: cor('#1b1b1f'),
  colete: cor('#f2c230'), coleteSombra: cor('#c99a17'), camisaMesario: cor('#f4f4ef'), camisaMesarioSombra: cor('#cfd0cb'),
  olho: cor('#1b1b1f'), boca: cor('#9a4f3a'),
  caixaFala: cor('#1f2330'), caixaFalaBorda: cor('#f4f1e6'), textoFala: cor('#f4f1e6'), nomeFala: cor('#f2c230'),
  tituloPapel: cor('#e5efd8'), tituloVerde: cor('#2f6b4a'), tituloLinha: cor('#b8cba9'),
  adesivo: cor('#f2c230'),
  cortica: cor('#b88a58'), corticaEscura: cor('#9a6f43'), alfinete: cor('#d9443a'),
  aparelho: cor('#3a3d44'), aparelhoClaro: cor('#50545d'), aparelhoEscuro: cor('#24262b'),
  vidroLeitor: cor('#22343c'), cristaLeitor: cor('#4d7383'), luzVerde: cor('#5fdc7c'), luzVermelha: cor('#ef5a4a'),
  telaLeitor: cor('#16221d'), textoLeitor: cor('#bfe8c9'), barraLeitor: cor('#0b120f'),
  folha: cor('#f6f0dc'), folhaSombra: cor('#ddd3b4'), folhaLinha: cor('#cfc4a2'), lombada: cor('#b9ad8a'),
  caneta: cor('#2a54b8'), canetaClara: cor('#5b84e0'), tintaCaneta: cor('#1d3f99'), marcaTexto: cor('#f7e27a'),
  celular: cor('#1b1d22'), celularTela: cor('#4f6b8c'),
  santinho: cor('#f4f1e6'), santinhoA: cor('#c8372d'), santinhoB: cor('#2a62b8'),
};

let fundoPronto: Quadro | null = null;

function fundo(): Quadro {
  if (fundoPronto) return fundoPronto;
  const q = criarQuadro(W, H);
  // Parede com barrado verde de escola e o chão de ladrilho.
  retangulo(q, 0, 0, W, 132, C.parede);
  for (let y = 0; y < 132; y++) for (let x = 0; x < W; x++) if ((x * 7 + y * 13) % 97 === 0) pixel(q, x, y, C.paredeSombra);
  retangulo(q, 0, 104, W, 28, C.barrado);
  retangulo(q, 0, 104, W, 2, C.faixa);
  retangulo(q, 0, 130, W, 2, C.barradoEscuro);
  retangulo(q, 0, 132, W, 4, C.rodape);
  for (let y = 136; y < H; y++) {
    const fila = Math.floor((y - 136) / 10);
    for (let x = 0; x < W; x++) {
      const coluna = Math.floor((x + fila * 11) / 22);
      let c = (fila + coluna) % 2 === 0 ? C.chao : C.chaoEscuro;
      if ((y - 136) % 10 === 0) c = C.chaoEscuro;
      q.px[y * W + x] = c;
    }
  }
  santinhos(q);
  // A porta, à esquerda, com a placa da seção.
  retangulo(q, 6, 50, 42, 86, C.madeiraEscura);
  retangulo(q, 9, 53, 36, 83, C.porta);
  retangulo(q, 13, 58, 12, 30, C.portaClara);
  retangulo(q, 29, 58, 12, 30, C.portaClara);
  retangulo(q, 13, 96, 28, 34, C.portaClara);
  retangulo(q, 38, 98, 3, 3, C.macaneta);
  caixa(q, 4, 32, 46, 15, C.papel, C.papelSombra);
  escrever(q, 'SEÇÃO', 27, 34, C.contorno, { alinhar: 'centro' });
  escrever(q, '0059', 27, 41, C.contorno, { alinhar: 'centro' });
  // A lousa com o giz.
  retangulo(q, 66, 14, 150, 70, C.madeira);
  retangulo(q, 69, 17, 144, 64, C.lousa);
  for (let y = 17; y < 81; y++) for (let x = 69; x < 213; x++) if (pontilhar(x, y, 0.1) && (x + y) % 5 === 0) pixel(q, x, y, C.lousaClara);
  retangulo(q, 70, 84, 142, 3, C.madeiraClara);
  escrever(q, 'ELEIÇÕES 2026 - ZONA 042', 141, 23, C.gizApagado, { alinhar: 'centro' });
  escrever(q, '2º TURNO', 141, 36, C.giz, { tamanho: 'grande', alinhar: 'centro' });
  escrever(q, '25 DE OUTUBRO', 141, 57, C.giz, { alinhar: 'centro' });
  escrever(q, 'SILÊNCIO NA CABINE', 141, 69, C.gizApagado, { alinhar: 'centro' });
  retangulo(q, 180, 83, 6, 2, C.giz);
  // Onde era a janela, o mural com as chapas.
  muralNaParede(q);
  // O relógio.
  retangulo(q, 352, 22, 16, 16, C.contorno);
  retangulo(q, 353, 23, 14, 14, C.papel);
  linha(q, 360, 30, 360, 25, C.contorno); linha(q, 360, 30, 364, 30, C.contorno);
  // A mesa receptora: pano azul na frente, mesários atrás, o terminal e o caderno em cima.
  mesario(q, 128, 150, 'coque');
  mesario(q, 176, 150, 'careca');
  retangulo(q, 104, 146, 96, 4, C.mesaClara);
  retangulo(q, 104, 150, 96, 4, C.mesaEscura);
  retangulo(q, 108, 154, 88, 30, C.pano);
  for (let x = 110; x < 196; x += 6) retangulo(q, x, 154, 2, 30, C.panoEscuro);
  caixa(q, 124, 160, 56, 14, C.papel, C.papelSombra);
  escrever(q, 'MESA RECEPTORA', 152, 163, C.contorno, { alinhar: 'centro' });
  retangulo(q, 110, 184, 4, 8, C.mesaEscura); retangulo(q, 190, 184, 4, 8, C.mesaEscura);
  // Terminal do mesário, com o leitor de digital.
  retangulo(q, 144, 136, 18, 10, C.terminalEscuro);
  retangulo(q, 145, 137, 16, 9, C.terminal);
  retangulo(q, 147, 138, 12, 4, C.telinha);
  retangulo(q, 150, 143, 6, 2, C.terminalEscuro);
  // O caderno aberto.
  retangulo(q, 112, 143, 24, 3, C.papelSombra);
  retangulo(q, 113, 142, 22, 3, C.papel);
  linha(q, 124, 142, 124, 144, C.papelSombra);
  // A cabine: mesinha, a urna e o papelão dobrado em volta.
  retangulo(q, 296, 150, 72, 4, C.madeiraClara);
  retangulo(q, 296, 154, 72, 3, C.madeiraEscura);
  retangulo(q, 300, 157, 4, 35, C.madeiraEscura); retangulo(q, 360, 157, 4, 35, C.madeiraEscura);
  retangulo(q, 310, 138, 30, 12, C.urnaEscura);
  retangulo(q, 311, 139, 28, 10, C.urna);
  retangulo(q, 313, 140, 12, 7, C.contorno);
  retangulo(q, 328, 141, 8, 6, C.urnaEscura);
  retangulo(q, 340, 96, 26, 54, C.papelaoEscuro);
  retangulo(q, 342, 98, 22, 52, C.papelao);
  retangulo(q, 342, 98, 22, 2, C.papelaoClaro);
  retangulo(q, 300, 96, 42, 4, C.papelaoEscuro);
  retangulo(q, 300, 99, 3, 30, C.papelaoEscuro);
  caixa(q, 344, 112, 18, 14, C.papel, C.papelSombra);
  escrever(q, 'X', 353, 116, C.pano, { alinhar: 'centro' });
  escrever(q, 'CABINE', 332, 88, C.contorno, { alinhar: 'centro' });
  fundoPronto = q;
  return q;
}

/**
 * O mural da seção, entre a lousa e a cabine: a folha com as duas chapas do 2º turno presa na
 * cortiça, que é onde a seção de verdade afixa os candidatos. De perto (ESPAÇO), abre grande.
 */
function muralNaParede(q: Quadro) {
  const x = 222, y = 18, l = 76, a = 68;
  retangulo(q, x, y, l, a, C.madeiraEscura);
  retangulo(q, x + 2, y + 2, l - 4, a - 4, C.cortica);
  for (let yy = y + 2; yy < y + a - 2; yy++) for (let xx = x + 2; xx < x + l - 2; xx++) if ((xx * 5 + yy * 11) % 23 === 0) pixel(q, xx, yy, C.corticaEscura);
  caixa(q, x + 5, y + 5, l - 10, a - 10, C.papel, C.papelSombra);
  pixel(q, x + 7, y + 6, C.alfinete); pixel(q, x + l - 8, y + 6, C.alfinete);
  escrever(q, 'PRESIDENTE', x + l / 2, y + 9, C.contorno, { alinhar: 'centro' });
  escrever(q, '2º TURNO', x + l / 2, y + 17, C.tituloVerde, { alinhar: 'centro' });
  CANDIDATOS.slice(0, 2).forEach((c, i) => {
    const cx = x + 21 + i * 34;
    const r = rostoPequeno(c.numero);
    retangulo(q, cx - 8, y + 25, 17, 17, C.papelSombra);
    if (r) colar(q, r, cx - 7, y + 26);
    escrever(q, String(c.numero), cx, y + 45, C.contorno, { alinhar: 'centro' });
    escrever(q, caber(c.nome.split(' ')[0], 32), cx, y + 53, C.contorno, { alinhar: 'centro' });
  });
}

/** Os santinhos no chão perto da porta: o retrato de todo dia de eleição. Metade de cada cor. */
function santinhos(q: Quadro) {
  const onde = [[8, 196], [21, 205], [37, 191], [52, 208], [63, 198], [79, 206], [14, 210], [45, 200], [70, 189], [90, 199], [30, 212], [58, 192]];
  onde.forEach(([x, y], i) => {
    const deitado = i % 3 !== 0;
    const l = deitado ? 5 : 3, a = deitado ? 3 : 5;
    retangulo(q, x, y, l, a, C.santinho);
    if (deitado) retangulo(q, x, y, 2, a, i % 2 ? C.santinhoA : C.santinhoB);
    else retangulo(q, x, y, l, 2, i % 2 ? C.santinhoA : C.santinhoB);
  });
}

/** O celular deitado na mesa, ao lado do terminal: entregue antes de ir à cabine. */
function celular(q: Quadro) {
  retangulo(q, 184, 143, 9, 3, C.contorno);
  retangulo(q, 185, 143, 7, 2, C.celular);
  retangulo(q, 186, 143, 5, 1, C.celularTela);
}

/** Um mesário sentado atrás da mesa: só dali para cima aparece. `y` é a altura do tampo. */
function mesario(q: Quadro, x: number, y: number, jeito: 'coque' | 'careca') {
  const pele = jeito === 'coque' ? C.pele : C.peleMorena;
  const peleSombra = jeito === 'coque' ? C.peleSombra : C.peleMorenaSombra;
  // Tronco: camisa branca com o colete amarelo de mesário.
  retangulo(q, x - 8, y - 18, 16, 18, C.contorno);
  retangulo(q, x - 7, y - 17, 14, 17, C.camisaMesario);
  retangulo(q, x - 7, y - 15, 4, 15, C.colete);
  retangulo(q, x + 3, y - 15, 4, 15, C.colete);
  retangulo(q, x + 5, y - 15, 2, 15, C.coleteSombra);
  retangulo(q, x - 2, y - 17, 4, 3, pele);
  // Cabeça, de frente.
  retangulo(q, x - 6, y - 30, 12, 13, C.contorno);
  retangulo(q, x - 5, y - 29, 10, 11, pele);
  retangulo(q, x + 3, y - 29, 2, 11, peleSombra);
  pixel(q, x - 3, y - 24, C.olho); pixel(q, x + 2, y - 24, C.olho);
  retangulo(q, x - 1, y - 21, 3, 1, C.boca);
  if (jeito === 'coque') {
    retangulo(q, x - 6, y - 31, 12, 4, C.cabelo);
    retangulo(q, x - 6, y - 27, 2, 6, C.cabelo);
    retangulo(q, x + 4, y - 27, 2, 6, C.cabelo);
    retangulo(q, x - 3, y - 35, 6, 4, C.cabelo);
    // Óculos.
    retangulo(q, x - 5, y - 25, 4, 3, C.contorno); retangulo(q, x, y - 25, 4, 3, C.contorno);
    pixel(q, x - 4, y - 24, C.vidroClaro); pixel(q, x + 1, y - 24, C.vidroClaro);
  } else {
    retangulo(q, x - 6, y - 26, 2, 4, C.grisalho);
    retangulo(q, x + 4, y - 26, 2, 4, C.grisalho);
    retangulo(q, x - 3, y - 21, 6, 1, C.grisalho); // bigode
    retangulo(q, x - 1, y - 20, 3, 1, C.boca);
  }
}

/**
 * O bonequinho de lado. `passo` de 0 a 3 alterna as pernas e os braços; `x` e `y` são o meio do pé.
 * Desenhado virado para a direita; para a esquerda, cada ponto é espelhado em volta do `x`.
 */
function bonequinho(q: Quadro, x: number, y: number, passo: number, virado: 'direita' | 'esquerda', comTitulo: boolean) {
  const s = virado === 'direita' ? 1 : -1;
  const r = (dx: number, dy: number, l: number, a: number, c: Cor) =>
    retangulo(q, s === 1 ? x + dx : x - dx - l, y + dy, l, a, c);
  const abre = passo < 0 ? 0 : [2, 0, -2, 0][passo % 4];
  const sobe = passo < 0 ? 0 : [0, -1, 0, -1][passo % 4];
  const yy = sobe;
  // Pernas: a de trás primeiro, mais escura.
  r(-2 - abre, -9 + yy, 4, 9, C.contorno); r(-1 - abre, -9 + yy, 2, 8, C.calcaSombra); r(-3 - abre, -2 + yy, 5, 2, C.sapato);
  r(-2 + abre, -9 + yy, 4, 9, C.contorno); r(-1 + abre, -9 + yy, 2, 8, C.calca); r(-2 + abre, -2 + yy, 6, 2, C.sapato);
  // Tronco.
  r(-5, -21 + yy, 10, 13, C.contorno);
  r(-4, -20 + yy, 8, 12, C.camisa);
  r(-4, -11 + yy, 8, 3, C.calca);
  // Braço: balança ao contrário da perna da frente; com o título, vai esticado à frente.
  if (comTitulo) {
    r(0, -18 + yy, 8, 4, C.contorno); r(1, -17 + yy, 6, 2, C.camisaSombra); r(7, -18 + yy, 3, 3, C.pele);
    r(8, -21 + yy, 6, 8, C.contorno); r(9, -20 + yy, 4, 6, C.tituloPapel); r(9, -20 + yy, 4, 1, C.tituloVerde);
  } else {
    r(-1 - abre / 2, -19 + yy, 4, 10, C.contorno); r(0 - abre / 2, -18 + yy, 2, 7, C.camisaSombra); r(0 - abre / 2, -11 + yy, 2, 2, C.pele);
  }
  // Cabeça: cabelo atrás e em cima, olho do lado para onde anda.
  r(-6, -33 + yy, 12, 12, C.contorno);
  r(-5, -32 + yy, 10, 10, C.pele);
  r(-5, -32 + yy, 10, 3, C.cabelo);
  r(-5, -29 + yy, 3, 4, C.cabelo);
  r(2, -28 + yy, 1, 2, C.olho);
  r(3, -24 + yy, 2, 1, C.boca);
  r(-2, -26 + yy, 1, 2, C.peleSombra); // orelha
  r(5, -27 + yy, 1, 2, C.pele); // nariz, saindo do contorno
}

/** O EU VOTEI no peito, depois do primeiro voto. */
function adesivo(q: Quadro, x: number, y: number) {
  retangulo(q, x - 2, y - 17, 4, 4, C.contorno);
  retangulo(q, x - 1, y - 16, 2, 2, C.adesivo);
}

function balao(q: Quadro, texto: string, x: number, y: number) {
  const l = medir(texto) + 8;
  const bx = Math.max(2, Math.min(W - l - 2, Math.round(x - l / 2)));
  caixa(q, bx, y - 12, l, 11, C.papel, C.contorno);
  retangulo(q, x - 1, y - 2, 3, 2, C.contorno);
  escrever(q, texto, bx + 4, y - 9, C.contorno);
}

function fala(q: Quadro, f: Fala) {
  const l = 300, x = Math.round((W - l) / 2), y = 6;
  caixa(q, x - 1, y - 1, l + 2, 36, C.caixaFalaBorda, C.contorno);
  retangulo(q, x + 1, y + 1, l - 2, 32, C.caixaFala);
  escrever(q, f.quem.toUpperCase(), x + 8, y + 5, C.nomeFala);
  const palavras = f.texto.toUpperCase().split(' ');
  const linhas: string[] = [''];
  for (const p of palavras) {
    const tentativa = linhas[linhas.length - 1] ? `${linhas[linhas.length - 1]} ${p}` : p;
    if (medir(tentativa) > l - 16 && linhas[linhas.length - 1]) linhas.push(p);
    else linhas[linhas.length - 1] = tentativa;
  }
  linhas.slice(0, 2).forEach((t, i) => escrever(q, t, x + 8, y + 14 + i * 9, C.textoFala));
  escrever(q, 'ESPAÇO', x + l - 8, y + 24, C.nomeFala, { alinhar: 'direita' });
}

/**
 * O título de eleitor da Saga: verde como o de papel, com os campos dele. Nasceu com um carimbo de FAKE
 * por cima, e o dono mandou tirar: é pixel art de jogo, e todo mundo sabe que não vale.
 */
export function desenharTitulo(q: Quadro, apelido: string, inscricao: string) {
  const l = 200, a = 116, x = Math.round((W - l) / 2), y = 46;
  retangulo(q, x + 3, y + 3, l, a, C.contorno);
  caixa(q, x, y, l, a, C.tituloPapel, C.tituloVerde);
  retangulo(q, x + 1, y + 1, l - 2, 20, C.tituloVerde);
  escrever(q, 'REPÚBLICA DA SAGA', x + l / 2, y + 4, C.tituloPapel, { alinhar: 'centro' });
  escrever(q, 'TÍTULO DE ELEITOR', x + l / 2, y + 12, C.adesivo, { alinhar: 'centro' });
  const campo = (rotulo: string, valor: string, cx: number, cy: number, largura: number) => {
    escrever(q, rotulo, cx, cy, C.tituloVerde);
    retangulo(q, cx, cy + 16, largura, 1, C.tituloLinha);
    escrever(q, caber(valor, largura), cx, cy + 9, C.contorno);
  };
  campo('NOME DO ELEITOR', apelido, x + 8, y + 26, l - 16);
  campo('INSCRIÇÃO', inscricao, x + 8, y + 48, 90);
  campo('ZONA', '042', x + 110, y + 48, 30);
  campo('SEÇÃO', '0059', x + 150, y + 48, 40);
  campo('MUNICÍPIO/UF', 'SAGA/BR', x + 8, y + 70, 90);
  campo('EMISSÃO', '17/09/2026', x + 110, y + 70, 80);
  // A assinatura, um rabisco.
  let py = y + 102;
  for (let px = x + 12; px < x + 70; px++) {
    py += ((px * 7) % 5) - 2;
    py = Math.max(y + 97, Math.min(y + 107, py));
    pixel(q, px, py, C.contorno);
  }
  escrever(q, 'ASSINATURA', x + 12, y + 108, C.tituloVerde);
}

/** A impressão digital: arcos em volta de um miolo, desenhados linha a linha até `ate` (de 0 a 1). */
function digital(q: Quadro, x: number, y: number, l: number, a: number, ate: number, c: Cor) {
  const cx = x + l / 2, cy = y + a * 0.55;
  const limite = y + Math.round(a * ate);
  for (let yy = y; yy < Math.min(y + a, limite); yy++) for (let xx = x; xx < x + l; xx++) {
    const dx = (xx - cx) / (l / 2), dy = (yy - cy) / (a / 2);
    if (dx * dx + dy * dy * 0.8 > 1) continue;
    const anel = Math.sqrt(dx * dx * 1.3 + dy * dy) * 9 + Math.sin(dx * 3) * 0.6;
    if (Math.floor(anel) % 2 === 0) pixel(q, xx, yy, c);
  }
}

/**
 * O leitor de digital da mesa, de perto: o vidro à esquerda com a digital aparecendo enquanto lê, a
 * telinha à direita com o que ele diz e a barra de leitura. Segurar ESPAÇO é o dedo no vidro.
 */
export function desenharLeitor(q: Quadro, d: Leitor) {
  const l = 200, a = 112, x = Math.round((W - l) / 2), y = 48;
  retangulo(q, x + 3, y + 3, l, a, C.contorno);
  caixa(q, x, y, l, a, C.aparelho, C.contorno);
  retangulo(q, x + 1, y + 1, l - 2, 1, C.aparelhoClaro);
  escrever(q, 'LEITOR BIOMÉTRICO', x + l / 2, y + 6, C.textoLeitor, { alinhar: 'centro' });
  // O vidro, com a luz em volta: verde quando reconhece, vermelha quando não.
  const vx = x + 14, vy = y + 20, vl = 52, va = 64;
  const luz = d.estado === 'ok' ? C.luzVerde : d.estado === 'falhou' ? C.luzVermelha : d.estado === 'lendo' ? C.cristaLeitor : C.aparelhoEscuro;
  retangulo(q, vx - 3, vy - 3, vl + 6, va + 6, luz);
  retangulo(q, vx - 1, vy - 1, vl + 2, va + 2, C.aparelhoEscuro);
  retangulo(q, vx, vy, vl, va, C.vidroLeitor);
  const ate = d.estado === 'esperando' ? 0 : d.estado === 'lendo' ? d.progresso : 1;
  digital(q, vx + 6, vy + 6, vl - 12, va - 12, ate, d.estado === 'falhou' ? C.luzVermelha : d.estado === 'ok' ? C.luzVerde : C.cristaLeitor);
  if (d.estado === 'lendo') retangulo(q, vx, vy + 6 + Math.round((va - 12) * d.progresso), vl, 1, C.luzVerde);
  if (d.estado === 'esperando') {
    // O contorno do dedo, pontilhado, mostrando onde pôr.
    for (let i = 0; i < 40; i += 3) { pixel(q, vx + 14, vy + 18 + i, C.cristaLeitor); pixel(q, vx + vl - 15, vy + 18 + i, C.cristaLeitor); }
    for (let i = 0; i < 24; i += 3) pixel(q, vx + 15 + i, vy + 14 + Math.round(Math.abs(i - 11) / 3), C.cristaLeitor);
  }
  // A telinha.
  const tx = x + 80, ty = y + 20, tl = 106, ta = 40;
  retangulo(q, tx - 1, ty - 1, tl + 2, ta + 2, C.aparelhoEscuro);
  retangulo(q, tx, ty, tl, ta, C.telaLeitor);
  const linhas: [string, Cor][] = d.estado === 'esperando' ? [['COLOQUE O DEDO', C.textoLeitor], ['NO LEITOR', C.textoLeitor]]
    : d.estado === 'lendo' ? [['LENDO A DIGITAL...', C.textoLeitor], [`${Math.floor(d.progresso * 100)}%`, C.luzVerde]]
      : d.estado === 'falhou' ? [['DIGITAL NÃO', C.luzVermelha], ['RECONHECIDA', C.luzVermelha]]
        : [['ELEITOR', C.luzVerde], ['IDENTIFICADO', C.luzVerde]];
  linhas.forEach(([t, c], i) => escrever(q, t, tx + tl / 2, ty + 10 + i * 12, c, { alinhar: 'centro' }));
  // A barra de leitura.
  retangulo(q, tx, ty + ta + 8, tl, 6, C.barraLeitor);
  const cheia = d.estado === 'esperando' ? 0 : d.estado === 'lendo' ? d.progresso : 1;
  retangulo(q, tx + 1, ty + ta + 9, Math.round((tl - 2) * cheia), 4, d.estado === 'falhou' ? C.luzVermelha : C.luzVerde);
  const dica = d.estado === 'ok' ? 'ESPAÇO: CONTINUAR' : d.estado === 'lendo' ? 'NÃO SOLTE...' : 'SEGURE ESPAÇO';
  escrever(q, dica, tx + tl / 2, y + a - 13, C.nomeFala, { alinhar: 'centro' });
}

/** Os eleitores de antes no caderno: nomes de mentira, cada um com o rabisco dele. */
const OUTROS = ['ADEMIR S.', 'BEATRIZ L.', 'CLEUSA F.', 'DIEGO R.', 'EDNA M.', 'FABIO N.', 'GILDA S.', 'HELENA T.'];

/** O rabisco de uma assinatura, sempre o mesmo para o mesmo nome: os pontos de uma linha que sobe e desce. */
function rabisco(nome: string, x: number, y: number, l: number): [number, number][] {
  const pts: [number, number][] = [];
  let semente = 7;
  for (const ch of nome) semente = (semente * 31 + ch.charCodeAt(0)) % 9973;
  for (let i = 0; i <= l; i += 2) {
    const onda = Math.sin(i / 3 + semente) * 3 + Math.sin(i / 7 + semente / 3) * 2;
    pts.push([x + i, Math.round(y + onda * (i < 6 ? i / 6 : 1))]);
  }
  return pts;
}

/** Risca o rabisco até `ate` (de 0 a 1) e devolve onde a caneta parou. */
function riscar(q: Quadro, pts: [number, number][], ate: number, c: Cor): [number, number] {
  const n = Math.floor((pts.length - 1) * ate);
  for (let i = 0; i < n; i++) linha(q, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c);
  return pts[n];
}

/**
 * O caderno de votação aberto na mesa: à esquerda quem já votou, à direita a sua linha, marcada de
 * amarelo, e a caneta assinando enquanto ESPAÇO está apertado.
 */
export function desenharCaderno(q: Quadro, apelido: string, progresso: number) {
  const l = 252, a = 116, x = Math.round((W - l) / 2), y = 48;
  retangulo(q, x + 3, y + 3, l, a, C.contorno);
  retangulo(q, x, y, l, a, C.contorno);
  retangulo(q, x + 1, y + 1, l - 2, a - 2, C.folha);
  retangulo(q, x + l / 2 - 2, y + 1, 4, a - 2, C.lombada);
  escrever(q, 'CADERNO DE VOTAÇÃO', x + 8, y + 7, C.tituloVerde);
  escrever(q, 'SEÇÃO 0059', x + l - 8, y + 7, C.tituloVerde, { alinhar: 'direita' });
  retangulo(q, x + 6, y + 15, l / 2 - 10, 1, C.folhaSombra);
  retangulo(q, x + l / 2 + 4, y + 15, l / 2 - 10, 1, C.folhaSombra);
  const linhaDoCaderno = (px: number, ly: number, n: number, nome: string, assinado: boolean) => {
    escrever(q, String(n).padStart(3, '0'), px, ly, C.mesaEscura);
    escrever(q, caber(nome, 44), px + 16, ly, C.contorno);
    retangulo(q, px + 16, ly + 12, 100, 1, C.folhaLinha);
    if (assinado) riscar(q, rabisco(nome, px + 66, ly + 7, 44), 1, C.tintaCaneta);
  };
  OUTROS.slice(0, 6).forEach((nome, i) => linhaDoCaderno(x + 8, y + 22 + i * 15, 112 + i, nome, true));
  // A página da direita: dois que vieram antes, você marcado de amarelo, e as linhas vazias de quem vem.
  const dx = x + l / 2 + 8;
  linhaDoCaderno(dx, y + 22, 118, OUTROS[6], true);
  linhaDoCaderno(dx, y + 37, 119, OUTROS[7], true);
  const ly = y + 52;
  retangulo(q, dx - 3, ly - 3, 122, 18, C.marcaTexto);
  linhaDoCaderno(dx, ly, 120, apelido, false);
  for (let i = 1; i <= 2; i++) linhaDoCaderno(dx, ly + i * 15, 120 + i, '', false);
  const ponta = riscar(q, rabisco(apelido.toUpperCase(), dx + 66, ly + 7, 44), progresso, C.tintaCaneta);
  // A caneta, deitada na diagonal, com a ponta onde o rabisco parou (parada, fica ao lado da linha).
  const [cx, cy] = progresso > 0 && progresso < 1 ? ponta : [dx + 118, ly + 6];
  for (let i = 0; i < 20; i++) {
    const px = cx + 1 + i, py = cy - 1 - Math.floor(i / 2);
    pixel(q, px, py, i < 2 ? C.contorno : i < 15 ? C.caneta : C.canetaClara);
    pixel(q, px, py - 1, C.contorno);
    pixel(q, px, py + 1, i < 2 ? 0 : C.contorno);
  }
  const dica = progresso >= 1 ? 'ESPAÇO: CONTINUAR' : progresso > 0 ? 'ASSINANDO...' : 'SEGURE ESPAÇO PARA ASSINAR';
  escrever(q, dica, x + l - 8, y + a - 11, C.tituloVerde, { alinhar: 'direita' });
}

/** O mural de perto: as duas chapas do 2º turno, com foto, número, partido e vice, como no santinho. */
export function desenharMural(q: Quadro) {
  const l = 268, a = 140, x = Math.round((W - l) / 2), y = 44;
  retangulo(q, x + 3, y + 3, l, a, C.contorno);
  caixa(q, x, y, l, a, C.papel, C.contorno);
  escrever(q, 'CANDIDATOS A PRESIDENTE', x + l / 2, y + 6, C.contorno, { alinhar: 'centro' });
  escrever(q, '2º TURNO - 25 DE OUTUBRO', x + l / 2, y + 14, C.tituloVerde, { alinhar: 'centro' });
  CANDIDATOS.slice(0, 2).forEach((c, i) => {
    const cl = l / 2 - 12, cx = x + 8 + i * (cl + 8), cy = y + 26, ca = 98;
    caixa(q, cx, cy, cl, ca, C.folha, C.papelSombra);
    const r = rosto(c.numero, 'titular');
    if (r) { retangulo(q, cx + 5, cy + 5, r.largura + 2, r.altura + 2, C.contorno); colar(q, r, cx + 6, cy + 6); }
    const meio = cx + 42 + (cl - 42) / 2;
    escrever(q, String(c.numero), meio, cy + 10, C.contorno, { tamanho: 'grande', alinhar: 'centro' });
    escrever(q, c.partido, meio, cy + 30, C.tituloVerde, { alinhar: 'centro' });
    escrever(q, caber(c.nome, cl - 10), cx + 5, cy + 56, C.contorno);
    escrever(q, 'VICE', cx + 5, cy + 70, C.mesaEscura);
    escrever(q, caber(c.vice, cl - 10), cx + 5, cy + 78, C.contorno);
  });
  escrever(q, 'ESPAÇO FECHA', x + l - 8, y + a - 10, C.mesaEscura, { alinhar: 'direita' });
}

export function desenharSecao(q: Quadro, d: DadosDaSecao): Regiao[] {
  colar(q, fundo(), 0, 0);
  if (d.celularNaMesa) celular(q);
  bonequinho(q, Math.round(d.x), LUGARES.pe, d.passo, d.virado, d.comTitulo);
  if (d.votou) adesivo(q, Math.round(d.x), LUGARES.pe);
  if (d.dica) balao(q, d.dica, Math.round(d.x), LUGARES.pe - 38);
  if (d.fala) fala(q, d.fala);
  if (d.titulo) desenharTitulo(q, d.titulo.apelido, d.titulo.inscricao);
  if (d.leitor) desenharLeitor(q, d.leitor);
  if (d.caderno) desenharCaderno(q, d.caderno.apelido, d.caderno.progresso);
  if (d.mural) desenharMural(q);
  return [];
}
