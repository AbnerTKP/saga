import test from 'node:test';
import assert from 'node:assert/strict';
import { podeTocar, criarAvisos, INTERVALO, type Aviso } from './avisos.ts';

test('o primeiro aviso sempre toca', () => {
  assert.equal(podeTocar(1000, undefined, false), true);
});

test('ouvido desligado não toca nada', () => {
  assert.equal(podeTocar(1000, undefined, true), false);
  assert.equal(podeTocar(9999, 1000, true), false);
});

test('três pessoas entrando juntas não viram três sons', () => {
  assert.equal(podeTocar(1000, 1000, false), false);
  assert.equal(podeTocar(1000 + INTERVALO - 1, 1000, false), false);
});

test('passado o intervalo, o aviso volta a tocar', () => {
  assert.equal(podeTocar(1000 + INTERVALO, 1000, false), true);
  assert.equal(podeTocar(60_000, 1000, false), true);
});

/** Um arquivo por aviso, com o nome no lugar da URL: o teste só precisa distinguir. */
const ARQUIVOS: Record<Aviso, string> = {
  entrou: 'a', saiu: 'b', live: 'c', convite: 'd', mensagem: 'e', lance: 'f',
  fimDaPartida: 'g', liveEntrou: 'h', liveSaiu: 'i', micLigou: 'j', micMutou: 'k',
};

test('cada aviso tem o próprio relógio: "entrou" não cala "live"', () => {
  const tocados: string[] = [];
  const avisar = criarAvisos(ARQUIVOS, (url) => tocados.push(url));

  assert.equal(avisar('entrou', false, 1000), true);
  assert.equal(avisar('entrou', false, 1100), false, 'repetido rápido demais');
  assert.equal(avisar('live', false, 1100), true, 'som diferente não é afetado');
  assert.deepEqual(tocados, ['a', 'c']);
});

test('ouvido desligado não toca e nem marca o relógio', () => {
  const tocados: string[] = [];
  const avisar = criarAvisos(ARQUIVOS, (url) => tocados.push(url));

  assert.equal(avisar('entrou', true, 1000), false);
  assert.equal(avisar('entrou', false, 1010), true, 'religou o ouvido e o próximo toca');
  assert.deepEqual(tocados, ['a']);
});
