// O servidor contra um LiveKit de mentira, que responde o que o teste manda. Os outros testes
// de API usam uma porta morta, e ali ninguém está em call nunca; aqui dá para pôr gente numa
// sala e ver o que o servidor faz com isso.
//
// O caso que motivou: o LiveKit de verdade atualiza a CONTAGEM de gente de cada sala
// (`numParticipants`, no `listRooms`) de tempos em tempos. Medido em 23/09/2026: quem entrou
// numa sala vazia estava no `listParticipants` em 1,2 s, e a contagem ficou em 0 até 6,1 s. O
// servidor pulava as salas com contagem 0 — e a pessoa sumia da barra de todo mundo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let processo, base, pasta, livekit;
/** O que o LiveKit de mentira responde: as salas (com a contagem) e quem está em cada uma. */
const mundo = { salas: [], gente: {} };

before(async () => {
  livekit = createServer(async (req, res) => {
    let corpo = '';
    for await (const c of req) corpo += c;
    const pedido = corpo ? JSON.parse(corpo) : {};
    const metodo = req.url.split('/').at(-1);
    res.setHeader('content-type', 'application/json');
    if (metodo === 'ListRooms') return res.end(JSON.stringify({ rooms: mundo.salas }));
    if (metodo === 'ListParticipants') return res.end(JSON.stringify({ participants: mundo.gente[pedido.room] ?? [] }));
    res.end('{}');
  });
  await new Promise((r) => livekit.listen(0, '127.0.0.1', r));

  pasta = mkdtempSync(join(tmpdir(), 'cantinho-lk-'));
  const porta = 4000 + Math.floor(Math.random() * 1000);
  base = `http://127.0.0.1:${porta}`;
  processo = spawn(process.execPath, ['index.mjs'], {
    env: {
      ...process.env,
      PORT: String(porta),
      ROOMS: 'Geral,Jogos',
      DONO: 'abner',
      BANCO: join(pasta, 'teste.db'),
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'secret-de-teste-bem-longo',
      LIVEKIT_HOST: `http://127.0.0.1:${livekit.address().port}`,
      LIVEKIT_PUBLIC_URL: 'ws://exemplo:7880',
      SEM_NOTAS: '1',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  processo.stderr.on('data', (d) => { if (!String(d).includes('Experimental')) console.error('servidor:', String(d)); });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('o servidor não subiu');
});

after(() => {
  processo?.kill();
  livekit?.close();
  rmSync(pasta, { recursive: true, force: true });
});

const chamar = async (metodo, rota, { corpo, sessao } = {}) => {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(sessao ? { 'x-sessao': sessao } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

let dono;
async function entrarComoDono() {
  if (dono) return dono;
  await chamar('POST', '/cadastrar', { corpo: { apelido: 'abner', senha: 'segredo123', senhaRepetida: 'segredo123' } });
  dono = (await chamar('POST', '/entrar', { corpo: { apelido: 'abner', senha: 'segredo123' } })).corpo;
  return dono;
}

/** Põe o dono numa sala cuja contagem, no LiveKit, ainda diz zero. */
async function donoAcabouDeEntrarEm(nomeDaSala) {
  const eu = await entrarComoDono();
  const sala = (await chamar('GET', '/rooms', { sessao: eu.token })).corpo.rooms.find((r) => r.name === nomeDaSala);
  const noLiveKit = `sala-${sala.id}`;
  mundo.salas = [{ name: noLiveKit, numParticipants: 0 }];
  mundo.gente = { [noLiveKit]: [{ identity: `u${eu.eu.id}`, name: 'abner', state: 'ACTIVE', tracks: [] }] };
  // O servidor lembra o que o LiveKit disse por um segundo; espera passar.
  await new Promise((r) => setTimeout(r, 1100));
  return { eu, sala };
}

test('quem acabou de entrar numa sala vazia aparece nela, mesmo com a contagem do LiveKit em zero', async () => {
  const { eu, sala } = await donoAcabouDeEntrarEm('Jogos');
  const agora = (await chamar('GET', '/rooms', { sessao: eu.token })).corpo.rooms.find((r) => r.id === sala.id);
  assert.deepEqual(agora.participants.map((p) => p.name), ['abner'],
    'a contagem do listRooms atrasa segundos; quem está na sala é o que o listParticipants diz');
});

test('o bot acha a call de quem acabou de entrar numa sala vazia', async () => {
  const { eu } = await donoAcabouDeEntrarEm('Geral');
  const chat = (await chamar('POST', '/salas/criar', { sessao: eu.token, corpo: { nome: 'musica', tipo: 'texto' } })).corpo.sala;
  const r = await chamar('POST', '/musica', {
    sessao: eu.token,
    corpo: { sala: chat.id, comando: 'fila' },
  });
  // Achando a call, a fila vazia responde isto; sem achar, "Entre numa sala de voz primeiro".
  assert.match(r.corpo.error ?? '', /Não tem nada tocando/, `o bot não achou a call: ${JSON.stringify(r.corpo)}`);
});
