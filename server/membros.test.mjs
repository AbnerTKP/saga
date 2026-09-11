import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta, entrar, usuarioDaSessao } from './contas.mjs';
import { listarCargos } from './cargos.mjs';
import {
  garantirMembro, buscarMembro, listarMembros, impedimento, mudarNomeExibido,
  banir, desbanir, darTimeout, tirarTimeout, expulsar, definirCargo,
  definirIdExibido,
} from './membros.mjs';

function cenario({ dono } = {}) {
  const db = abrirBanco(':memory:');
  const servidor = garantirServidor(db, { nome: 'Cantinho', salas: ['Geral'] });
  // Os três cargos nascem com o servidor; os testes se referem a eles pelo nome.
  const cargos = Object.fromEntries(listarCargos(db, servidor.id).map((c) => [c.nome, c]));
  const cria = (apelido) => {
    const u = criarConta(db, { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' });
    garantirMembro(db, servidor.id, u, { dono });
    return u;
  };
  // Marca alguém como dono da SAGA — outra coisa de criar o servidor. É o que destrava
  // o identificador, que vale em todos os servidores.
  const donoDaSaga = (u) => { db.prepare('UPDATE usuarios SET dono = 1 WHERE id = ?').run(u.id); return u; };
  return { db, sid: servidor.id, cria, cargos, donoDaSaga };
}

test('o primeiro a entrar vira dono; os seguintes, membros', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner'), b = cria('bruno');
  assert.equal(buscarMembro(db, sid, a.id).cargo.dono, true);
  assert.equal(buscarMembro(db, sid, b.id).cargo.nome, 'Membro');
});

test('com DONO definido, só aquele apelido vira dono — mesmo chegando depois', () => {
  const { db, sid, cria } = cenario({ dono: 'abner' });
  const b = cria('bruno');   // chega primeiro
  const a = cria('abner');
  assert.equal(buscarMembro(db, sid, b.id).cargo.nome, 'Membro');
  assert.equal(buscarMembro(db, sid, a.id).cargo.dono, true);
});

test('entrar de novo não duplica nem rebaixa', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner');
  const u = { id: a.id, apelido_chave: 'abner' };
  garantirMembro(db, sid, u);
  assert.equal(db.prepare('SELECT count(*) c FROM membros').get().c, 1);
  assert.equal(buscarMembro(db, sid, a.id).cargo.dono, true);
});

test('sem nome exibido, mostra o apelido; e dá para voltar atrás', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner');
  assert.equal(buscarMembro(db, sid, a.id).nome, 'abner');
  assert.equal(mudarNomeExibido(db, sid, a.id, 'Abner do Vorcaro').nome, 'Abner do Vorcaro');
  assert.equal(mudarNomeExibido(db, sid, a.id, '   ').nome, 'abner', 'vazio devia voltar ao apelido');
});

test('nome exibido aceita espaço, mas não qualquer coisa', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner');
  assert.equal(mudarNomeExibido(db, sid, a.id, 'Abner K').nome, 'Abner K');
  assert.throws(() => mudarNomeExibido(db, sid, a.id, 'x'), /2 a 32/);
  assert.throws(() => mudarNomeExibido(db, sid, a.id, 'y'.repeat(33)), /2 a 32/);
});

test('moderador não bane; o dono bane', () => {
  const { db, sid, cria, cargos } = cenario();
  const dono = cria('abner'), mod = cria('bruno'), membro = cria('caio');
  definirCargo(db, sid, dono.id, mod.id, cargos.Moderador.id);
  // O cargo Moderador nasce sem 'banir': ele modera, mas não expulsa para sempre.
  assert.throws(() => banir(db, sid, mod.id, membro.id), /permite/);
  assert.ok(banir(db, sid, dono.id, membro.id).banido_em);
});

