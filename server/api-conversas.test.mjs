// As conversas privadas e a amizade pela REDE: as regras já são testadas isoladas, e o
// que se tranca aqui é que elas continuam valendo quando chegam pelo HTTP — inclusive as
// duas portas que não podem abrir: mandar mensagem para quem não é amigo, e ler a
// conversa dos outros.
//
// Em arquivo próprio, e não dentro de api.test.mjs, porque este servidor sobe sozinho:
// um arquivo de teste por assunto é o que deixa `node --test` rodar os dois em paralelo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let processo, base, pasta;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'saga-conversas-'));
  const porta = 4000 + Math.floor(Math.random() * 1000);
  base = `http://127.0.0.1:${porta}`;
  processo = spawn(process.execPath, ['index.mjs'], {
    env: {
      ...process.env,
      PORT: String(porta),
      ROOMS: 'Geral',
      DONO: 'tkp',
      BANCO: join(pasta, 'teste.db'),
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'secret-de-teste-bem-longo',
      LIVEKIT_HOST: 'http://127.0.0.1:1',      // não existe: as chamadas caem no catch
      LIVEKIT_PUBLIC_URL: 'ws://exemplo:7880',
      SEM_NOTAS: '1',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  processo.stderr.on('data', (d) => { const s = String(d); if (!s.includes('Experimental')) console.error('servidor:', s); });

  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('o servidor não subiu');
});

after(() => {
  processo?.kill();
  rmSync(pasta, { recursive: true, force: true });
});

const chamar = async (metodo, rota, { corpo, sessao } = {}) => {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(sessao ? { 'x-sessao': sessao } : {}) },
    body: corpo && metodo !== 'GET' ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

/** Cria a conta e devolve o crachá e o id. Cadastrar não põe ninguém em servidor nenhum. */
async function conta(apelido) {
  const r = await chamar('POST', '/cadastrar', { corpo: { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return { sessao: r.corpo.token, id: r.corpo.eu.id, apelido };
}

/** O caminho inteiro: pedido, aceite e conversa aberta. */
async function amigos(a, b) {
  assert.equal((await chamar('POST', '/amigos/pedir', { sessao: a.sessao, corpo: { apelido: b.apelido } })).status, 200);
  assert.equal((await chamar('POST', '/amigos/responder', { sessao: b.sessao, corpo: { alvo: a.id, aceitar: true } })).status, 200);
}

test('sem sessão, nem a lista de amigos nem o pedido', async () => {
  assert.equal((await chamar('GET', '/amigos')).status, 401);
  assert.equal((await chamar('POST', '/amigos/pedir', { corpo: { apelido: 'tkp' } })).status, 401);
  assert.equal((await chamar('POST', '/conversas/abrir', { corpo: { alvo: 1 } })).status, 401);
});

test('sem amizade não há conversa — e sem servidor em comum também não é preciso', async () => {
  const a = await conta('alice'), b = await conta('bob');

  // Nenhum dos dois está em servidor nenhum: a amizade é da CONTA, e basta ela.
  const semAmizade = await chamar('POST', '/conversas/abrir', { sessao: a.sessao, corpo: { alvo: b.id } });
  assert.equal(semAmizade.status, 403);
  assert.match(semAmizade.corpo.error, /amigos/);

  await amigos(a, b);
  const r = await chamar('POST', '/conversas/abrir', { sessao: a.sessao, corpo: { alvo: b.id } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.conversa.com.nome, 'bob');
});

test('a conversa dos outros responde 404, não 403', async () => {
  const a = await conta('carol'), b = await conta('dave'), estranho = await conta('eva');
  await amigos(a, b);
  const { corpo } = await chamar('POST', '/conversas/abrir', { sessao: a.sessao, corpo: { alvo: b.id } });
  const id = corpo.conversa.id;

  assert.equal((await chamar('GET', `/mensagens?conversa=${id}`, { sessao: estranho.sessao })).status, 404);
  assert.equal((await chamar('POST', '/mensagens', { sessao: estranho.sessao, corpo: { conversa: id, texto: 'oi' } })).status, 404);
});

test('mandar, ler e ver quem está digitando — tudo pela porta de sempre', async () => {
  const a = await conta('fred'), b = await conta('gina');
  await amigos(a, b);
  const { corpo } = await chamar('POST', '/conversas/abrir', { sessao: a.sessao, corpo: { alvo: b.id } });
  const id = corpo.conversa.id;

  const mandada = await chamar('POST', '/mensagens', { sessao: a.sessao, corpo: { conversa: id, texto: 'chegou?' } });
  assert.equal(mandada.status, 200);
  assert.equal(mandada.corpo.mensagem.nome, 'fred');

  await chamar('POST', '/digitando', { sessao: b.sessao, corpo: { conversa: id } });
  const lida = await chamar('GET', `/mensagens?conversa=${id}`, { sessao: a.sessao });
  assert.deepEqual(lida.corpo.mensagens.map((m) => m.texto), ['chegou?']);
  assert.deepEqual(lida.corpo.digitando.map((d) => d.nome), ['gina']);
  assert.ok(lida.corpo.agora > 0);
});

test('desfazer a amizade fecha o campo de escrever e guarda o que foi dito', async () => {
  const a = await conta('hugo'), b = await conta('ines');
  await amigos(a, b);
  const { corpo } = await chamar('POST', '/conversas/abrir', { sessao: a.sessao, corpo: { alvo: b.id } });
  const id = corpo.conversa.id;
  await chamar('POST', '/mensagens', { sessao: a.sessao, corpo: { conversa: id, texto: 'combinado' } });

  assert.equal((await chamar('POST', '/amigos/desfazer', { sessao: b.sessao, corpo: { alvo: a.id } })).status, 200);

  const recusada = await chamar('POST', '/mensagens', { sessao: a.sessao, corpo: { conversa: id, texto: 'e aí?' } });
  assert.equal(recusada.status, 403);
  // O que já foi dito continua sendo lido pelos dois.
  const lida = await chamar('GET', `/mensagens?conversa=${id}`, { sessao: b.sessao });
  assert.deepEqual(lida.corpo.mensagens.map((m) => m.texto), ['combinado']);
});

test('na conversa privada só dá para apagar a própria mensagem', async () => {
  const a = await conta('joao'), b = await conta('kika');
  await amigos(a, b);
  const { corpo } = await chamar('POST', '/conversas/abrir', { sessao: a.sessao, corpo: { alvo: b.id } });
  const id = corpo.conversa.id;
  const m = await chamar('POST', '/mensagens', { sessao: a.sessao, corpo: { conversa: id, texto: 'esquece' } });

  assert.equal((await chamar('POST', '/mensagens/apagar', { sessao: b.sessao, corpo: { id: m.corpo.mensagem.id } })).status, 403);
  assert.equal((await chamar('POST', '/mensagens/apagar', { sessao: a.sessao, corpo: { id: m.corpo.mensagem.id } })).status, 200);
  const lida = await chamar('GET', `/mensagens?conversa=${id}`, { sessao: b.sessao });
  assert.deepEqual(lida.corpo.mensagens, []);
});

test('quem pediu não aceita o próprio pedido, e a lista separa os três casos', async () => {
  const a = await conta('lia'), b = await conta('marco');
  await chamar('POST', '/amigos/pedir', { sessao: a.sessao, corpo: { apelido: 'marco' } });

  assert.equal((await chamar('POST', '/amigos/responder', { sessao: a.sessao, corpo: { alvo: b.id, aceitar: true } })).status, 403);

  const minha = await chamar('GET', '/amigos', { sessao: a.sessao });
  assert.deepEqual(minha.corpo.enviados.map((p) => p.nome), ['marco']);
  const dele = await chamar('GET', '/amigos', { sessao: b.sessao });
  assert.deepEqual(dele.corpo.recebidos.map((p) => p.nome), ['lia']);
});

test('quem não está em servidor nenhum continua tendo amigos e conversa', async () => {
  // Cadastrar não põe ninguém em servidor nenhum, e a amizade não pede um: estas duas
  // contas nunca entraram em lugar algum e conversam do mesmo jeito.
  const a = await conta('nina'), b = await conta('otto');
  await amigos(a, b);
  const { corpo } = await chamar('POST', '/conversas/abrir', { sessao: a.sessao, corpo: { alvo: b.id } });
  const enviada = await chamar('POST', '/mensagens', { sessao: b.sessao, corpo: { conversa: corpo.conversa.id, texto: 'sem servidor nenhum' } });
  assert.equal(enviada.status, 200);
  // E apagar a própria também não pede servidor.
  assert.equal((await chamar('POST', '/mensagens/apagar', { sessao: b.sessao, corpo: { id: enviada.corpo.mensagem.id } })).status, 200);
});

test('a busca de salas carrega as conversas e o número de pedidos', async () => {
  // É por aqui que a lista da esquerda se atualiza sozinha, sem uma terceira busca.
  const dono = await chamar('POST', '/entrar', { corpo: { apelido: 'tkp', senha: 'segredo123' } })
    .then(async (r) => (r.status === 200 ? r.corpo : (await conta('tkp')) && (await chamar('POST', '/entrar', { corpo: { apelido: 'tkp', senha: 'segredo123' } })).corpo));
  const eu = { sessao: dono.token, id: dono.eu.id, apelido: 'tkp' };
  const amigo = await conta('pedro');
  await amigos(eu, amigo);
  const { corpo } = await chamar('POST', '/conversas/abrir', { sessao: eu.sessao, corpo: { alvo: amigo.id } });
  await chamar('POST', '/mensagens', { sessao: amigo.sessao, corpo: { conversa: corpo.conversa.id, texto: 'oi' } });
  const outro = await conta('quim');
  await chamar('POST', '/amigos/pedir', { sessao: outro.sessao, corpo: { apelido: 'tkp' } });

  const rooms = await chamar('GET', '/rooms', { sessao: eu.sessao });
  assert.equal(rooms.status, 200);
  const conversa = rooms.corpo.conversas.find((c) => c.id === corpo.conversa.id);
  assert.equal(conversa.com.nome, 'pedro');
  assert.equal(conversa.previa, 'oi');
  assert.equal(conversa.naoLidas, 1, 'a mensagem do outro conta como não lida');
  assert.equal(rooms.corpo.amigos.pedidos, 1, 'o pedido esperando resposta precisa aparecer com a tela fechada');

  // Com o marcador, o aviso zera — o mesmo mecanismo das salas.
  const comMarcador = await chamar('GET', `/rooms?lidasConversas=${conversa.id}:${conversa.ultimaId}`, { sessao: eu.sessao });
  assert.equal(comMarcador.corpo.conversas.find((c) => c.id === conversa.id).naoLidas, 0);
});
