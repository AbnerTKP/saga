/**
 * A regra da Urna, sem tela: onde o bonequinho está, em que passo da seção eleitoral ele vai, o que
 * a urna mostra e o voto que sai dela. A tela (`TelaDaUrna`) só lê o estado, desenha e manda o voto
 * ao servidor; tudo aqui é testado sem `canvas`.
 *
 * O caminho é o de uma seção de verdade: chegar à mesa e entregar o título (a mesária pede, o título
 * da Saga aparece, o mesário libera), ir à cabine, digitar o número, CONFIRMA, FIM — e a apuração. Pode
 * votar de novo quantas vezes quiser, e a mesária repara.
 */
import type { Fala } from './secao.ts';
import { LUGARES } from './secao.ts';
import type { Tecla } from './comum.ts';
import { candidatoDoNumero } from './candidatos.ts';
import type { Visor } from './cabine.ts';

export type Escolha = number | 'branco' | 'nulo';

export type Etapa = 'semTitulo' | 'pedindo' | 'titulo' | 'liberando' | 'liberado';

export type EstadoDaUrna = {
  fase: 'secao' | 'cabine' | 'apuracao';
  x: number;
  virado: 'direita' | 'esquerda';
  /** Tempo andando, para o passo; -1 parado. */
  andando: number;
  etapa: Etapa;
  /** Um recado de passagem ("primeiro o título"), que some com ESPAÇO ou andando. */
  recado: Fala | null;
  visor: Visor;
  apertada: Tecla | null;
  apertadaPor: number;
  dedo: Tecla | null;
  dedoPor: number;
  cola: boolean;
  /** Quanto tempo o FIM está na tela. */
  noFim: number;
  /** O voto que acabou de ser confirmado e ainda não foi mandado. A tela manda e limpa. */
  voto: Escolha | null;
  /** Quantas vezes votou desde que abriu o jogo: a mesária repara, e o adesivo aparece. */
  votos: number;
  selecionado: 0 | 1;
  /** Pediu para fechar o jogo. */
  saiu: boolean;
};

export type Som = 'tecla' | 'fim';

export const VELOCIDADE = 90;
const PERTO = 18;
const LIMITE = { min: 14, max: 372 };
/** O FIM fica na tela o tempo do som dele, e mais um pouco. */
export const TEMPO_DO_FIM = 1.6;

export function novoEstado(votos = 0): EstadoDaUrna {
  return {
    fase: 'secao', x: LUGARES.porta, virado: 'direita', andando: -1, etapa: 'semTitulo', recado: null,
    visor: { tela: 'numero', digitos: '' }, apertada: null, apertadaPor: 0, dedo: null, dedoPor: 0, cola: false,
    noFim: 0, voto: null, votos, selecionado: 0, saiu: false,
  };
}

const naMesa = (e: EstadoDaUrna) => Math.abs(e.x - LUGARES.mesa) <= PERTO;
const naCabine = (e: EstadoDaUrna) => Math.abs(e.x - LUGARES.cabine) <= PERTO;

/** A fala da mesa em cada etapa — é ela que trava o andar enquanto está aberta. */
export function falaDaMesa(e: EstadoDaUrna): Fala | null {
  if (e.etapa === 'pedindo') {
    return { quem: 'Mesária', texto: e.votos === 0 ? 'Bom dia! Documento, por favor.' : 'Você de novo? Documento, por favor.' };
  }
  if (e.etapa === 'liberando') {
    return e.votos === 0
      ? { quem: 'Mesário', texto: 'Hum... República da Saga? Parece verdadeiro. Pode votar!' }
      : { quem: 'Mesário', texto: `Já é a vez número ${e.votos + 1} com esse título... Tá bom, pode votar.` };
  }
  return e.recado;
}

