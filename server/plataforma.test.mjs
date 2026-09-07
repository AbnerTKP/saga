import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta } from './contas.mjs';
import { garantirMembro, buscarMembro } from './membros.mjs';
import { garantirDonoDaSaga, ehDonoDaSaga, listarContas, definirBerserk } from './plataforma.mjs';

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
    ['apelido', 'berserk', 'criadoEm', 'dono', 'foto', 'id', 'servidores'].sort());
  assert.equal(a.servidores, 1);
});

test('conta que não existe não recebe Berserk', () => {
  const { db, cria } = cenario();
  const abner = cria('abner', true);
  garantirDonoDaSaga(db, 'abner');
  assert.throws(() => definirBerserk(db, abner.id, 9999, true), /não existe/);
});
