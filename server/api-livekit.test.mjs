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
import { AUSENTE } from './musica.mjs';
import { ATRIBUTO_TOCA_MUSICA } from './participantes.mjs';

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
      LIVEKIT_PUBLIC_URL_TLS: 'wss://exemplo',
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

const chamar = async (metodo, rota, { corpo, sessao, cabecalhos } = {}) => {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(sessao ? { 'x-sessao': sessao } : {}), ...cabecalhos },
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

test('o anfitrião saiu: a vez vai a quem consegue tocar, e não ao primeiro da lista', async () => {
  const { eu, sala } = await donoAcabouDeEntrarEm('Geral');
  const noLiveKit = `sala-${sala.id}`;
  const chat = (await chamar('POST', '/salas/criar', { sessao: eu.token, corpo: { nome: 'pedidos', tipo: 'texto' } })).corpo.sala;
  const { codigo } = (await chamar('POST', '/servidores/convite', { sessao: eu.token, corpo: {} })).corpo.convite;
  const amigo = async (apelido) => {
    const c = (await chamar('POST', '/cadastrar', { corpo: { apelido, senha: 'segredo123', senhaRepetida: 'segredo123' } })).corpo;
    await chamar('POST', '/servidores/entrar', { sessao: c.token, corpo: { codigo } });
    return c.eu.id;
  };
  const noCelular = await amigo('celular'), noComputador = await amigo('computador');

  const tocar = await chamar('POST', '/musica', {
    sessao: eu.token,
    corpo: { sala: chat.id, comando: 'tocar', musica: { id: 'dQw4w9WgXcQ', titulo: 'uma música', autor: 'alguém', duracao: 200, origem: 'youtube' } },
  });
  assert.equal(tocar.status, 200, JSON.stringify(tocar.corpo));

  // O dono sai. Quem está no navegador vem primeiro na lista e não anuncia nada.
  mundo.gente = { [noLiveKit]: [
    { identity: `u${noCelular}`, name: 'celular', state: 'ACTIVE', tracks: [] },
    { identity: `u${noComputador}`, name: 'computador', state: 'ACTIVE', tracks: [], attributes: { [ATRIBUTO_TOCA_MUSICA]: '1' } },
  ] };
  const vez = async () => {
    await new Promise((r) => setTimeout(r, 1100));
    return (await chamar('GET', `/musica?sala=${sala.id}`, { sessao: eu.token })).corpo.musica.anfitriao;
  };
  assert.equal(await vez(), `u${eu.eu.id}`, 'sumiu agora: ainda pode ser a internet piscando');
  await new Promise((r) => setTimeout(r, AUSENTE));
  assert.equal(await vez(), `u${noComputador}`);
});

const dezMusicas = (comeco = 0, n = 10) => Array.from({ length: n }, (_, i) => ({
  id: `video${String(comeco + i).padStart(6, '0')}`, titulo: `música ${comeco + i}`, autor: 'alguém', duracao: 200, origem: 'youtube',
}));

/** Uma sala de texto nova, com a fila da call limpa: o teste anterior pode ter deixado música tocando. */
async function chatNovo(eu, nome) {
  const chat = (await chamar('POST', '/salas/criar', { sessao: eu.token, corpo: { nome, tipo: 'texto' } })).corpo.sala;
  await chamar('POST', '/musica', { sessao: eu.token, corpo: { sala: chat.id, comando: 'parar' } });
  return chat;
}

