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

const chamar = async (metodo, rota, { corpo, sessao, servidor } = {}) => {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(sessao ? { 'x-sessao': sessao } : {}),
      ...(servidor ? { 'x-servidor': String(servidor) } : {}),
    },
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
  assert.deepEqual(r.corpo.salas.map((s) => s.nome), ['Geral', 'Jogos']);
  assert.deepEqual(r.corpo.salas.map((s) => s.tipo), ['voz', 'voz'], 'as semeadas são de voz');
  assert.equal(r.corpo.servidor.nome, 'Saga');
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

test('banir e castigo valem mesmo com o LiveKit fora do ar', async () => {
  // Banir e dar castigo agora também tiram a pessoa da sala de voz. Se essa parte
  // falhar — LiveKit fora, pessoa em nenhuma sala — a punição não pode se perder:
  // o que vale é o registro, e tirar da sala é consequência.
  const dono = await sessaoDe('abner');
  const alvo = (await cadastrar('fabio')).corpo;

  const castigo = await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'timeout', alvo: alvo.eu.id, minutos: 5 } });
  assert.equal(castigo.status, 200, 'o castigo falhou junto com o LiveKit');
  assert.ok(castigo.corpo.alvo.castigoAte > Date.now());

  const ban = await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'banir', alvo: alvo.eu.id } });
  assert.equal(ban.status, 200, 'o banimento falhou junto com o LiveKit');
  assert.equal(ban.corpo.alvo.banido, true);
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

test('imagem animada é recusada a quem não é Turbo', async () => {
  const { token } = await sessaoDe('abner');
  const r = await subir('/eu/banner', token, GIF);
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /Berserk/);
});

test('imagem parada continua livre para todos', async () => {
  const { token } = await sessaoDe('bruno');
  assert.equal((await subir('/eu/foto', token, PNG)).status, 200);
});

test('com Turbo, a imagem animada passa', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'turbo', alvo: dono.eu.id, turbo: true } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.alvo.turbo, true, 'o dono pode dar Turbo a si mesmo');

  const b = await subir('/eu/banner', dono.token, GIF);
  assert.equal(b.status, 200);
  assert.match(b.corpo.eu.banner, /\.gif$/);
});

test('membro não concede Turbo a si mesmo', async () => {
  const bruno = await sessaoDe('bruno');
  const r = await chamar('POST', '/moderar', { sessao: bruno.token, corpo: { acao: 'turbo', alvo: bruno.eu.id, turbo: true } });
  assert.equal(r.status, 403);
});

test('o dono define o identificador, e ele volta na lista', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const r = await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'id', alvo: bruno.eu.id, idExibido: '007' } });
  assert.equal(r.corpo.alvo.idExibido, '007');

  const lista = await chamar('GET', '/servidor', { sessao: dono.token });
  assert.equal(lista.corpo.membros.find((m) => m.id === bruno.eu.id).idExibido, '007');
});

test('membro não define identificador de ninguém', async () => {
  const bruno = await sessaoDe('bruno');
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/moderar', { sessao: bruno.token, corpo: { acao: 'id', alvo: dono.eu.id, idExibido: 'x' } });
  assert.equal(r.status, 403);
});

test('sem chave configurada, a busca de GIF avisa em vez de quebrar', async () => {
  const { token } = await sessaoDe('abner');
  const r = await chamar('GET', '/giphy?q=gato', { sessao: token });
  assert.equal(r.status, 503);
  assert.match(r.corpo.error, /não está configurada/);
});

