/**
 * Dentro da cabine: a urna de frente, em primeira pessoa, como o eleitor a vê — o modelo UE2020, de
 * corpo cinza-claro, a tela grande à esquerda e o teclado à direita, com as teclas 1 a 9 em grade, o
 * 0 embaixo do 8 e a coluna BRANCO, CORRIGE e CONFIRMA (esta mais alta) ao lado.
 *
 * A tela segue a da urna de verdade para Presidente: "SEU VOTO PARA", o cargo grande, o número em
 * caixas, nome, partido e vice, as fotos à direita e o rodapé "APERTE A TECLA:" quando o número está
 * completo. Número que não existe vira NÚMERO ERRADO / VOTO NULO, e o fim é o FIM.
 *
 * Nada anima sozinho: quem chama redesenha quando algo muda, e o `piscar` é o do cursor da caixa.
 */
import { type Quadro, colar, cor, criarQuadro, linha, pixel, retangulo } from '../dragao/quadro.ts';
import { escrever, medir } from '../dragao/fonte.ts';
import { type Regiao, type Tecla, H, W, caber, caixa, rosto } from './comum.ts';
import { CANDIDATOS, candidatoDoNumero } from './candidatos.ts';

export type Visor =
  | { tela: 'numero'; digitos: string }
  | { tela: 'branco' }
  | { tela: 'fim' };

export type DadosDaCabine = {
  visor: Visor;
  /** Aceso ou apagado, de meio em meio segundo: o cursor da caixa e o VOTO NULO piscam. */
  piscar: boolean;
  /** A tecla que está afundada agora, e onde o dedo está (fica na última apertada). */
  apertada: Tecla | null;
  dedo: Tecla | null;
  cola: boolean;
};

const C = {
  parede: cor('#6b6f78'), paredeEscura: cor('#555962'), paredeClara: cor('#7c808a'),
  corpo: cor('#dcdedb'), corpoClaro: cor('#eceee9'), corpoSombra: cor('#b7bab6'), contorno: cor('#6f736f'),
  moldura: cor('#16171a'), molduraBrilho: cor('#2c2e33'),
  visor: cor('#f3f3ee'), tinta: cor('#26272b'), cinza: cor('#7a7c80'), caixaBorda: cor('#3a3c40'), cursor: cor('#c9cbcc'),
  tecla: cor('#232529'), teclaBrilho: cor('#43464c'), teclaSombra: cor('#0c0d0f'), letraTecla: cor('#f1f1ec'),
  branco: cor('#f7f7f2'), brancoSombra: cor('#b9bab5'),
  laranja: cor('#ef6a24'), laranjaBrilho: cor('#ff9656'), laranjaSombra: cor('#a8440f'),
  verde: cor('#3fae5a'), verdeBrilho: cor('#6fd584'), verdeSombra: cor('#257a3a'),
  pele: cor('#e3a982'), peleClara: cor('#f3c9a8'), peleSombra: cor('#b97a57'), peleContorno: cor('#6e4430'), manga: cor('#8fb3d9'), mangaSombra: cor('#6a8db4'),
  papel: cor('#f2ebc9'), papelSombra: cor('#d6cda4'), fita: cor('#cfe3e8'),
};

/** O visor: o retângulo claro dentro da moldura preta. */
export const VISOR = { x: 26, y: 26, l: 212, a: 146 };

type Geometria = { x: number; y: number; l: number; a: number };
/** Onde cada tecla está. As de número têm 22x15; a coluna da direita, 40 de largura. */
export const TECLAS: Record<Tecla, Geometria> = (() => {
  const col = [256, 281, 306], lin = [92, 111, 130, 149];
  const g: Partial<Record<Tecla, Geometria>> = {};
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((t, i) => {
    g[t as Tecla] = { x: col[i % 3], y: lin[Math.floor(i / 3)], l: 22, a: 15 };
  });
  g['0'] = { x: col[1], y: lin[3], l: 22, a: 15 };
  g.branco = { x: 331, y: lin[0], l: 42, a: 15 };
  g.corrige = { x: 331, y: lin[1], l: 42, a: 15 };
  g.confirma = { x: 331, y: lin[2], l: 42, a: 34 };
  return g as Record<Tecla, Geometria>;
})();

const ROTULO: Partial<Record<Tecla, string>> = { branco: 'BRANCO', corrige: 'CORRIGE', confirma: 'CONFIRMA' };

