import test from 'node:test';
import assert from 'node:assert/strict';
import { empilhar, tipoDaFalha, DURACAO, QUANTOS, type Aviso } from './avisosDeTela.ts';

const faz = (id: number, texto: string, tipo: Aviso['tipo'] = 'erro'): Aviso =>
  ({ id, tipo, texto, duracao: DURACAO[tipo] });

test('erro fica até fecharem; o resto some sozinho', () => {
  assert.equal(DURACAO.erro, 0);
  assert.ok(DURACAO.aviso > 0 && DURACAO.sucesso > 0 && DURACAO.turbo > 0);
});

test('o mesmo aviso repetido renova, não empilha', () => {
  const pilha = empilhar([faz(1, 'sem internet')], faz(2, 'sem internet'));
  assert.deepEqual(pilha.map((a) => a.id), [2]);
});

test('mesmo texto de tipo diferente são dois avisos', () => {
  const pilha = empilhar([faz(1, 'x', 'erro')], faz(2, 'x', 'turbo'));
  assert.equal(pilha.length, 2);
});

test('a pilha não passa do teto: o mais antigo sai', () => {
  let pilha: Aviso[] = [];
  for (let i = 1; i <= QUANTOS + 3; i++) pilha = empilhar(pilha, faz(i, `n${i}`));
  assert.equal(pilha.length, QUANTOS);
  assert.equal(pilha[0].texto, `n${1 + 3}`);
});

test('o tipo vem do servidor; sem ele, é erro', () => {
  assert.equal(tipoDaFalha({ tipo: 'turbo' }), 'turbo');
  assert.equal(tipoDaFalha({ tipo: 'sucesso' }), 'sucesso');
  assert.equal(tipoDaFalha({ tipo: 'inventado' }), 'erro');
  assert.equal(tipoDaFalha(new Error('caiu a rede')), 'erro');
  assert.equal(tipoDaFalha(null), 'erro');
});
