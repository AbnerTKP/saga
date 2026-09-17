/**
 * A seção eleitoral vista de lado: uma sala de escola com a lousa, a mesa receptora com dois
 * mesários e o terminal, e a cabine de papelão com a urna. O bonequinho entra pela porta, entrega o
 * título na mesa e vai à cabine — lá a tela vira a urna em primeira pessoa (`cabine.ts`).
 *
 * O fundo é pintado uma vez e guardado; por cima vão só o que muda: o bonequinho, a dica, a fala do
 * mesário e o título aberto. As pessoas são desenhadas por conta (retângulos com contorno), e não
 * por sprite, porque o passo é uma conta: a perna da frente e o braço do outro lado andam juntos.
 */
import { type Cor, type Quadro, colar, cor, criarQuadro, linha, pixel, retangulo } from '../dragao/quadro.ts';
import { escrever, medir } from '../dragao/fonte.ts';
import { pontilhar } from '../dragao/cenario.ts';
import { type Regiao, H, W, caber, caixa } from './comum.ts';

/** Onde as coisas estão no chão, para quem anda: a porta, a frente da mesa e a frente da cabine. */
export const LUGARES = { porta: 26, mesa: 150, cabine: 318, pe: 204 } as const;

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
  tituloPapel: cor('#e5efd8'), tituloVerde: cor('#2f6b4a'), tituloLinha: cor('#b8cba9'), carimbo: cor('#c23a2e'),
  adesivo: cor('#f2c230'),
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
  escrever(q, 'ELEIÇÕES 2026', 141, 26, C.giz, { tamanho: 'grande', alinhar: 'centro' });
  escrever(q, 'ZONA 042 - SEÇÃO 0059', 141, 50, C.gizApagado, { alinhar: 'centro' });
  escrever(q, 'SILÊNCIO NA CABINE', 141, 62, C.giz, { alinhar: 'centro' });
  retangulo(q, 180, 83, 6, 2, C.giz);
  // A janela, entre a lousa e a cabine.
  retangulo(q, 236, 22, 50, 58, C.caixilho);
  retangulo(q, 240, 26, 19, 24, C.vidro); retangulo(q, 263, 26, 19, 24, C.vidro);
  retangulo(q, 240, 52, 19, 24, C.vidro); retangulo(q, 263, 52, 19, 24, C.vidro);
  linha(q, 242, 40, 250, 28, C.vidroClaro); linha(q, 265, 66, 275, 54, C.vidroClaro);
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

/** O título de eleitor da Saga: verde como o de papel, com os campos dele — e o carimbo de FAKE. */
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
  // O carimbo torto de FAKE: cada linha deslocada meio pixel, que é o torto possível em pixel.
  const carimbo = criarQuadro(84, 26);
  retangulo(carimbo, 0, 0, 84, 26, C.carimbo);
  retangulo(carimbo, 2, 2, 80, 22, 0);
  escrever(carimbo, 'FAKE', 42, 7, C.carimbo, { tamanho: 'grande', alinhar: 'centro' });
  for (let yy = 0; yy < carimbo.altura; yy++) for (let xx = 0; xx < carimbo.largura; xx++) {
    const c = carimbo.px[yy * carimbo.largura + xx];
    if (c && pontilhar(xx, yy, 0.85)) pixel(q, x + 108 + xx + Math.floor((carimbo.altura - yy) / 3), y + 84 + yy, c);
  }
}

export function desenharSecao(q: Quadro, d: DadosDaSecao): Regiao[] {
  colar(q, fundo(), 0, 0);
  bonequinho(q, Math.round(d.x), LUGARES.pe, d.passo, d.virado, d.comTitulo);
  if (d.votou) adesivo(q, Math.round(d.x), LUGARES.pe);
  if (d.dica) balao(q, d.dica, Math.round(d.x), LUGARES.pe - 38);
  if (d.fala) fala(q, d.fala);
  if (d.titulo) desenharTitulo(q, d.titulo.apelido, d.titulo.inscricao);
  return [];
}
