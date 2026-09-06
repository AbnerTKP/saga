import test from 'node:test';
import assert from 'node:assert/strict';
import { paraParametro, marcarLido, deTexto } from './leituras.ts';

test('marcadores viram o parâmetro que o servidor entende', () => {
  assert.equal(paraParametro({ 3: 40, 7: 12 }), '3:40,7:12');
  assert.equal(paraParametro({}), '');
});

test('sala ou mensagem sem sentido não entra no parâmetro', () => {
  assert.equal(paraParametro({ 0: 5, [-2]: 9, 4: 0, 6: 11 }), '6:11');
});

test('o marcador só anda para a frente', () => {
  const m = marcarLido({}, 3, 10);
  assert.deepEqual(m, { 3: 10 });
  assert.equal(marcarLido(m, 3, 4), m, 'resposta atrasada não desmarca o que já foi lido');
  assert.equal(marcarLido(m, 3, 10), m, 'o mesmo id não cria objeto novo');
  assert.deepEqual(marcarLido(m, 3, 11), { 3: 11 });
});

test('marcar sala ou mensagem inválida não muda nada', () => {
  const m = { 3: 10 };
  assert.equal(marcarLido(m, 0, 5), m);
  assert.equal(marcarLido(m, 3, 0), m);
});

test('o que foi guardado volta; lixo volta vazio', () => {
  assert.deepEqual(deTexto('{"3":40}'), { 3: 40 });
  assert.deepEqual(deTexto('não é json'), {});
  assert.deepEqual(deTexto(null), {});
  assert.deepEqual(deTexto('[1,2,3]'), {});
  assert.deepEqual(deTexto('{"3":"muito","4":8}'), { 4: 8 });
});