test('banir vale só para este servidor: a sessão da conta continua', () => {
  // Banir derrubava as sessões da CONTA: quem era banido num servidor caía da Saga inteira,
  // inclusive dos servidores dele. Aconteceu com o dono em 11/09/2026.
  const { db, sid, cria } = cenario();
  const dono = cria('abner'); cria('caio');
  const alvo = db.prepare("SELECT id FROM usuarios WHERE apelido = 'caio'").get();
  const { token } = entrar(db, { apelido: 'caio', senha: 'segredo123' });
  banir(db, sid, dono.id, alvo.id);
  assert.ok(usuarioDaSessao(db, token), 'a sessão do banido caiu junto com o banimento');
  assert.match(impedimento(buscarMembro(db, sid, alvo.id)), /banido/);
});

test('quem está banido não entra em sala, e desbanir libera', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'), caio = cria('caio');
  banir(db, sid, dono.id, caio.id);
  assert.match(impedimento(buscarMembro(db, sid, caio.id)), /banido/);
  desbanir(db, sid, dono.id, caio.id);
  assert.equal(impedimento(buscarMembro(db, sid, caio.id)), null);
});

test('timeout impede por um tempo e depois libera sozinho', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'), caio = cria('caio');
  darTimeout(db, sid, dono.id, caio.id, 10);
  const m = buscarMembro(db, sid, caio.id);
  assert.match(impedimento(m), /castigo/);
  // 11 minutos depois já pode
  assert.equal(impedimento(m, Date.now() + 11 * 60_000), null);
  tirarTimeout(db, sid, dono.id, caio.id);
  assert.equal(impedimento(buscarMembro(db, sid, caio.id)), null);
});

test('expulsar tira deste servidor, não derruba a sessão, e deixa voltar', () => {
  const { db, sid, cria } = cenario();
  const dono = cria('abner'); const caio = cria('caio');
  const { token } = entrar(db, { apelido: 'caio', senha: 'segredo123' });
  expulsar(db, sid, dono.id, caio.id);
  assert.equal(buscarMembro(db, sid, caio.id), null, 'o expulso continuou no servidor');
  assert.ok(usuarioDaSessao(db, token), 'a sessão do expulso caiu');
  // Voltar é entrar de novo pelo convite — aqui, o mesmo vínculo que o convite cria.
  garantirMembro(db, sid, caio);
  assert.equal(impedimento(buscarMembro(db, sid, caio.id)), null, 'voltou impedido');
});

test('o dono promove, e o promovido passa a poder moderar', () => {
  const { db, sid, cria, cargos } = cenario();
  const dono = cria('abner'), bruno = cria('bruno'), caio = cria('caio');
  assert.throws(() => darTimeout(db, sid, bruno.id, caio.id, 5), /permite/);
  definirCargo(db, sid, dono.id, bruno.id, cargos.Moderador.id);
  assert.ok(darTimeout(db, sid, bruno.id, caio.id, 5).silenciado_ate);
});

test('ninguém escala sozinho nem encosta em quem criou o servidor', () => {
  const { db, sid, cria, cargos } = cenario();
  const dono = cria('abner'), bruno = cria('bruno');
  assert.throws(() => definirCargo(db, sid, bruno.id, bruno.id, cargos.Moderador.id), /consigo mesmo|permite/);
  assert.throws(() => banir(db, sid, bruno.id, dono.id), /permite|nível ou acima/);
});

test('mandar vem de ter criado o servidor, não de vestir um cargo', () => {
  // O cargo "Dono" chumbado saiu de cena: quem criou tem tudo mesmo usando o cargo mais
  // baixo, e ninguém o alcança. É o que impede um servidor de ficar sem conserto.
  const { db, sid, cria, cargos } = cenario();
  const dono = cria('abner'), bruno = cria('bruno');
  assert.equal(buscarMembro(db, sid, dono.id).cargo.dono, true);
  assert.equal(buscarMembro(db, sid, bruno.id).cargo.dono, false);

  definirCargo(db, sid, dono.id, dono.id, cargos.Membro.id);
  const depois = buscarMembro(db, sid, dono.id);
  assert.equal(depois.cargo.nome, 'Membro', 'o cargo que ele veste é o que ele escolheu');
  assert.equal(depois.cargo.dono, true, 'e mesmo assim continua mandando');
  assert.throws(() => banir(db, sid, bruno.id, dono.id), /nível ou acima|permite/);
});