/** O que aparece em cima da cabeça. */
export function dicaDaSecao(e: EstadoDaUrna): string | null {
  if (e.fase !== 'secao' || falaDaMesa(e) || e.etapa === 'titulo') return null;
  if (naMesa(e) && e.etapa === 'semTitulo') return 'ESPAÇO: ENTREGAR O TÍTULO';
  if (naCabine(e) && e.etapa === 'liberado') return 'ESPAÇO: ENTRAR NA CABINE';
  if (e.x <= LUGARES.porta + 6 && e.votos === 0) return 'ANDE ATÉ A MESA >';
  return null;
}

const travado = (e: EstadoDaUrna) => e.etapa === 'pedindo' || e.etapa === 'titulo' || e.etapa === 'liberando';

/** Anda (−1, 0 ou 1) por `dt` segundos. Fala aberta segura o bonequinho no lugar. */
export function andar(e: EstadoDaUrna, direcao: -1 | 0 | 1, dt: number) {
  if (e.fase !== 'secao' || travado(e) || direcao === 0) {
    e.andando = -1;
    return;
  }
  e.recado = null;
  e.virado = direcao > 0 ? 'direita' : 'esquerda';
  e.x = Math.max(LIMITE.min, Math.min(LIMITE.max, e.x + direcao * VELOCIDADE * dt));
  e.andando = Math.max(0, e.andando) + dt;
}

/** O passo do desenho: de 0 a 3 andando, −1 parado. */
export const passoDoDesenho = (e: EstadoDaUrna) => (e.andando < 0 ? -1 : Math.floor(e.andando * 8) % 4);

/** ESPAÇO (ou Enter) na seção: fala com a mesa, passa a conversa, entra na cabine. */
export function agir(e: EstadoDaUrna) {
  if (e.fase === 'apuracao') {
    if (e.selecionado === 1) e.saiu = true;
    else Object.assign(e, novoEstado(e.votos), { voto: e.voto });
    return;
  }
  if (e.fase !== 'secao') return;
  if (e.etapa === 'pedindo') { e.etapa = 'titulo'; return; }
  if (e.etapa === 'titulo') { e.etapa = 'liberando'; return; }
  if (e.etapa === 'liberando') { e.etapa = 'liberado'; return; }
  if (e.recado) { e.recado = null; return; }
  if (naMesa(e) && e.etapa === 'semTitulo') { e.etapa = 'pedindo'; e.andando = -1; return; }
  if (naCabine(e)) {
    if (e.etapa !== 'liberado') {
      e.recado = { quem: 'Mesária', texto: 'Ei! Primeiro o título, aqui na mesa.' };
      return;
    }
    e.fase = 'cabine';
    e.visor = { tela: 'numero', digitos: '' };
    e.apertada = null; e.dedo = null; e.cola = false; e.noFim = 0;
  }
}

/** Uma tecla da urna. Devolve o som que ela faz, se fez algum. */
export function teclar(e: EstadoDaUrna, t: Tecla): Som | null {
  if (e.fase !== 'cabine' || e.visor.tela === 'fim') return null;
  e.cola = false;
  e.apertada = t; e.apertadaPor = 0.12;
  e.dedo = t; e.dedoPor = 1.4;
  const v = e.visor;
  if (t === 'corrige') {
    e.visor = { tela: 'numero', digitos: '' };
    return 'tecla';
  }
  if (t === 'branco') {
    // Como na urna: branco só com a tela vazia; com número digitado, primeiro CORRIGE.
    if (v.tela === 'numero' && v.digitos === '') e.visor = { tela: 'branco' };
    return 'tecla';
  }
  if (t === 'confirma') {
    const voto = escolhaDoVisor(v);
    if (voto === null) return 'tecla';
    e.voto = voto;
    e.votos += 1;
    e.visor = { tela: 'fim' };
    e.noFim = 0;
    return 'fim';
  }
  if (v.tela === 'numero' && v.digitos.length < 2) e.visor = { tela: 'numero', digitos: v.digitos + t };
  return 'tecla';
}