function fundo(q: Quadro) {
  // A cabine de papelão em volta: parede lisa, com as dobras nos cantos.
  retangulo(q, 0, 0, W, H, C.parede);
  retangulo(q, 0, 0, 4, H, C.paredeEscura);
  retangulo(q, W - 4, 0, 4, H, C.paredeEscura);
  retangulo(q, 4, 0, 1, H, C.paredeClara);
  // O corpo da urna, de canto arredondado, passando da borda de baixo.
  const x = 8, y = 8, l = W - 16, a = H;
  retangulo(q, x + 3, y, l - 6, a, C.contorno);
  retangulo(q, x + 1, y + 1, l - 2, a, C.contorno);
  retangulo(q, x, y + 3, l, a, C.contorno);
  retangulo(q, x + 3, y + 1, l - 6, a, C.corpo);
  retangulo(q, x + 1, y + 3, l - 2, a, C.corpo);
  retangulo(q, x + 3, y + 1, l - 6, 2, C.corpoClaro);
  retangulo(q, x + 1, y + 3, 2, a, C.corpoClaro);
  retangulo(q, x + l - 3, y + 3, 2, a, C.corpoSombra);
  // A moldura preta do visor.
  retangulo(q, VISOR.x - 7, VISOR.y - 7, VISOR.l + 14, VISOR.a + 14, C.moldura);
  retangulo(q, VISOR.x - 6, VISOR.y - 6, VISOR.l + 12, 1, C.molduraBrilho);
  retangulo(q, VISOR.x - 8, VISOR.y + VISOR.a + 7, VISOR.l + 16, 1, C.corpoSombra);
  // O rebaixo do teclado.
  retangulo(q, 250, 86, 128, 84, C.corpoSombra);
  retangulo(q, 251, 87, 126, 82, C.corpo);
  escrever(q, 'URNA DA SAGA', 314, 60, C.cinza, { alinhar: 'centro' });
  linha(q, 262, 70, 366, 70, C.corpoSombra);
  escrever(q, 'ELEIÇÕES 2026', 314, 74, C.cinza, { alinhar: 'centro' });
}

function tecla(q: Quadro, t: Tecla, afundada: boolean): Regiao {
  const g = TECLAS[t];
  const dy = afundada ? 1 : 0;
  const [base, brilho, sombra, letra] =
    t === 'branco' ? [C.branco, C.branco, C.brancoSombra, C.tinta]
      : t === 'corrige' ? [C.laranja, C.laranjaBrilho, C.laranjaSombra, C.tinta]
        : t === 'confirma' ? [C.verde, C.verdeBrilho, C.verdeSombra, C.tinta]
          : [C.tecla, C.teclaBrilho, C.teclaSombra, C.letraTecla];
  // A sombra embaixo some quando a tecla afunda: é isso que se lê como "apertou".
  retangulo(q, g.x, g.y + 2, g.l, g.a - 1, C.teclaSombra);
  retangulo(q, g.x, g.y + dy, g.l, g.a - 1, sombra);
  retangulo(q, g.x, g.y + dy, g.l, g.a - 2, base);
  if (!afundada) retangulo(q, g.x + 1, g.y, g.l - 2, 1, brilho);
  const rotulo = ROTULO[t] ?? t;
  escrever(q, rotulo, g.x + g.l / 2, g.y + dy + Math.floor((g.a - 6) / 2), letra, { alinhar: 'centro' });
  // O 5 tem o ponto em relevo, como na urna (é por ele que quem não enxerga se acha).
  if (t === '5') pixel(q, g.x + g.l / 2, g.y + dy + 11, C.teclaBrilho);
  return { x: g.x, y: g.y, l: g.l, a: g.a, alvo: { tipo: 'tecla', tecla: t } };
}