test('a playlist: um cartão só, que a Saga antiga lê como texto, e nada no chat a cada música', async () => {
  const { eu, sala } = await donoAcabouDeEntrarEm('Geral');
  const chat = await chatNovo(eu, 'playlist');
  const mensagensDoChat = async () => (await chamar('GET', `/mensagens?sala=${chat.id}`, { sessao: eu.token })).corpo.mensagens;

  const r = await chamar('POST', '/musica', {
    sessao: eu.token,
    corpo: { sala: chat.id, comando: 'tocar', lista: { nome: 'Rock', total: 125, quantas: 10, duracao: 2000, origem: 'youtube', musicas: dezMusicas() } },
  });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(r.corpo.playlist, 'a resposta diz qual playlist nasceu');
  assert.equal(r.corpo.musica.tocando.lote.n, 1);
  assert.equal(r.corpo.musica.fila.length, 9);

  const bot = r.corpo.mensagem.bot;
  assert.equal(bot.tipo, 'texto', 'a Saga de antes desta versão só sabe desenhar os tipos que já existem');
  assert.match(bot.texto, /Rock/);
  assert.equal(bot.playlist.id, r.corpo.playlist);
  assert.equal(bot.playlist.total, 125);
  assert.equal(bot.playlist.quantas, 10);
  assert.equal(bot.playlist.primeira.lote.n, 1);

  // A fila anda: nenhum cartão por música, porque o da playlist já acompanha.
  const antes = (await mensagensDoChat()).length;
  const acabou = await chamar('POST', '/musica/acabou', { sessao: eu.token, corpo: { sala: sala.id, uid: r.corpo.musica.tocando.uid } });
  assert.equal(acabou.corpo.musica.tocando.lote.n, 2);
  assert.equal((await mensagensDoChat()).length, antes, 'a música seguinte não fala no chat');

  // Pular numa playlist também não vira outro cartão.
  const pulo = await chamar('POST', '/musica', { sessao: eu.token, corpo: { sala: chat.id, comando: 'pular' } });
  assert.equal(pulo.corpo.mensagem.bot.tipo, 'texto');
  assert.match(pulo.corpo.mensagem.bot.texto, /^Pulei/);

  // O pedido do amigo vai para o fim (decisão do dono), e tem cartão como sempre.
  const pedido = await chamar('POST', '/musica', {
    sessao: eu.token,
    corpo: { sala: chat.id, comando: 'tocar', musica: { id: 'dQw4w9WgXcQ', titulo: 'do amigo', autor: 'x', duracao: 100, origem: 'youtube' } },
  });
  assert.equal(pedido.corpo.mensagem.bot.tipo, 'na-fila');
  assert.equal(pedido.corpo.mensagem.bot.posicao, 8);

  // Tirar a playlist deixa só a do amigo, que já começa e aparece no texto.
  const tirar = await chamar('POST', '/musica', { sessao: eu.token, corpo: { sala: chat.id, comando: 'tirar', playlist: r.corpo.playlist } });
  assert.equal(tirar.status, 200, JSON.stringify(tirar.corpo));
  assert.match(tirar.corpo.mensagem.bot.texto, /Tirei a playlist "Rock"/);
  assert.match(tirar.corpo.mensagem.bot.texto, /do amigo/);
  assert.equal(tirar.corpo.musica.tocando.titulo, 'do amigo');
  assert.equal(tirar.corpo.musica.fila.length, 0);

  const deNovo = await chamar('POST', '/musica', { sessao: eu.token, corpo: { sala: chat.id, comando: 'tirar', playlist: r.corpo.playlist } });
  assert.equal(deNovo.status, 409);
  await chamar('POST', '/musica', { sessao: eu.token, corpo: { sala: chat.id, comando: 'parar' } });
});

