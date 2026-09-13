import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anotarOnde, descreverTela, montarRelato, nomeDoSistema, ondeEstou, podeEnviar, REGISTRO_MAXIMO } from './relato.ts';

const base = { texto: '  o som sumiu  ', anexarRegistro: true, registro: 'linha', versao: '0.50.0', sistema: 'Mac', servidor: 'CORNUME', tela: 'sala Geral' };

test('o registro vai só no erro, e só marcado', () => {
  assert.equal(montarRelato({ ...base, tipo: 'erro' }).registro, 'linha');
  assert.equal(montarRelato({ ...base, tipo: 'erro', anexarRegistro: false }).registro, null);
  assert.equal(montarRelato({ ...base, tipo: 'melhoria' }).registro, null);
  assert.equal(montarRelato({ ...base, tipo: 'erro', registro: '   ' }).registro, null);
});

test('o texto vai aparado, o contexto inteiro, e o registro grande vai do fim', () => {
  const r = montarRelato({ ...base, tipo: 'erro', registro: 'x'.repeat(REGISTRO_MAXIMO) + 'fim' });
  assert.equal(r.texto, 'o som sumiu');
  assert.deepEqual(r.contexto, { versao: '0.50.0', sistema: 'Mac', servidor: 'CORNUME', tela: 'sala Geral' });
  assert.equal(r.registro!.length, REGISTRO_MAXIMO);
  assert.ok(r.registro!.endsWith('fim'));
});

test('a tela em palavras', () => {
  const t = { logado: true, semServidor: false, jogo: null, conversas: false, sala: 'Geral' } as const;
  assert.equal(descreverTela({ ...t, logado: false }), 'entrada');
  assert.equal(descreverTela({ ...t, semServidor: true }), 'tela inicial');
  assert.equal(descreverTela({ ...t, jogo: 'corrida' }), 'Fórmula 1');
  assert.equal(descreverTela({ ...t, conversas: true }), 'conversas');
  assert.equal(descreverTela(t), 'sala Geral');
  assert.equal(descreverTela({ ...t, sala: null }), 'servidor');
});

test('onde estou é o que o App anotou por último', () => {
  anotarOnde('xadrez', 'teste');
  assert.deepEqual(ondeEstou(), { tela: 'xadrez', servidor: 'teste' });
});

test('enviar pede algumas letras, e o sistema tem nome de gente', () => {
  assert.equal(podeEnviar(' a '), false);
  assert.equal(podeEnviar('som'), true);
  assert.equal(nomeDoSistema('darwin'), 'Mac');
  assert.equal(nomeDoSistema('win32'), 'Windows');
});