/** A mão entra por baixo e o indicador para no meio da tecla. */
function dedo(q: Quadro, t: Tecla, afundada: boolean) {
  const g = TECLAS[t];
  const px = Math.round(g.x + g.l / 2), py = g.y + (afundada ? 7 : 5);
  // O indicador, de 5 de largura, com a unha na ponta.
  retangulo(q, px - 3, py - 1, 7, H, C.peleContorno);
  retangulo(q, px - 2, py, 5, H, C.pele);
  retangulo(q, px + 1, py + 1, 2, H, C.peleSombra);
  pixel(q, px - 3, py - 1, 0); pixel(q, px + 3, py - 1, 0);
  retangulo(q, px - 1, py + 1, 3, 2, C.peleClara);
  linha(q, px - 1, py + 10, px + 1, py + 10, C.peleSombra);
  // A mão fechada e o punho da manga, bem mais embaixo: mão grande tapava o teclado inteiro.
  const my = py + 26;
  retangulo(q, px - 9, my - 1, 17, H, C.peleContorno);
  retangulo(q, px - 8, my, 15, H, C.pele);
  retangulo(q, px - 2, my - 1, 5, 2, C.pele);
  retangulo(q, px - 8, my + 4, 9, 1, C.peleSombra);
  retangulo(q, px - 8, my + 8, 9, 1, C.peleSombra);
  retangulo(q, px + 4, my, 3, H, C.peleSombra);
  const cy = my + 13;
  retangulo(q, px - 11, cy - 1, 21, H, C.peleContorno);
  retangulo(q, px - 10, cy, 19, H, C.manga);
  retangulo(q, px + 4, cy, 5, H, C.mangaSombra);
}

const tx = (q: Quadro, t: string, x: number, y: number, c = C.tinta) => escrever(q, t, VISOR.x + x, VISOR.y + y, c);

function rodape(q: Quadro) {
  linha(q, VISOR.x + 4, VISOR.y + 108, VISOR.x + VISOR.l - 5, VISOR.y + 108, C.cinza);
  tx(q, 'APERTE A TECLA:', 5, 113);
  // As palavras das cores na cor da tecla: na urna elas vêm em negrito.
  const resto = (cor: typeof C.verde, palavra: string, frase: string, y: number) => {
    const l = tx(q, palavra, 11, y, cor);
    tx(q, frase, 11 + l + 4, y);
  };
  resto(C.verdeSombra, 'VERDE', 'PARA CONFIRMAR ESTE VOTO', 122);
  resto(C.laranjaSombra, 'LARANJA', 'PARA REINICIAR ESTE VOTO', 131);
}

function cabecalho(q: Quadro) {
  tx(q, 'SEU VOTO PARA', 5, 6);
  escrever(q, 'PRESIDENTE', VISOR.x + 24, VISOR.y + 18, C.tinta, { tamanho: 'grande' });
}

function caixasDoNumero(q: Quadro, digitos: string, piscar: boolean) {
  tx(q, 'NÚMERO:', 5, 47);
  for (let i = 0; i < 2; i++) {
    const x = VISOR.x + 44 + i * 17, y = VISOR.y + 40;
    const cursor = i === digitos.length && piscar;
    caixa(q, x, y, 15, 19, cursor ? C.cursor : C.visor, C.caixaBorda);
    if (digitos[i]) escrever(q, digitos[i], x + 3, y + 3, C.tinta, { tamanho: 'grande' });
  }
}

function moldurado(q: Quadro, s: Quadro | null, x: number, y: number) {
  if (!s) return;
  retangulo(q, VISOR.x + x - 1, VISOR.y + y - 1, s.largura + 2, s.altura + 2, C.caixaBorda);
  colar(q, s, VISOR.x + x, VISOR.y + y);
}

function desenharVisor(q: Quadro, v: Visor, piscar: boolean) {
  retangulo(q, VISOR.x, VISOR.y, VISOR.l, VISOR.a, C.visor);
  if (v.tela === 'fim') {
    const g = criarQuadro(40, 16);
    escrever(g, 'FIM', 20, 1, C.tinta, { tamanho: 'grande', alinhar: 'centro' });
    ampliarEm(q, g, VISOR.x + VISOR.l / 2 - 60, VISOR.y + 44, 3);
    escrever(q, 'VOTOU', VISOR.x + VISOR.l - 6, VISOR.y + VISOR.a - 10, C.cinza, { alinhar: 'direita' });
    return;
  }
  cabecalho(q);
  if (v.tela === 'branco') {
    escrever(q, 'VOTO EM BRANCO', VISOR.x + VISOR.l / 2, VISOR.y + 62, C.tinta, { tamanho: 'grande', alinhar: 'centro' });
    rodape(q);
    return;
  }
  caixasDoNumero(q, v.digitos, piscar);
  if (v.digitos.length < 2) return;
  const c = candidatoDoNumero(Number(v.digitos));
  if (!c) {
    tx(q, 'NÚMERO ERRADO', 5, 70);
    if (piscar) escrever(q, 'VOTO NULO', VISOR.x + 90, VISOR.y + 84, C.tinta, { tamanho: 'grande', alinhar: 'centro' });
    rodape(q);
    return;
  }
  const valor = (rotulo: string, texto: string, y: number) => {
    const x = 5 + medir(rotulo) + 4;
    tx(q, rotulo, 5, y);
    tx(q, caber(texto, 164 - x), x, y);
  };
  valor('NOME:', c.nome, 68);
  valor('PARTIDO:', c.partido, 78);
  tx(q, 'VICE-PRESIDENTE:', 5, 88);
  tx(q, caber(c.vice, 150), 13, 97);
  moldurado(q, rosto(c.numero, 'titular'), 174, 6);
  moldurado(q, rosto(c.numero, 'vice'), 182, 56);
  rodape(q);
}