/** O que o CONFIRMA grava com a tela assim; `null` é "ainda não dá para confirmar". */
export function escolhaDoVisor(v: Visor): Escolha | null {
  if (v.tela === 'branco') return 'branco';
  if (v.tela !== 'numero' || v.digitos.length < 2) return null;
  const n = Number(v.digitos);
  return candidatoDoNumero(n) ? n : 'nulo';
}

/** Esc: fecha a cola; na cabine, sai dela (o voto não sai); fora, fecha o jogo. */
export function voltar(e: EstadoDaUrna) {
  if (e.fase === 'cabine') {
    if (e.cola) { e.cola = false; return; }
    if (e.visor.tela === 'fim') return;
    e.fase = 'secao';
    return;
  }
  if (e.fase === 'secao' && (e.recado || travado(e))) {
    e.recado = null;
    if (travado(e)) e.etapa = 'semTitulo';
    return;
  }
  e.saiu = true;
}

export function alternarCola(e: EstadoDaUrna) {
  if (e.fase === 'cabine' && e.visor.tela !== 'fim') e.cola = !e.cola;
}

export function escolherNaApuracao(e: EstadoDaUrna, qual: 0 | 1) {
  if (e.fase === 'apuracao') e.selecionado = qual;
}

/** O tempo passando: a tecla sobe, o dedo sai, e o FIM vira apuração. */
export function avancar(e: EstadoDaUrna, dt: number) {
  if (e.apertadaPor > 0 && (e.apertadaPor -= dt) <= 0) e.apertada = null;
  if (e.dedoPor > 0 && (e.dedoPor -= dt) <= 0 && e.visor.tela !== 'fim') e.dedo = null;
  if (e.fase === 'cabine' && e.visor.tela === 'fim' && (e.noFim += dt) >= TEMPO_DO_FIM) {
    e.fase = 'apuracao';
    e.selecionado = 0;
  }
}

/** Precisa de laço agora? Andando, com tecla afundada, dedo saindo ou FIM contando. Parado, não. */
export const animando = (e: EstadoDaUrna) =>
  e.andando >= 0 || e.apertadaPor > 0 || e.dedoPor > 0 || (e.fase === 'cabine' && e.visor.tela === 'fim');

export type Comando =
  | { tipo: 'andar'; direcao: -1 | 1 }
  | { tipo: 'agir' }
  | { tipo: 'tecla'; tecla: Tecla }
  | { tipo: 'cola' }
  | { tipo: 'voltar' }
  | { tipo: 'escolher'; qual: 0 | 1 };

/** A tecla do teclado de verdade, pela fase: na cabine os números são a urna; fora, as setas andam. */
export function comandoDaTecla(fase: EstadoDaUrna['fase'], code: string): Comando | null {
  if (code === 'Escape') return { tipo: 'voltar' };
  if (fase === 'cabine') {
    const n = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (n) return { tipo: 'tecla', tecla: n[1] as Tecla };
    if (code === 'Enter' || code === 'NumpadEnter') return { tipo: 'tecla', tecla: 'confirma' };
    if (code === 'Backspace' || code === 'Delete' || code === 'KeyC') return { tipo: 'tecla', tecla: 'corrige' };
    if (code === 'KeyB') return { tipo: 'tecla', tecla: 'branco' };
    if (code === 'Tab') return { tipo: 'cola' };
    return null;
  }
  if (fase === 'apuracao') {
    if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') return { tipo: 'escolher', qual: 0 };
    if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') return { tipo: 'escolher', qual: 1 };
  }
  if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || code === 'KeyE') return { tipo: 'agir' };
  if (fase === 'secao') {
    if (code === 'ArrowLeft' || code === 'KeyA') return { tipo: 'andar', direcao: -1 };
    if (code === 'ArrowRight' || code === 'KeyD') return { tipo: 'andar', direcao: 1 };
  }
  return null;
}