test('as músicas do Spotify chegam aos poucos, e o /parar faz a busca parar', async () => {
  const { eu, sala } = await donoAcabouDeEntrarEm('Jogos');
  const chat = await chatNovo(eu, 'spotify');
  const r = await chamar('POST', '/musica', {
    sessao: eu.token,
    corpo: { sala: chat.id, comando: 'tocar', lista: { nome: 'Hits', total: 3, quantas: 3, duracao: 600, origem: 'spotify', musicas: dezMusicas(0, 1) } },
  });
  assert.equal(r.corpo.mensagem.bot.playlist.origem, 'spotify');
  assert.equal(r.corpo.musica.fila.length, 0);

  const antes = (await chamar('GET', `/mensagens?sala=${chat.id}`, { sessao: eu.token })).corpo.mensagens.length;
  const mais = await chamar('POST', '/musica/playlist', { sessao: eu.token, corpo: { sala: sala.id, playlist: r.corpo.playlist, musicas: dezMusicas(1, 1) } });
  assert.equal(mais.status, 200, JSON.stringify(mais.corpo));
  assert.equal(mais.corpo.ativa, true);
  assert.equal(mais.corpo.musica.fila.length, 1);
  assert.equal((await chamar('GET', `/mensagens?sala=${chat.id}`, { sessao: eu.token })).corpo.mensagens.length, antes, 'chegar música não fala no chat');

  await chamar('POST', '/musica', { sessao: eu.token, corpo: { sala: chat.id, comando: 'parar' } });
  const depois = await chamar('POST', '/musica/playlist', { sessao: eu.token, corpo: { sala: sala.id, playlist: r.corpo.playlist, musicas: dezMusicas(2, 1) } });
  assert.equal(depois.corpo.ativa, false);
  assert.equal(depois.corpo.musica, null, 'depois do /parar a música não volta sozinha');
});

test('quem começa uma playlist depois de esperar a vez é anunciado uma vez só', async () => {
  const { eu, sala } = await donoAcabouDeEntrarEm('Geral');
  const chat = await chatNovo(eu, 'aviso');
  const textos = async () => (await chamar('GET', `/mensagens?sala=${chat.id}`, { sessao: eu.token })).corpo.mensagens.map((m) => m.bot?.texto ?? m.texto);
  const primeira = await chamar('POST', '/musica', {
    sessao: eu.token,
    corpo: { sala: chat.id, comando: 'tocar', musica: { id: 'dQw4w9WgXcQ', titulo: 'antes', autor: 'x', duracao: 100, origem: 'youtube' } },
  });
  await chamar('POST', '/musica', {
    sessao: eu.token,
    corpo: { sala: chat.id, comando: 'tocar', lista: { nome: 'Rock', total: 2, quantas: 2, duracao: 400, origem: 'youtube', musicas: dezMusicas(0, 2) } },
  });
  const a = await chamar('POST', '/musica/acabou', { sessao: eu.token, corpo: { sala: sala.id, uid: primeira.corpo.musica.tocando.uid } });
  assert.equal(a.corpo.musica.tocando.lote.n, 1);
  assert.equal((await textos()).filter((t) => /Começou a playlist "Rock"/.test(t ?? '')).length, 1);
  const b = await chamar('POST', '/musica/acabou', { sessao: eu.token, corpo: { sala: sala.id, uid: a.corpo.musica.tocando.uid } });
  assert.equal(b.corpo.musica.tocando.lote.n, 2);
  assert.equal((await textos()).filter((t) => /Começou a playlist/.test(t ?? '')).length, 1, 'a segunda música não repete o aviso');
  await chamar('POST', '/musica', { sessao: eu.token, corpo: { sala: chat.id, comando: 'parar' } });
});

test('quem chega pelo HTTPS recebe o LiveKit cifrado; o app antigo, o endereço de sempre', async () => {
  const eu = await entrarComoDono();
  const sala = (await chamar('GET', '/rooms', { sessao: eu.token })).corpo.rooms.find((r) => r.name === 'Geral');
  const pedir = (cabecalhos) => chamar('POST', '/token', { sessao: eu.token, corpo: { sala: sala.id }, cabecalhos });
  // O Caddy, na 443, marca o pedido assim antes de passar para a :3001.
  assert.equal((await pedir({ 'x-forwarded-proto': 'https' })).corpo.url, 'wss://exemplo');
  // O app até a v0.65 fala com a :3001 direto: nada muda para ele.
  assert.equal((await pedir({})).corpo.url, 'ws://exemplo:7880');
  assert.equal((await pedir({ 'x-forwarded-proto': 'http' })).corpo.url, 'ws://exemplo:7880');
});