function ampliarEm(q: Quadro, s: Quadro, x: number, y: number, k: number) {
  for (let yy = 0; yy < s.altura; yy++) for (let xx = 0; xx < s.largura; xx++) {
    const c = s.px[yy * s.largura + xx];
    if (c) retangulo(q, x + xx * k, y + yy * k, k, k, c);
  }
}

/** A cola do eleitor, presa na parede da cabine por cima de tudo: os números em ordem. */
function cola(q: Quadro): Regiao {
  const l = 250, a = 118, x = Math.round((W - l) / 2), y = 40;
  retangulo(q, x + 3, y + 3, l, a, C.paredeEscura);
  caixa(q, x, y, l, a, C.papel, C.papelSombra);
  retangulo(q, x + l / 2 - 16, y - 3, 32, 7, C.fita);
  escrever(q, 'COLA - PRESIDENTE', x + l / 2, y + 9, C.tinta, { alinhar: 'centro' });
  const porColuna = Math.ceil(CANDIDATOS.length / 2);
  CANDIDATOS.forEach((c, i) => {
    const cx = x + 10 + (i >= porColuna ? l / 2 : 0), cy = y + 22 + (i % porColuna) * 12;
    escrever(q, String(c.numero), cx, cy, C.tinta);
    escrever(q, caber(c.nome, l / 2 - 30), cx + 14, cy, C.tinta);
  });
  escrever(q, 'TAB FECHA', x + l - 6, y + a - 9, C.cinza, { alinhar: 'direita' });
  return { x, y, l, a, alvo: { tipo: 'cola' } };
}

export function desenharCabine(q: Quadro, d: DadosDaCabine): Regiao[] {
  fundo(q);
  desenharVisor(q, d.visor, d.piscar);
  const regioes: Regiao[] = [];
  for (const t of Object.keys(TECLAS) as Tecla[]) regioes.push(tecla(q, t, d.apertada === t));
  // O botão da cola, no canto de cima do teclado.
  caixa(q, 332, 20, 40, 13, d.cola ? C.papel : C.corpoClaro, C.contorno);
  escrever(q, 'COLA', 352, 24, C.tinta, { alinhar: 'centro' });
  regioes.push({ x: 332, y: 20, l: 40, a: 13, alvo: { tipo: 'cola' } });
  if (d.dedo) dedo(q, d.dedo, d.apertada === d.dedo);
  if (d.cola) regioes.push(cola(q));
  return regioes;
}

/** A capa da urna no menu de jogos: o corpo cinza, a tela com o FIM e o teclado, em 48x32. */
export function desenharCapa(q: Quadro) {
  const l = q.largura, a = q.altura;
  retangulo(q, 0, 0, l, a, cor('#2e6fb0'));
  const x = Math.round((l - 44) / 2), y = Math.round((a - 28) / 2);
  retangulo(q, x, y + 1, 44, 27, C.contorno);
  retangulo(q, x + 1, y, 42, 28, C.contorno);
  retangulo(q, x + 1, y + 1, 42, 26, C.corpo);
  retangulo(q, x + 1, y + 1, 42, 1, C.corpoClaro);
  retangulo(q, x + 3, y + 4, 23, 17, C.moldura);
  retangulo(q, x + 4, y + 5, 21, 15, C.visor);
  escrever(q, 'FIM', x + 15, y + 10, C.tinta, { alinhar: 'centro' });
  for (let i = 0; i < 9; i++) retangulo(q, x + 28 + (i % 3) * 3, y + 6 + Math.floor(i / 3) * 3, 2, 2, C.tecla);
  retangulo(q, x + 31, y + 15, 2, 2, C.tecla);
  retangulo(q, x + 37, y + 6, 4, 2, C.branco);
  retangulo(q, x + 37, y + 9, 4, 2, C.laranja);
  retangulo(q, x + 37, y + 12, 4, 5, C.verde);
}