test('não dá para fazer o servidor baixar de qualquer endereço', async () => {
  const { token } = await sessaoDe('abner');
  for (const url of ['http://127.0.0.1:3001/eu', 'https://evil.com/x.gif', 'file:///etc/passwd']) {
    const r = await chamar('POST', '/giphy/usar', { sessao: token, corpo: { onde: 'usuario.foto', url } });
    assert.equal(r.status, 400, url);
  }
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

test('quem não tem a permissão não sobe som', async () => {
  const bruno = await sessaoDe('bruno');
  const r = await subirSom(bruno.token, 'proibido');
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /não permite/);
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

// --- salas e chat -------------------------------------------------------------

test('o dono cria sala de texto e ela aparece para todos', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/salas/criar', { sessao: dono.token, corpo: { nome: 'Avisos', tipo: 'texto' } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.sala.tipo, 'texto');

  const bruno = await sessaoDe('bruno');
  const lista = await chamar('GET', '/rooms', { sessao: bruno.token });
  const avisos = lista.corpo.rooms.find((s) => s.name === 'Avisos');
  assert.ok(avisos, 'a sala nova não apareceu');
  assert.deepEqual(avisos.participants, [], 'sala de texto não tem gente dentro');
});

test('membro não cria nem apaga sala', async () => {
  const bruno = await sessaoDe('bruno');
  assert.equal((await chamar('POST', '/salas/criar', { sessao: bruno.token, corpo: { nome: 'X', tipo: 'voz' } })).status, 403);
  assert.equal((await chamar('POST', '/salas/apagar', { sessao: bruno.token, corpo: { id: 1 } })).status, 403);
});

test('não se entra na voz de uma sala de texto', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/token', { sessao: dono.token, corpo: { room: 'Avisos' } });
  assert.equal(r.status, 400);
  assert.match(r.corpo.error, /texto/);
});

test('mensagem enviada fica guardada e volta com quem escreveu', async () => {
  const dono = await sessaoDe('abner');
  const salas = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms;
  const avisos = salas.find((s) => s.name === 'Avisos');

  const envio = await chamar('POST', '/mensagens', { sessao: dono.token, corpo: { sala: avisos.id, texto: 'olha esse link' } });
  assert.equal(envio.status, 200);
  assert.equal(envio.corpo.mensagem.nome, 'abner');

  const lidas = await chamar('GET', `/mensagens?sala=${avisos.id}`, { sessao: dono.token });
  assert.equal(lidas.corpo.mensagens.at(-1).texto, 'olha esse link');
});

test('quem está de castigo não escreve', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const salas = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms;
  const avisos = salas.find((s) => s.name === 'Avisos');

  await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'timeout', alvo: bruno.eu.id, minutos: 5 } });
  const r = await chamar('POST', '/mensagens', { sessao: bruno.token, corpo: { sala: avisos.id, texto: 'oi' } });
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /castigo/);
  await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'tirarTimeout', alvo: bruno.eu.id } });
});

test('sem sessão não se lê nem se escreve no chat', async () => {
  assert.equal((await chamar('GET', '/mensagens?sala=1')).status, 401);
  assert.equal((await chamar('POST', '/mensagens', { corpo: { sala: 1, texto: 'oi' } })).status, 401);
});

test('apagar sala leva as mensagens junto', async () => {
  const dono = await sessaoDe('abner');
  const nova = (await chamar('POST', '/salas/criar', { sessao: dono.token, corpo: { nome: 'Temporaria', tipo: 'texto' } })).corpo.sala;
  await chamar('POST', '/mensagens', { sessao: dono.token, corpo: { sala: nova.id, texto: 'some comigo' } });

  assert.equal((await chamar('POST', '/salas/apagar', { sessao: dono.token, corpo: { id: nova.id } })).status, 200);
  const r = await chamar('GET', `/mensagens?sala=${nova.id}`, { sessao: dono.token });
  assert.equal(r.status, 404, 'a sala apagada ainda respondia');
});

// --- cargos configuráveis -----------------------------------------------------

test('o servidor traz os cargos e a lista de permissões que existem', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('GET', '/servidor', { sessao: dono.token });
  assert.deepEqual(r.corpo.cargos.map((c) => c.nome), ['Dono', 'Moderador', 'Membro']);
  assert.equal(r.corpo.cargos[0].dono, true);
  assert.ok(r.corpo.permissoes.banir, 'a tela precisa saber que permissões desenhar');
});

test('o dono cria um cargo com as permissões que escolher', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/cargos/criar', {
    sessao: dono.token,
    corpo: { nome: 'Faxineiro', cor: '#22c55e', nivel: 20, permissoes: ['gerirSons', 'inventada'] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.cargo.nome, 'Faxineiro');
  assert.deepEqual(r.corpo.cargo.permissoes, ['gerirSons'], 'permissão inventada foi descartada');
});

