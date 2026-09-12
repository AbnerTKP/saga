import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta, trocarSenha } from './contas.mjs';
import { garantirMembro, buscarMembro } from './membros.mjs';
import { garantirDonoDaSaga, ehDonoDaSaga, listarContas, definirBerserk, emitirRecuperacao } from './plataforma.mjs';

function cenario() {
  const db = abrirBanco(':memory:');
  const servidor = garantirServidor(db, { nome: 'Casa', salas: ['Geral'] });
  const cria = (apelido, dono) => {
    const u = criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
    garantirMembro(db, servidor.id, u, { dono: dono ? apelido : undefined });
    return u;
  };
  return { db, sid: servidor.id, cria };
}

test('o dono da Saga é da conta, não de um cargo de servidor', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true);   // dono DO SERVIDOR
  assert.equal(ehDonoDaSaga(db, abner.id), false, 'mandar num servidor não é mandar na Saga');
  garantirDonoDaSaga(db, 'abner');
  assert.equal(ehDonoDaSaga(db, abner.id), true);
});

test('o dono só é semeado uma vez: reiniciar não transfere o app', () => {
  const { db, cria } = cenario();
  const abner = cria('abner'), bruno = cria('bruno');
  garantirDonoDaSaga(db, 'abner');
  // .env trocado, servidor reiniciado: não pode tirar de quem já é.
  assert.equal(garantirDonoDaSaga(db, 'bruno'), null);
  assert.equal(ehDonoDaSaga(db, abner.id), true);
  assert.equal(ehDonoDaSaga(db, bruno.id), false);
});

test('apelido que não existe não vira dono, e não quebra', () => {
  const { db, cria } = cenario();
  cria('abner');
  assert.equal(garantirDonoDaSaga(db, 'ninguem'), null);
  assert.equal(garantirDonoDaSaga(db, ''), null);
});

test('só o dono da Saga vê as contas e mexe no Berserk', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true), bruno = cria('bruno');
  garantirDonoDaSaga(db, 'abner');
  assert.throws(() => listarContas(db, bruno.id), /dono da Saga/);
  assert.throws(() => definirBerserk(db, bruno.id, abner.id, true), /dono da Saga/);
  assert.equal(listarContas(db, abner.id).length, 2);
});

test('o Berserk dado no painel vale em qualquer servidor', () => {
  const { db, sid, cria } = cenario();
  const abner = cria('abner', true), bruno = cria('bruno');
  garantirDonoDaSaga(db, 'abner');

  const outro = garantirServidor(db, { nome: 'Outro', salas: ['Geral'] });
  garantirMembro(db, outro.id, { id: bruno.id, apelido: 'bruno' });

  definirBerserk(db, abner.id, bruno.id, true);
  assert.equal(buscarMembro(db, sid, bruno.id).turbo, 1);
  assert.equal(buscarMembro(db, outro.id, bruno.id).turbo, 1);

  definirBerserk(db, abner.id, bruno.id, false);
  assert.equal(buscarMembro(db, outro.id, bruno.id).turbo, 0);
});

test('a lista traz o que o painel precisa desenhar', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true); cria('bruno');
  garantirDonoDaSaga(db, 'abner');
  const [a] = listarContas(db, abner.id);
  assert.deepEqual(Object.keys(a).sort(),
    ['apelido', 'berserk', 'criadoEm', 'dono', 'foto', 'id', 'recuperacaoAte', 'servidores'].sort());
  assert.equal(a.servidores, 1);
});

test('conta que não existe não recebe Berserk', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true);
  garantirDonoDaSaga(db, 'abner');
  assert.throws(() => definirBerserk(db, abner.id, 9999, true), /não existe/);
});

test('só o dono da Saga gera código de senha, e só para conta que existe', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true), bruno = cria('bruno');
  garantirDonoDaSaga(db, 'abner');
  // Mandar num servidor não é mandar na Saga — e nem para a própria conta passa.
  assert.throws(() => emitirRecuperacao(db, bruno.id, bruno.id, 'segredo123'), /dono da Saga/);
  assert.throws(() => emitirRecuperacao(db, bruno.id, abner.id, 'segredo123'), /dono da Saga/);
  assert.throws(() => emitirRecuperacao(db, abner.id, 9999, 'segredo123'), (e) => e.status === 404);
  assert.equal(db.prepare('SELECT count(*) c FROM recuperacoes').get().c, 0);
});

test('gerar código pede a senha do dono: sessão aberta não prova quem está no teclado', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true), bruno = cria('bruno');
  garantirDonoDaSaga(db, 'abner');
  // 403 e nunca 401: o app lê 401 como "a sessão caiu" e deslogaria o dono por errar a senha.
  for (const senha of [undefined, '', 'naoeessa', 12345678, { a: 1 }]) {
    assert.throws(() => emitirRecuperacao(db, abner.id, bruno.id, senha),
      (e) => e.status === 403 && e.message === 'A sua senha não confere.', `passou com ${JSON.stringify(senha)}`);
  }
  // A senha de quem é alvo não serve: é a do dono que atesta.
  trocarSenha(db, abner.id, 'senhadodono1');
  assert.throws(() => emitirRecuperacao(db, abner.id, bruno.id, 'segredo123'), (e) => e.status === 403);
  assert.equal(db.prepare('SELECT count(*) c FROM recuperacoes').get().c, 0);
  assert.ok(emitirRecuperacao(db, abner.id, bruno.id, 'senhadodono1').codigo);
});

test('o dono não gera código para a própria conta, nem com a senha certa', () => {
  // Usar o código derrubaria todas as sessões do único dono da Saga, e sem sessão de dono
  // ninguém gera código para ele: a volta seria só pela VPS. Quem sabe a senha troca em
  // "Sua conta".
  const { db, cria } = cenario();
  const abner = cria('abner', true);
  garantirDonoDaSaga(db, 'abner');
  for (const alvo of [abner.id, String(abner.id)]) {
    assert.throws(() => emitirRecuperacao(db, abner.id, alvo, 'segredo123'),
      (e) => e.status === 403 && /Sua conta/.test(e.message));
  }
  assert.equal(db.prepare('SELECT count(*) c FROM recuperacoes').get().c, 0);
});

test('o código sai uma vez, e a lista de contas mostra só até quando ele vale', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true), bruno = cria('bruno');
  garantirDonoDaSaga(db, 'abner');
  const { codigo, expiraEm, conta } = emitirRecuperacao(db, abner.id, bruno.id, 'segredo123');
  assert.match(codigo, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(conta.recuperacaoAte, expiraEm);
  // No formato da lista, porque a tela troca a linha pela conta devolvida.
  const lista = listarContas(db, abner.id);
  assert.deepEqual(conta, lista.find((c) => c.id === bruno.id));
  assert.equal(lista.find((c) => c.id === abner.id).recuperacaoAte, null);

  const tudo = JSON.stringify(lista);
  assert.ok(!tudo.includes(codigo) && !tudo.includes(codigo.replace('-', '')), 'o código vazou na lista');
  assert.ok(!tudo.includes('scrypt$'), 'um hash vazou na lista');
});
