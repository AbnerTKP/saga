// Testes dos endpoints: sobem o servidor de verdade, num banco temporário e numa porta
// livre, e conversam com ele por HTTP. É o que garante que a regra de cargos, que já é
// testada isolada, continua valendo quando chega pela rede — inclusive que ninguém
// consegue moderar sem sessão.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SENHA_DO_GRUPO = 'convite-secreto';
let processo, base, pasta;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'cantinho-'));
  const porta = 3000 + Math.floor(Math.random() * 1000);
  base = `http://127.0.0.1:${porta}`;
  processo = spawn(process.execPath, ['index.mjs'], {
    env: {
      ...process.env,
      PORT: String(porta),
      APP_PASSWORD: SENHA_DO_GRUPO,
      ROOMS: 'Geral,Jogos',
      DONO: 'abner',
      BANCO: join(pasta, 'teste.db'),
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'secret-de-teste-bem-longo',
      LIVEKIT_HOST: 'http://127.0.0.1:1',      // não existe: as chamadas caem no catch
      LIVEKIT_PUBLIC_URL: 'ws://exemplo:7880',
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

// A sessão não expira, então o app faz login uma vez e reusa. Os testes fazem o mesmo:
// repetir /entrar dezenas de vezes esbarraria no freio contra chute de senha — que é
// exatamente o que deve acontecer com quem repete, mas não representa uso real.
const sessoes = new Map();
async function sessaoDe(apelido, senha = 'segredo123') {
  if (!sessoes.has(apelido)) {
    const r = await chamar('POST', '/entrar', { corpo: { apelido, senha } });
    assert.equal(r.status, 200, `não consegui entrar como ${apelido}: ${JSON.stringify(r.corpo)}`);
    sessoes.set(apelido, r.corpo);
  }
  return sessoes.get(apelido);
}

const cadastrar = (apelido, senha = 'segredo123') =>
  chamar('POST', '/cadastrar', { corpo: { apelido, senha, senhaRepetida: senha, senhaDoGrupo: SENHA_DO_GRUPO } });

test('sem a senha do grupo ninguém se cadastra', async () => {
  const r = await chamar('POST', '/cadastrar', {
    corpo: { apelido: 'intruso', senha: 'segredo123', senhaRepetida: 'segredo123', senhaDoGrupo: 'chute' },
  });
  assert.equal(r.status, 401);
});

test('cadastro devolve sessão, servidor e salas de uma vez', async () => {
  const r = await cadastrar('abner');
  assert.equal(r.status, 200);
  assert.ok(r.corpo.token);
  assert.equal(r.corpo.eu.apelido, 'abner');
  assert.equal(r.corpo.eu.cargoNome, 'Dono', 'o apelido de DONO devia virar dono');
  assert.deepEqual(r.corpo.salas, ['Geral', 'Jogos']);
  assert.equal(r.corpo.servidor.nome, 'Cantinho do Vorcaro');
});

test('a senha nunca volta na resposta', async () => {
  const r = await cadastrar('curioso');
  const texto = JSON.stringify(r.corpo);
  assert.ok(!texto.includes('senha_hash'), 'o hash da senha vazou na resposta');
  assert.ok(!texto.includes('segredo123'), 'a senha vazou na resposta');
});

test('quem chega depois entra como membro', async () => {
  const r = await cadastrar('bruno');
  assert.equal(r.corpo.eu.cargoNome, 'Membro');
});

test('a sessão continua valendo: o app abre logado', async () => {
  const { corpo } = await cadastrar('caio');
  const r = await chamar('GET', '/eu', { sessao: corpo.token });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.eu.apelido, 'caio');
});

test('sem sessão, nada é acessível', async () => {
  for (const [metodo, rota] of [['GET', '/eu'], ['GET', '/rooms'], ['GET', '/servidor'], ['POST', '/token'], ['POST', '/moderar']]) {
    const r = await chamar(metodo, rota, metodo === 'GET' ? {} : { corpo: {} });
    assert.equal(r.status, 401, `${metodo} ${rota} respondeu ${r.status} sem sessão`);
  }
});

test('sessão inventada é recusada', async () => {
  const r = await chamar('GET', '/eu', { sessao: 'nao-existe' });
  assert.equal(r.status, 401);
});

test('entrar com a senha certa devolve nova sessão; com a errada, 401', async () => {
  await cadastrar('davi');
  const ok = await chamar('POST', '/entrar', { corpo: { apelido: 'davi', senha: 'segredo123' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.corpo.token);
  const nao = await chamar('POST', '/entrar', { corpo: { apelido: 'davi', senha: 'errada' } });
  assert.equal(nao.status, 401);
});

test('o token da sala é emitido para quem tem sessão, e recusa sala inexistente', async () => {
  const { token } = await sessaoDe('abner');
  const ok = await chamar('POST', '/token', { sessao: token, corpo: { room: 'Geral' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.url, 'ws://exemplo:7880');
  assert.match(ok.corpo.identity, /^u\d+$/, 'a identidade devia ser estável, pelo id da conta');
  const nao = await chamar('POST', '/token', { sessao: token, corpo: { room: 'Inventada' } });
  assert.equal(nao.status, 400);
});

test('membro não modera; o dono modera', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');

  const tentativa = await chamar('POST', '/moderar', {
    sessao: bruno.token, corpo: { acao: 'timeout', alvo: dono.eu.id, minutos: 5 },
  });
  assert.equal(tentativa.status, 403, 'um membro conseguiu dar castigo no dono');

  const feito = await chamar('POST', '/moderar', {
    sessao: dono.token, corpo: { acao: 'timeout', alvo: bruno.eu.id, minutos: 5 },
  });
  assert.equal(feito.status, 200);
  assert.ok(feito.corpo.alvo.castigoAte > Date.now());
});

test('quem está de castigo não recebe token de sala', async () => {
  const bruno = await sessaoDe('bruno');
  const r = await chamar('POST', '/token', { sessao: bruno.token, corpo: { room: 'Geral' } });
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /castigo/);
});

test('banir derruba a sessão de quem está com o app aberto', async () => {
  const dono = await sessaoDe('abner');
  const alvo = (await cadastrar('elias')).corpo;
  assert.equal((await chamar('GET', '/eu', { sessao: alvo.token })).status, 200);

  await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'banir', alvo: alvo.eu.id } });
  assert.equal((await chamar('GET', '/eu', { sessao: alvo.token })).status, 401, 'a sessão do banido sobreviveu');

  const volta = await chamar('POST', '/entrar', { corpo: { apelido: 'elias', senha: 'segredo123' } });
  assert.match(volta.corpo.impedimento ?? '', /banido/, 'o banido devia ver o motivo ao entrar');
});

test('o nome exibido troca sem mexer no apelido de login', async () => {
  const bruno = await sessaoDe('bruno');
  const r = await chamar('PATCH', '/eu', { sessao: bruno.token, corpo: { nome: 'Bruno das Antigas' } });
  assert.equal(r.corpo.eu.nome, 'Bruno das Antigas');
  assert.equal(r.corpo.eu.apelido, 'bruno');
  const ainda = await chamar('POST', '/entrar', { corpo: { apelido: 'bruno', senha: 'segredo123' } });
  assert.equal(ainda.status, 200, 'o login devia continuar pelo apelido');
});

test('só o dono renomeia o servidor', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  assert.equal((await chamar('PATCH', '/servidor', { sessao: bruno.token, corpo: { nome: 'Meu' } })).status, 403);
  const r = await chamar('PATCH', '/servidor', { sessao: dono.token, corpo: { nome: 'Cantinho dos Amigos' } });
  assert.equal(r.corpo.servidor.nome, 'Cantinho dos Amigos');
});

test('a lista de membros sai ordenada por cargo e sem dados internos', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('GET', '/servidor', { sessao: dono.token });
  assert.equal(r.corpo.membros[0].apelido, 'abner');
  assert.ok(!JSON.stringify(r.corpo).includes('senha_hash'));
});

test('/rooms responde mesmo com o LiveKit fora do ar', async () => {
  // O LiveKit aponta para uma porta morta de propósito: a lista de salas tem de vir
  // assim mesmo, vazia, senão a barra lateral quebraria junto com a voz.
  const dono = await sessaoDe('abner');
  const r = await chamar('GET', '/rooms', { sessao: dono.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.rooms.map((s) => s.name), ['Geral', 'Jogos']);
  assert.deepEqual(r.corpo.rooms[0].participants, []);
});