test('membro não cria nem apaga cargo', async () => {
  const bruno = await sessaoDe('bruno');
  assert.equal((await chamar('POST', '/cargos/criar', { sessao: bruno.token, corpo: { nome: 'X', nivel: 5 } })).status, 403);
  assert.equal((await chamar('POST', '/cargos/apagar', { sessao: bruno.token, corpo: { id: 1 } })).status, 403);
});

test('o cargo de dono não se edita nem se apaga', async () => {
  const dono = await sessaoDe('abner');
  const cargos = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  const oDono = cargos.find((c) => c.dono);
  assert.equal((await chamar('POST', '/cargos/editar', { sessao: dono.token, corpo: { id: oDono.id, nome: 'Rei', nivel: 100 } })).status, 403);
  assert.equal((await chamar('POST', '/cargos/apagar', { sessao: dono.token, corpo: { id: oDono.id } })).status, 403);
});

test('nível fora de 1 a 99 é recusado', async () => {
  const dono = await sessaoDe('abner');
  for (const nivel of [0, 100, 101, -1]) {
    const r = await chamar('POST', '/cargos/criar', { sessao: dono.token, corpo: { nome: `N${nivel}`, nivel } });
    assert.equal(r.status, 400, `nível ${nivel} passou`);
  }
});

test('dar um cargo muda o que a pessoa pode fazer', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const cargos = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  const faxineiro = cargos.find((c) => c.nome === 'Faxineiro');

  // Antes: sem permissão de som.
  assert.equal((await subirSom(bruno.token, 'antes')).status, 403);

  await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'cargo', alvo: bruno.eu.id, cargo: faxineiro.id } });
  assert.equal((await subirSom(bruno.token, 'depois')).status, 200, 'o cargo novo não valeu');
});

test('apagar cargo devolve quem estava nele ao mais baixo', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const cargos = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  const faxineiro = cargos.find((c) => c.nome === 'Faxineiro');

  assert.equal((await chamar('POST', '/cargos/apagar', { sessao: dono.token, corpo: { id: faxineiro.id } })).status, 200);

  const lista = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.membros;
  const dele = lista.find((m) => m.id === bruno.eu.id);
  assert.equal(dele.cargoNome, 'Membro', 'ficou sem cargo em vez de descer');
});

// --- vários servidores --------------------------------------------------------

test('cada um vê só os servidores de que faz parte', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('GET', '/servidores', { sessao: dono.token });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.servidores.length, 1, 'começa com o servidor de casa');
});

test('criar servidor dá o cargo de dono e salas para começar', async () => {
  const bruno = await sessaoDe('bruno');
  const r = await chamar('POST', '/servidores/criar', { sessao: bruno.token, corpo: { nome: 'Sala do Bruno' } });
  assert.equal(r.status, 200);
  const novo = r.corpo.servidor;

  // No servidor novo ele é dono, mesmo sendo membro comum no outro.
  const eu = await chamar('GET', '/eu', { sessao: bruno.token, servidor: novo.id });
  assert.equal(eu.corpo.eu.cargo.dono, true);

  const salas = await chamar('GET', '/rooms', { sessao: bruno.token, servidor: novo.id });
  assert.deepEqual(salas.corpo.rooms.map((s) => `${s.name}:${s.tipo}`), ['Geral:voz', 'Avisos:texto']);
});

test('o cargo vale por servidor, não pela pessoa', async () => {
  // É o ponto de todo o desenho: dono num servidor, membro noutro.
  const bruno = await sessaoDe('bruno');
  const lista = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores;
  const casa = lista[0], dele = lista.find((s) => s.nome === 'Sala do Bruno');

  const naCasa = await chamar('GET', '/eu', { sessao: bruno.token, servidor: casa.id });
  const noDele = await chamar('GET', '/eu', { sessao: bruno.token, servidor: dele.id });
  assert.equal(naCasa.corpo.eu.cargo.dono, false);
  assert.equal(noDele.corpo.eu.cargo.dono, true);
});