test('nenhum cargo chamado "Dono" nasce com o servidor', () => {
  const { cargos } = cenario();
  assert.equal(cargos.Dono, undefined, 'o app não impõe cargo nenhum de dono');
  assert.deepEqual(Object.keys(cargos).sort(), ['Membro', 'Moderador']);
});

test('sem cargo nenhum, quem criou fica sem nome de cargo — não vira "Dono"', () => {
  // O nome do cargo é o que a lista de pessoas mostra. Inventar "Dono" aqui devolveria
  // pela porta dos fundos o cargo que acabou de sair do banco.
  const { db, sid, cria } = cenario();
  const dono = cria('abner');
  db.prepare('UPDATE membros SET cargo_id = NULL WHERE servidor_id = ? AND usuario_id = ?').run(sid, dono.id);
  const m = buscarMembro(db, sid, dono.id);
  assert.equal(m.cargo.nome, null, 'apareceu um nome de cargo que ninguém criou');
  assert.equal(m.cargo.dono, true, 'e ele continua mandando, que é o que importa');
});

test('a lista sai do cargo mais alto para o mais baixo', () => {
  const { db, sid, cria, cargos } = cenario();
  const dono = cria('abner'); const bruno = cria('bruno'); cria('caio');
  definirCargo(db, sid, dono.id, bruno.id, cargos.Moderador.id);
  assert.deepEqual(listarMembros(db, sid).map((m) => m.nome), ['abner', 'bruno', 'caio']);
});

test('quem não é membro do servidor não entra', () => {
  const { db, sid } = cenario();
  assert.match(impedimento(buscarMembro(db, sid, 999)), /não faz parte/);
});

// --- identificador ---------------------------------------------------------

test('ninguém nasce Berserk', () => {
  const { db, sid, cria } = cenario();
  const a = cria('abner');
  assert.equal(buscarMembro(db, sid, a.id).turbo, 0);
});

test('o dono da Saga define e limpa o identificador', () => {
  const { db, sid, cria, donoDaSaga } = cenario();
  const dono = donoDaSaga(cria('abner')), caio = cria('caio');
  assert.equal(definirIdExibido(db, sid, dono.id, caio.id, '007').id_exibido, '007',
    'zero à esquerda tem de sobreviver');
  assert.equal(definirIdExibido(db, sid, dono.id, caio.id, '  ').id_exibido, null);
});

test('identificador aceita letra e símbolo curto, recusa o resto', () => {
  const { db, sid, cria, donoDaSaga } = cenario();
  const dono = donoDaSaga(cria('abner')), caio = cria('caio');
  for (const bom of ['1', '42', 'A7', '#9', 'zé']) {
    assert.equal(definirIdExibido(db, sid, dono.id, caio.id, bom).id_exibido, bom, bom);
  }
  for (const ruim of ['com espaço', '123456789', 'a/b']) {
    assert.throws(() => definirIdExibido(db, sid, dono.id, caio.id, ruim), /identificador/, ruim);
  }
});

test('nem moderador nem quem CRIOU o servidor define identificador', () => {
  // O identificador aparece junto do nome em todo servidor: quem o define mexe em como a
  // pessoa é vista na Saga inteira. Ter criado UM servidor não dá esse alcance — só o
  // dono da Saga tem, que é a mesma regra do Berserk e pelo mesmo motivo.
  const { db, sid, cria, cargos } = cenario();
  const criador = cria('abner'), bruno = cria('bruno'), caio = cria('caio');
  definirCargo(db, sid, criador.id, bruno.id, cargos.Moderador.id);
  assert.throws(() => definirIdExibido(db, sid, bruno.id, caio.id, '1'), /dono da Saga/);
  assert.throws(() => definirIdExibido(db, sid, criador.id, caio.id, '1'), /dono da Saga/,
    'criar o servidor não dá alcance sobre a Saga inteira');
});
