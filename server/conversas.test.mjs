// A conversa privada: só entre amigos, da conta e não de um servidor, com a mesma
// mensagem do chat das salas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta } from './contas.mjs';
import { garantirMembro } from './membros.mjs';
import { pedir, responder, desfazer } from './amigos.mjs';
import { abrir, ver, minhas, listarMensagens, enviar, apagadasDesde } from './conversas.mjs';
import { apagarMensagem } from './mensagens.mjs';

function cenario() {
  const db = abrirBanco(':memory:');
  const servidor = garantirServidor(db, { nome: 'CORNUME', salas: ['Geral'] });
  const cria = (apelido) => {
    const u = criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
    garantirMembro(db, servidor.id, u, {});
    return u;
  };
  const amigos = (a, b) => { pedir(db, a, { apelido: b.apelido }); responder(db, b, a.id, true); };
  return { db, sid: servidor.id, cria, amigos };
}

const recusou = (fn) => {
  try { fn(); return null; } catch (e) { return { mensagem: e.message, status: e.status }; }
};

test('sem amizade não há conversa, mesmo no mesmo servidor', () => {
  const { db, cria } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');

  const erro = recusou(() => abrir(db, tkp, juninho.id));
  assert.equal(erro.status, 403);
  assert.match(erro.mensagem, /amigos/);
});

test('abrir duas vezes devolve a MESMA conversa', () => {
  const { db, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  amigos(tkp, juninho);

  const a = abrir(db, tkp, juninho.id);
  const b = abrir(db, juninho, tkp.id);   // do outro lado, e é a mesma
  assert.equal(a.id, b.id);
});

test('a conversa é de quem está nela: para os outros, ela não existe', () => {
  const { db, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho'), blankito = cria('blankito');
  amigos(tkp, juninho);
  const { id } = abrir(db, tkp, juninho.id);

  // 404 e não 403: conversa que você não vê responde igual a conversa que não existe.
  assert.equal(recusou(() => ver(db, blankito, id)).status, 404);
  assert.equal(recusou(() => listarMensagens(db, blankito, id)).status, 404);
  assert.equal(recusou(() => enviar(db, blankito, id, 'oi')).status, 404);
});

test('a mensagem vai e volta com a CONTA — sem cargo e sem identificador', () => {
  const { db, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  amigos(tkp, juninho);
  const { id } = abrir(db, tkp, juninho.id);

  const mandada = enviar(db, tkp, id, 'oi, só nós dois');
  assert.equal(mandada.texto, 'oi, só nós dois');
  assert.equal(mandada.nome, 'tkp');
  assert.equal(mandada.idExibido, null);

  const lidas = listarMensagens(db, juninho, id);
  assert.deepEqual(lidas.map((m) => m.texto), ['oi, só nós dois']);
});

test('desfazer a amizade fecha o campo de escrever e guarda o que já foi dito', () => {
  const { db, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  amigos(tkp, juninho);
  const { id } = abrir(db, tkp, juninho.id);
  enviar(db, tkp, id, 'combinado');

  desfazer(db, juninho, tkp.id);

  assert.equal(ver(db, tkp, id).podeEscrever, false);
  assert.equal(recusou(() => enviar(db, tkp, id, 'e aí?')).status, 403);
  // O que foi dito continua lá: acabar a amizade não apaga a conversa dos dois.
  assert.deepEqual(listarMensagens(db, tkp, id).map((m) => m.texto), ['combinado']);
  // E volta a valer quando voltam a ser amigos.
  amigos(tkp, juninho);
  assert.equal(ver(db, tkp, id).podeEscrever, true);
});

test('a lista traz o outro, a prévia e quanto falta ler', () => {
  const { db, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  amigos(tkp, juninho);
  const { id } = abrir(db, tkp, juninho.id);

  enviar(db, tkp, id, 'to subindo');
  const minhaVez = enviar(db, juninho, id, 'te espero no Geral');

  const doTkp = minhas(db, tkp);
  assert.equal(doTkp.length, 1);
  assert.equal(doTkp[0].com.nome, 'juninho');
  assert.equal(doTkp[0].previa, 'te espero no Geral');
  assert.equal(doTkp[0].naoLidas, 1);

  // Com o marcador na última, não falta nada.
  assert.equal(minhas(db, tkp, new Map([[id, minhaVez.id]]))[0].naoLidas, 0);
  // E o que EU escrevi nunca conta como não lido para mim.
  assert.equal(minhas(db, juninho)[0].naoLidas, 1);
  assert.equal(minhas(db, juninho)[0].previa, 'você: te espero no Geral');
});

test('numa conversa privada cada um apaga só o que disse', () => {
  const { db, sid, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  amigos(tkp, juninho);
  const { id } = abrir(db, tkp, juninho.id);
  const minha = enviar(db, tkp, id, 'esquece isso');

  // Não há cargo entre duas pessoas: nem o dono do servidor apaga o que o outro disse.
  assert.equal(recusou(() => apagarMensagem(db, sid, juninho, minha.id)).status, 403);
  apagarMensagem(db, sid, tkp, minha.id);
  assert.deepEqual(listarMensagens(db, juninho, id), []);
});

test('a mensagem apagada aparece como sumida para a outra tela', () => {
  const { db, sid, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  amigos(tkp, juninho);
  const { id } = abrir(db, tkp, juninho.id);
  const m = enviar(db, tkp, id, 'erro');
  const antes = Date.now();

  apagarMensagem(db, sid, tkp, m.id);
  assert.deepEqual(apagadasDesde(db, juninho, id, antes), [m.id]);
  // De quem não é da conversa, nem isso: a lista vem vazia.
  assert.deepEqual(apagadasDesde(db, cria('blankito'), id, antes), []);
});

test('a conversa sobrevive a sair do servidor onde vocês se conheceram', () => {
  const { db, sid, cria, amigos } = cenario();
  const tkp = cria('tkp'), juninho = cria('juninho');
  amigos(tkp, juninho);
  const { id } = abrir(db, tkp, juninho.id);
  enviar(db, tkp, id, 'vamos jogar amanhã');

  // O vínculo com o servidor some; a conta e a amizade ficam.
  db.prepare('DELETE FROM membros WHERE servidor_id = ? AND usuario_id = ?').run(sid, juninho.id);

  assert.equal(ver(db, juninho, id).podeEscrever, true);
  assert.deepEqual(listarMensagens(db, juninho, id).map((m) => m.texto), ['vamos jogar amanhã']);
  assert.equal(enviar(db, juninho, id, 'bora').texto, 'bora');
});
