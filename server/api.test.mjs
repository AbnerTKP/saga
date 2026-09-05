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

// --- imagens ----------------------------------------------------------------

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(56)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(58)]);

async function subir(rota, sessao, dados) {
  const r = await fetch(base + rota, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-sessao': sessao },
    body: dados,
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}

test('sobe foto de perfil e ela passa a ser servida', async () => {
  const { token } = await sessaoDe('abner');
  const r = await subir('/eu/foto', token, PNG);
  assert.equal(r.status, 200);
  assert.match(r.corpo.eu.foto, /^[0-9a-f]{32}\.png$/);

  const img = await fetch(`${base}/arquivos/${r.corpo.eu.foto}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);
});

test('banner aceita GIF', async () => {
  const { token } = await sessaoDe('abner');
  const r = await subir('/eu/banner', token, GIF);
  assert.equal(r.status, 200);
  assert.match(r.corpo.eu.banner, /\.gif$/);
});

test('corpo vazio remove a imagem', async () => {
  const { token } = await sessaoDe('abner');
  await subir('/eu/foto', token, PNG);
  const r = await subir('/eu/foto', token, Buffer.alloc(0));
  assert.equal(r.corpo.eu.foto, null);
});

test('arquivo que não é imagem é recusado', async () => {
  const { token } = await sessaoDe('abner');
  const r = await subir('/eu/foto', token, Buffer.from('#!/bin/sh\necho oi\n'.padEnd(64)));
  assert.equal(r.status, 400);
  assert.match(r.corpo.error, /PNG, JPG, GIF ou WEBP/);
});

test('imagem grande demais é cortada com 413', async () => {
  const { token } = await sessaoDe('abner');
  const gorda = Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]);
  const r = await subir('/eu/foto', token, gorda).catch(() => ({ status: 413, corpo: {} }));
  assert.equal(r.status, 413);
});

test('sem sessão não se sobe imagem', async () => {
  const r = await fetch(`${base}/eu/foto`, { method: 'POST', body: PNG });
  assert.equal(r.status, 401);
});

test('só o dono troca a imagem do servidor', async () => {
  const bruno = await sessaoDe('bruno');
  assert.equal((await subir('/servidor/foto', bruno.token, PNG)).status, 403);
  const dono = await sessaoDe('abner');
  const r = await subir('/servidor/foto', dono.token, PNG);
  assert.equal(r.status, 200);
  assert.match(r.corpo.servidor.foto, /\.png$/);
});

test('não dá para pescar arquivo de fora da pasta', async () => {
  for (const tentativa of [
    '../../../etc/passwd', '..%2F..%2Fetc%2Fpasswd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    'cantinho.db', '../cantinho.db', 'aaaa.png',
  ]) {
    const r = await fetch(`${base}/arquivos/${tentativa}`);
    assert.equal(r.status, 404, `${tentativa} respondeu ${r.status}`);
  }
});

test('imagem inexistente com nome válido não derruba o servidor', async () => {
  const r = await fetch(`${base}/arquivos/${'0'.repeat(32)}.png`);
  assert.ok(r.status === 200 || r.status === 404);
  assert.equal((await fetch(`${base}/health`)).status, 200, 'o servidor caiu');
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

// --- soundboard -------------------------------------------------------------

const MP3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00]), Buffer.alloc(59)]);

const subirSom = async (sessao, nome, dados = MP3) => {
  const r = await fetch(`${base}/sons?nome=${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-sessao': sessao },
    body: dados,
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
};

test('membro não sobe som', async () => {
  const bruno = await sessaoDe('bruno');
  const r = await subirSom(bruno.token, 'proibido');
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /moderadores e o dono/);
});

test('o dono sobe som e ele aparece na lista para todos', async () => {
  const dono = await sessaoDe('abner');
  const r = await subirSom(dono.token, 'Risada');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.som.nome, 'Risada');
  assert.match(r.corpo.som.arquivo, /^[0-9a-f]{32}\.mp3$/);
  assert.equal(r.corpo.som.porQuem, 'abner');

  // Todo mundo pode ver e tocar, inclusive quem não pode subir.
  const bruno = await sessaoDe('bruno');
  const lista = await chamar('GET', '/sons', { sessao: bruno.token });
  assert.ok(lista.corpo.sons.some((x) => x.nome === 'Risada'));
});

test('o som é servido com o tipo de áudio certo', async () => {
  const dono = await sessaoDe('abner');
  const { corpo } = await subirSom(dono.token, 'Palmas');
  const r = await fetch(`${base}/arquivos/${corpo.som.arquivo}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
});

test('nome repetido é recusado', async () => {
  const dono = await sessaoDe('abner');
  await subirSom(dono.token, 'Buzina');
  const r = await subirSom(dono.token, 'buzina');
  assert.equal(r.status, 409);
});

test('nome vazio é recusado', async () => {
  const dono = await sessaoDe('abner');
  assert.equal((await subirSom(dono.token, '   ')).status, 400);
});

test('arquivo que não é áudio é recusado', async () => {
  const dono = await sessaoDe('abner');
  const r = await subirSom(dono.token, 'falso', Buffer.from('MZ\x90\x00'.padEnd(64)));
  assert.equal(r.status, 400);
  assert.match(r.corpo.error, /MP3, WAV, OGG/);
});

test('sem sessão não se lista nem se sobe som', async () => {
  assert.equal((await chamar('GET', '/sons')).status, 401);
  assert.equal((await fetch(`${base}/sons?nome=x`, { method: 'POST', body: MP3 })).status, 401);
});

test('membro não apaga som; o dono apaga', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const { corpo } = await subirSom(dono.token, 'Descartavel');

  assert.equal((await chamar('POST', '/sons/apagar', { sessao: bruno.token, corpo: { id: corpo.som.id } })).status, 403);
  assert.equal((await chamar('POST', '/sons/apagar', { sessao: dono.token, corpo: { id: corpo.som.id } })).status, 200);

  const lista = await chamar('GET', '/sons', { sessao: dono.token });
  assert.ok(!lista.corpo.sons.some((x) => x.nome === 'Descartavel'));
});

test('apagar som que não existe dá 404', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/sons/apagar', { sessao: dono.token, corpo: { id: 99999 } });
  assert.equal(r.status, 404);
});