test('quem não é do servidor não o acessa, mesmo sabendo o número', async () => {
  const bruno = await sessaoDe('bruno');
  const dele = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores
    .find((s) => s.nome === 'Sala do Bruno');

  // O dono da casa não faz parte do servidor do Bruno: pedir por ele cai no dele mesmo.
  // A comparação é por identidade, não por nome — o nome do servidor de casa muda noutro teste.
  const dono = await sessaoDe('abner');
  const r = await chamar('GET', '/eu', { sessao: dono.token, servidor: dele.id });
  assert.notEqual(r.corpo.servidor.id, dele.id, 'entrou num servidor alheio');
  const meus = (await chamar('GET', '/servidores', { sessao: dono.token })).corpo.servidores;
  assert.ok(meus.some((s) => s.id === r.corpo.servidor.id), 'caiu num servidor que nem é dele');
});

test('convite leva alguém para dentro', async () => {
  const bruno = await sessaoDe('bruno');
  const dele = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores
    .find((s) => s.nome === 'Sala do Bruno');

  const convite = await chamar('POST', '/servidores/convite', { sessao: bruno.token, servidor: dele.id, corpo: {} });
  assert.match(convite.corpo.convite.codigo, /^[A-Z2-9]{8}$/);

  const caio = await sessaoDe('caio');
  const entrou = await chamar('POST', '/servidores/entrar', { sessao: caio.token, corpo: { codigo: convite.corpo.convite.codigo } });
  assert.equal(entrou.status, 200);
  assert.equal(entrou.corpo.servidor.nome, 'Sala do Bruno');

  const meus = (await chamar('GET', '/servidores', { sessao: caio.token })).corpo.servidores;
  assert.ok(meus.some((s) => s.nome === 'Sala do Bruno'));
});

test('convite inventado é recusado sem dizer o que existe', async () => {
  const caio = await sessaoDe('caio');
  const r = await chamar('POST', '/servidores/entrar', { sessao: caio.token, corpo: { codigo: 'ABCD2345' } });
  assert.equal(r.status, 404);
  assert.match(r.corpo.error, /inválido ou vencido/);
});

test('membro comum não gera convite', async () => {
  const bruno = await sessaoDe('bruno');
  const dele = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores
    .find((s) => s.nome === 'Sala do Bruno');
  const caio = await sessaoDe('caio');
  const r = await chamar('POST', '/servidores/convite', { sessao: caio.token, servidor: dele.id, corpo: {} });
  assert.equal(r.status, 403);
});

test('dá para sair de um servidor, menos se você é o dono', async () => {
  const bruno = await sessaoDe('bruno');
  const dele = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores
    .find((s) => s.nome === 'Sala do Bruno');

  assert.equal((await chamar('POST', '/servidores/sair', { sessao: bruno.token, servidor: dele.id, corpo: {} })).status, 409);

  const caio = await sessaoDe('caio');
  assert.equal((await chamar('POST', '/servidores/sair', { sessao: caio.token, servidor: dele.id, corpo: {} })).status, 200);
  const meus = (await chamar('GET', '/servidores', { sessao: caio.token })).corpo.servidores;
  assert.ok(!meus.some((s) => s.nome === 'Sala do Bruno'), 'continuou dentro depois de sair');
});

test('salas de servidores diferentes não se misturam na voz', async () => {
  // Duas salas chamadas "Geral" em servidores diferentes precisam ser conversas
  // separadas: o LiveKit as identifica pelo id da sala, não pelo nome.
  const bruno = await sessaoDe('bruno');
  const lista = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores;
  const casa = lista[0], dele = lista.find((s) => s.nome === 'Sala do Bruno');

  const naCasa = await chamar('POST', '/token', { sessao: bruno.token, servidor: casa.id, corpo: { room: 'Geral' } });
  const noDele = await chamar('POST', '/token', { sessao: bruno.token, servidor: dele.id, corpo: { room: 'Geral' } });
  assert.equal(naCasa.status, 200);
  assert.equal(noDele.status, 200);

  const salaDe = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).video.room;
  assert.notEqual(salaDe(naCasa.corpo.token), salaDe(noDele.corpo.token), 'as duas "Geral" caíram na mesma sala');
});
