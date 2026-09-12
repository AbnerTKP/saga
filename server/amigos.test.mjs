// A amizade é a porta da conversa privada: sem ela, saber o apelido de alguém bastaria
// para aparecer na tela dele. O que se testa aqui é justamente o que não pode passar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from './banco.mjs';
import { criarConta } from './contas.mjs';
import { pedir, responder, desfazer, listar, saoAmigos } from './amigos.mjs';

function cenario() {
  const db = abrirBanco(':memory:');
  const cria = (apelido) => criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
  return { db, cria };
}

const recusou = (fn) => {
  try { fn(); return null; } catch (e) { return { mensagem: e.message, status: e.status }; }
};

test('pedido aceito vira amizade; antes disso, não são amigos', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');

  pedir(db, tkp, { apelido: 'juninho' });
  assert.equal(saoAmigos(db, tkp.id, juninho.id), false);

  responder(db, juninho, tkp.id, true);
  assert.equal(saoAmigos(db, tkp.id, juninho.id), true);
  // Amizade não tem direção: vale perguntada dos dois lados.
  assert.equal(saoAmigos(db, juninho.id, tkp.id), true);
});

test('o apelido não diferencia maiúscula, e conta que não existe é 404', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp');
  cria('Juninho');
  assert.equal(pedir(db, tkp, { apelido: 'JUNINHO' }).estado, 'pedido');
  assert.equal(recusou(() => pedir(db, tkp, { apelido: 'ninguem' })).status, 404);
});

test('quem pediu não pode aceitar o próprio pedido', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  pedir(db, tkp, { apelido: 'juninho' });

  const erro = recusou(() => responder(db, tkp, juninho.id, true));
  assert.equal(erro.status, 403);
  assert.equal(saoAmigos(db, tkp.id, juninho.id), false);
});

test('pedidos cruzados viram amizade na hora, e não dois pedidos parados', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  pedir(db, juninho, { apelido: 'tkp' });

  assert.equal(pedir(db, tkp, { apelido: 'juninho' }).estado, 'amigos');
  assert.equal(saoAmigos(db, tkp.id, juninho.id), true);
  // Uma linha por par: a lista de cada um mostra o outro uma vez só.
  assert.equal(listar(db, tkp).amigos.length, 1);
  assert.equal(listar(db, juninho).amigos.length, 1);
});

test('não dá para pedir duas vezes, nem pedir a quem já é amigo, nem a si mesmo', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp');
  cria('juninho');

  pedir(db, tkp, { apelido: 'juninho' });
  assert.equal(recusou(() => pedir(db, tkp, { apelido: 'juninho' })).status, 409);
  assert.match(recusou(() => pedir(db, tkp, { apelido: 'tkp' })).mensagem, /se adicionar/);
});

test('a lista separa amigos, quem te chamou e quem você chamou', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho'), blankito = cria('blankito');
  cria('tava1');

  pedir(db, tkp, { apelido: 'juninho' });
  responder(db, juninho, tkp.id, true);
  pedir(db, tkp, { apelido: 'tava1' });          // esperando o outro
  pedir(db, blankito, { apelido: 'tkp' });       // esperando eu

  const minha = listar(db, tkp);
  assert.deepEqual(minha.amigos.map((p) => p.nome), ['juninho']);
  assert.deepEqual(minha.enviados.map((p) => p.nome), ['tava1']);
  assert.deepEqual(minha.recebidos.map((p) => p.nome), ['blankito']);
});

test('recusar apaga o pedido — e o outro pode pedir de novo', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');

  pedir(db, tkp, { apelido: 'juninho' });
  responder(db, juninho, tkp.id, false);
  assert.deepEqual(listar(db, juninho).recebidos, []);
  assert.deepEqual(listar(db, tkp).enviados, []);

  assert.equal(pedir(db, tkp, { apelido: 'juninho' }).estado, 'pedido');
});

test('desfazer amizade tira os dois da lista um do outro', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  pedir(db, tkp, { apelido: 'juninho' });
  responder(db, juninho, tkp.id, true);

  desfazer(db, juninho, tkp.id);
  assert.equal(saoAmigos(db, tkp.id, juninho.id), false);
  assert.deepEqual(listar(db, tkp).amigos, []);
  assert.deepEqual(listar(db, juninho).amigos, []);
});

test('dá para pedir pelo id de quem já está na sua frente, e não só pelo apelido', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  // É este o caminho do menu da pessoa: ali o que se tem na mão é o id, e o nome que
  // aparece é o exibido NAQUELE servidor — que não serve para achar a conta.
  assert.equal(pedir(db, tkp, { alvo: juninho.id }).amigo.nome, 'juninho');
  assert.equal(recusou(() => pedir(db, tkp, { alvo: 9999 })).status, 404);
});

test('a pessoa aparece como CONTA: sem cargo, sem nome exibido, sem identificador', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp');
  cria('juninho');
  const { amigo } = pedir(db, tkp, { apelido: 'juninho' });

  assert.deepEqual(Object.keys(amigo).sort(), ['enquadramento', 'foto', 'id', 'nome', 'status', 'turbo']);
  assert.equal(amigo.nome, 'juninho');
});
