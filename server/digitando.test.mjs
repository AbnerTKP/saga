import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRegistroDeDigitacao, VALIDADE } from './digitando.mjs';

const nomes = (lista) => lista.map((q) => q.nome);

test('quem avisou aparece, e quem perguntou não aparece para si mesmo', () => {
  const r = criarRegistroDeDigitacao();
  r.avisar(7, { id: 1, nome: 'Bagre' }, 1000);
  r.avisar(7, { id: 2, nome: 'Tava1' }, 1000);

  assert.deepEqual(nomes(r.quemEsta(7, { exceto: 1, agora: 1000 })), ['Tava1']);
  assert.deepEqual(nomes(r.quemEsta(7, { exceto: 2, agora: 1000 })), ['Bagre']);
  assert.deepEqual(nomes(r.quemEsta(7, { agora: 1000 })), ['Bagre', 'Tava1'], 'em ordem de nome');
});

test('o aviso vence sozinho: quem parou de escrever some', () => {
  const r = criarRegistroDeDigitacao();
  r.avisar(7, { id: 1, nome: 'Bagre' }, 1000);

  assert.equal(r.quemEsta(7, { agora: 1000 + VALIDADE - 1 }).length, 1);
  assert.equal(r.quemEsta(7, { agora: 1000 + VALIDADE }).length, 0, 'ficou digitando para sempre');
});

test('avisar de novo estende o prazo em vez de criar outro', () => {
  const r = criarRegistroDeDigitacao();
  r.avisar(7, { id: 1, nome: 'Bagre' }, 1000);
  r.avisar(7, { id: 1, nome: 'Bagre' }, 5000);

  const lista = r.quemEsta(7, { agora: 1000 + VALIDADE });
  assert.deepEqual(nomes(lista), ['Bagre'], 'quem continua escrevendo não pode sumir');
});

test('mandar a mensagem tira a frase na hora', () => {
  // Sem isto, "Fulano está digitando" ficaria embaixo da mensagem que o Fulano
  // acabou de mandar, por mais alguns segundos — que é o pior momento possível.
  const r = criarRegistroDeDigitacao();
  r.avisar(7, { id: 1, nome: 'Bagre' }, 1000);
  r.parou(7, 1);
  assert.deepEqual(r.quemEsta(7, { agora: 1000 }), []);
});

test('cada sala tem a sua lista', () => {
  const r = criarRegistroDeDigitacao();
  r.avisar(7, { id: 1, nome: 'Bagre' }, 1000);
  r.avisar(9, { id: 2, nome: 'Tava1' }, 1000);

  assert.deepEqual(nomes(r.quemEsta(7, { agora: 1000 })), ['Bagre']);
  assert.deepEqual(nomes(r.quemEsta(9, { agora: 1000 })), ['Tava1']);
  assert.deepEqual(r.quemEsta(123, { agora: 1000 }), [], 'sala sem ninguém não é erro');
});

test('a memória não cresce: sala que venceu é esquecida', () => {
  // São cinco amigos, mas um mapa que só cresce é um vazamento igual — e este vive
  // dentro de um processo que fica meses de pé.
  const r = criarRegistroDeDigitacao();
  for (let sala = 1; sala <= 50; sala++) r.avisar(sala, { id: 1, nome: 'Bagre' }, 1000);
  assert.equal(r.tamanho, 50);

  for (let sala = 1; sala <= 50; sala++) r.quemEsta(sala, { agora: 1000 + VALIDADE });
  assert.equal(r.tamanho, 0, 'as salas vencidas ficaram guardadas');
});
