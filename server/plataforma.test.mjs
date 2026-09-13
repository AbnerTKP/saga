import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { criarConta, trocarSenha } from './contas.mjs';
import { garantirMembro, buscarMembro, banir, definirCargo } from './membros.mjs';
import { listarCargos } from './cargos.mjs';
import { listarSalas, criarSala, editarSala } from './salas.mjs';
import { apagarMensagem } from './mensagens.mjs';
import { garantirSalaDeNotas } from './notas.mjs';
import { criarServidor } from './servidores.mjs';
import {
  garantirDonoDaSaga, ehDonoDaSaga, listarContas, definirBerserk, emitirRecuperacao,
  listarServidores, verServidorDaSaga,
} from './plataforma.mjs';

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

test('um dono da Saga não gera código para a conta de outro dono', () => {
  // Com dois donos, o código de um entraria na conta do outro: quem manda na Saga não pode
  // ter a conta ao alcance de quem manda igual. Decisão de 13/09/2026, ao dar a administração
  // a mais alguém. Para conta que não é de dono, nada muda.
  const { db, cria } = cenario();
  const abner = cria('abner', true), tava = cria('tava1'), bruno = cria('bruno');
  garantirDonoDaSaga(db, 'abner');
  db.prepare('UPDATE usuarios SET dono = 1 WHERE id = ?').run(tava.id);
  for (const [quem, alvo] of [[tava, abner], [abner, tava]]) {
    assert.throws(() => emitirRecuperacao(db, quem.id, alvo.id, 'segredo123'),
      (e) => e.status === 403 && /dono da Saga/.test(e.message), `${quem.apelido} gerou para ${alvo.apelido}`);
  }
  assert.equal(db.prepare('SELECT count(*) c FROM recuperacoes').get().c, 0);
  assert.ok(emitirRecuperacao(db, tava.id, bruno.id, 'segredo123').codigo, 'para quem não é dono, o segundo dono gera');
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

// --- a administração: todos os servidores ------------------------------------

// Fixo, e não Date.now(): online, "últimos 7 dias" e convite vencido são contas contra o
// relógio, e teste que depende da hora em que roda passa hoje e falha amanhã.
const AGORA = Date.UTC(2026, 8, 11, 15, 0, 0);
const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

/**
 * Uma Saga com o que a administração conta: gente online, offline e banida, salas de voz
 * e de texto, privadas com e sem cargo, mensagens velhas, novas, apagadas e da Saga,
 * convites de todo tipo — e um servidor de que o dono da Saga não faz parte.
 */
function saga() {
  const { db, sid, cria } = cenario();
  const abner = cria('abner', true), bruno = cria('bruno'), caio = cria('caio'), duda = cria('duda');
  garantirDonoDaSaga(db, 'abner');
  const dono = buscarMembro(db, sid, abner.id);
  const cargos = Object.fromEntries(listarCargos(db, sid).map((c) => [c.nome, c]));
  definirCargo(db, sid, abner.id, bruno.id, cargos.Moderador.id);

  // O sinal de vida carimba Date.now(); a conta aqui é contra AGORA, então vai direto no banco.
  const sinal = (u, vistoEm, status = 'online') =>
    db.prepare('UPDATE usuarios SET status = ?, visto_em = ? WHERE id = ?').run(status, vistoEm, u.id);
  sinal(abner, AGORA - 10_000);
  sinal(bruno, AGORA - 30_000, 'ocupado');   // ocupado também é estar aí
  sinal(caio, AGORA - 10 * MINUTO);          // fechou o app faz tempo: offline
  sinal(duda, AGORA - 5_000);                // online, mas banida: não é gente do servidor
  banir(db, sid, abner.id, duda.id);

  const geral = listarSalas(db, sid).find((s) => s.nome === 'Geral');
  const bunker = criarSala(db, sid, dono, { nome: 'Bunker', tipo: 'voz' });
  const avisos = criarSala(db, sid, dono, { nome: 'Avisos', tipo: 'texto' });
  const reservada = criarSala(db, sid, dono, { nome: 'Reservada', tipo: 'texto' });
  editarSala(db, sid, dono, { id: bunker.id, privada: true, cargos: [] });
  editarSala(db, sid, dono, { id: reservada.id, privada: true, cargos: [cargos.Moderador.id] });
  const notas = garantirSalaDeNotas(db, sid);

  const escrever = (sala, texto, criadoEm, autor) => Number(db.prepare(
    'INSERT INTO mensagens (sala_id, usuario_id, texto, criado_em) VALUES (?, ?, ?, ?)',
  ).run(sala.id, autor?.id ?? null, texto, criadoEm).lastInsertRowid);
  escrever(avisos, 'lá de dez dias atrás', AGORA - 10 * DIA, abner);
  escrever(avisos, 'mensagem de ontem', AGORA - DIA, bruno);
  escrever(reservada, 'o assunto da sala trancada', AGORA - 2 * 60 * MINUTO, bruno);
  // As duas mais recentes não podem contar: uma foi apagada, a outra é a Saga falando.
  apagarMensagem(db, sid, dono, escrever(avisos, 'mandei errado', AGORA - MINUTO, abner));
  escrever(notas, 'v9.9.9 — nota de versão', AGORA - 30_000, null);

  const convite = (codigo, { expiraEm = null, usos = 0, maxUsos = null }) => db.prepare(
    'INSERT INTO convites (codigo, servidor_id, criado_por, criado_em, expira_em, usos, max_usos) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(codigo, sid, abner.id, AGORA - DIA, expiraEm, usos, maxUsos);
  convite('ABERTO22', { expiraEm: AGORA + DIA });
  convite('SEMPRAZO', { maxUsos: 3, usos: 1 });
  convite('VENCIDO2', { expiraEm: AGORA - 1 });
  convite('ESGOTADO', { maxUsos: 2, usos: 2 });

  // Criado pelo bruno: o dono da Saga não faz parte dele.
  const toca = criarServidor(db, bruno, { nome: 'Toca do Bruno' });
  const daToca = (nome) => listarSalas(db, toca.id).find((s) => s.nome === nome);
  escrever(daToca('Avisos'), 'lá na toca', AGORA - 5 * MINUTO, bruno);

  // Montado pela rota a partir do LiveKit; aqui, à mão.
  const emCallPorSala = new Map([[geral.id, 2], [bunker.id, 1], [daToca('Geral').id, 4]]);
  return { db, sid, abner, bruno, cargos, bunker, avisos, reservada, notas, toca, emCallPorSala };
}

test('só o dono da Saga vê os servidores — e quem não é recebe o 403 antes do 404', () => {
  const { db, sid, bruno } = saga();
  // O bruno criou a Toca: mandar num servidor não é mandar na Saga.
  assert.throws(() => listarServidores(db, bruno.id), /dono da Saga/);
  assert.throws(() => verServidorDaSaga(db, bruno.id, sid), /dono da Saga/);
  // Um "não existe" para quem não é dono ensinaria quais números de servidor existem.
  assert.throws(() => verServidorDaSaga(db, bruno.id, 999999), /dono da Saga/);
});

test('a lista traz também o servidor de que o dono não faz parte', () => {
  const { db, sid, abner, bruno, toca } = saga();
  const lista = listarServidores(db, abner.id, { agora: AGORA });
  assert.deepEqual(lista.map((s) => s.id), [sid, toca.id], 'todos, por id');
  const [casa, dele] = lista;
  assert.equal(casa.souMembro, true);
  assert.equal(dele.souMembro, false, 'o dono da Saga não está na Toca');
  assert.deepEqual(dele.criador, { id: bruno.id, apelido: 'bruno', foto: null });
});

test('vínculo banido não é "você faz parte": o dono da Saga banido do servidor de um amigo', () => {
  // Aconteceu em 11/09/2026. Contando o vínculo banido, a administração diria "você faz
  // parte" e ofereceria "Abrir" num servidor que, pedido, devolve outro.
  const { db, abner, bruno, toca } = saga();
  garantirMembro(db, toca.id, abner);
  banir(db, toca.id, bruno.id, abner.id);
  const naLista = listarServidores(db, abner.id, { agora: AGORA }).find((s) => s.id === toca.id);
  assert.equal(naLista.souMembro, false);
  assert.equal(naLista.banidos, 1);
  assert.equal(naLista.pessoas, 1, 'só o bruno');
  assert.equal(verServidorDaSaga(db, abner.id, toca.id, { agora: AGORA }).souMembro, false);
});

test('conversa privada não é de servidor nenhum: a administração não a conta nem a mostra', () => {
  // As conversas entre amigos chegaram depois, na MESMA tabela de mensagens: uma linha mora
  // numa sala ou numa conversa. A conta por servidor passa pela sala. Se um dia ler a tabela
  // inteira, a conversa de dois amigos vira "atividade" de um servidor — e o texto dela fica
  // a um campo de sair aqui.
  const { db, sid, abner, bruno } = saga();
  const antes = listarServidores(db, abner.id, { agora: AGORA });
  const conversa = Number(db.prepare('INSERT INTO conversas (criada_em) VALUES (?)').run(AGORA - DIA).lastInsertRowid);
  db.prepare('INSERT INTO mensagens (conversa_id, usuario_id, texto, criado_em) VALUES (?, ?, ?, ?)')
    .run(conversa, bruno.id, 'só entre nós dois', AGORA - MINUTO);
  assert.deepEqual(listarServidores(db, abner.id, { agora: AGORA }), antes);
  assert.ok(!JSON.stringify(verServidorDaSaga(db, abner.id, sid, { agora: AGORA })).includes('só entre nós dois'));
});

test('a lista conta gente, presença, call, salas e mensagens contra o mesmo relógio', () => {
  const { db, abner, emCallPorSala } = saga();
  const [casa, dele] = listarServidores(db, abner.id, { emCallPorSala, agora: AGORA });

  assert.equal(casa.pessoas, 3, 'banido não é gente do servidor');
  assert.equal(casa.banidos, 1);
  assert.equal(casa.online, 2, 'ocupado conta; sem sinal recente não, e banido também não');
  assert.equal(casa.emCall, 3, 'soma as salas de voz DESTE servidor, e só elas');
  assert.deepEqual(casa.salas, { voz: 2, texto: 3, privadas: 2 });
  assert.deepEqual(casa.mensagens, { total: 3, ultimos7Dias: 2, ultimaEm: AGORA - 2 * 60 * MINUTO },
    'a apagada e a nota de versão, as duas mais recentes, não podem contar');

  assert.equal(dele.pessoas, 1);
  assert.equal(dele.online, 1);
  assert.equal(dele.emCall, 4);
  assert.deepEqual(dele.mensagens, { total: 1, ultimos7Dias: 1, ultimaEm: AGORA - 5 * MINUTO });
});

test('o detalhe traz a estrutura: privadas com quem vê, cargos com quantas pessoas, convites que abrem', () => {
  const { db, sid, abner, cargos, bunker, avisos, reservada, notas, emCallPorSala } = saga();
  const d = verServidorDaSaga(db, abner.id, sid, { emCallPorSala, agora: AGORA });
  const sala = (id) => d.salas.find((s) => s.id === id);

  assert.equal(d.salas[0].id, notas.id, 'na ordem da barra, com a de notas no topo');
  assert.equal(sala(notas.id).papel, 'notas');
  assert.equal(sala(reservada.id).privada, true);
  assert.deepEqual(sala(reservada.id).cargos, [cargos.Moderador.id]);
  assert.deepEqual(sala(bunker.id).cargos, [], 'privada sem cargo nenhum: só quem criou vê');
  assert.deepEqual(sala(avisos.id).cargos, [], 'sala pública não tem lista de quem vê');
  assert.deepEqual(sala(avisos.id).mensagens, { total: 2, ultimaEm: AGORA - DIA }, 'a apagada não conta');
  assert.deepEqual(sala(bunker.id).mensagens, { total: 0, ultimaEm: null });

  assert.deepEqual(d.cargos.map((c) => [c.nome, c.pessoas]), [['Moderador', 2], ['Membro', 1]],
    'a banida não conta no cargo que veste');
  assert.equal(d.convitesAtivos, 2, 'o vencido e o esgotado não abrem porta nenhuma');
  assert.equal(d.sons, 0);
});

test('servidor que não existe, ou número que nem é número, responde que não existe', () => {
  const { db, abner } = saga();
  for (const id of [999999, 'abc', 0, -1, 1.5, '', null, undefined]) {
    assert.throws(() => verServidorDaSaga(db, abner.id, id),
      (e) => e.status === 404 && /não existe/.test(e.message), String(id));
  }
});

test('a lista e o detalhe dão os mesmos números', () => {
  // Saem da mesma função; este teste é o que impede alguém de "ajustar" só um dos lados.
  const { db, sid, abner, emCallPorSala } = saga();
  const daLista = listarServidores(db, abner.id, { emCallPorSala, agora: AGORA }).find((s) => s.id === sid);
  const doDetalhe = verServidorDaSaga(db, abner.id, sid, { emCallPorSala, agora: AGORA });
  // `salas` é a exceção de propósito: no detalhe ela é a lista inteira, não a contagem.
  for (const campo of Object.keys(daLista).filter((k) => k !== 'salas')) {
    assert.deepEqual(doDetalhe[campo], daLista[campo], campo);
  }
});

test('a conversa e a chave da porta não saem na administração', () => {
  const { db, sid, abner, toca, emCallPorSala } = saga();
  const tudo = JSON.stringify([
    listarServidores(db, abner.id, { emCallPorSala, agora: AGORA }),
    verServidorDaSaga(db, abner.id, sid, { emCallPorSala, agora: AGORA }),
    verServidorDaSaga(db, abner.id, toca.id, { emCallPorSala, agora: AGORA }),
  ]);
  for (const segredo of [
    'lá de dez dias atrás', 'mensagem de ontem', 'o assunto da sala trancada', 'lá na toca',
    'nota de versão', 'ABERTO22', 'SEMPRAZO', 'VENCIDO2', 'ESGOTADO', 'scrypt$',
  ]) {
    assert.ok(!tudo.includes(segredo), `vazou: ${segredo}`);
  }
});
