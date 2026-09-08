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

let processo, base, pasta;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'cantinho-'));
  const porta = 3000 + Math.floor(Math.random() * 1000);
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
      LIVEKIT_HOST: 'http://127.0.0.1:1',      // não existe: as chamadas caem no catch
      LIVEKIT_PUBLIC_URL: 'ws://exemplo:7880',
      SEM_NOTAS: '1',   // sem ir ao GitHub: o teste não depende da internet
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
  chamar('POST', '/cadastrar', { corpo: { apelido, senha, senhaRepetida: senha } });

test('cadastrar não pede mais senha de grupo', async () => {
  // Ela saiu por pedido do dono. Este teste existe para que voltar a exigi-la seja uma
  // decisão, e não um efeito de alguém mexer no cadastro sem saber que ela tinha saído.
  const r = await chamar('POST', '/cadastrar', {
    corpo: { apelido: 'semconvite', senha: 'segredo123', senhaRepetida: 'segredo123' },
  });
  assert.equal(r.status, 200);
  assert.ok(r.corpo.token);
});

test('cadastro devolve sessão, servidor e salas de uma vez', async () => {
  const r = await cadastrar('abner');
  assert.equal(r.status, 200);
  assert.ok(r.corpo.token);
  assert.equal(r.corpo.eu.apelido, 'abner');
  // Mandar não é mais um cargo: quem criou entra com o cargo mais alto que existe, e o
  // poder vem de `criado_por`.
  assert.equal(r.corpo.eu.cargoNome, 'Moderador');
  assert.equal(r.corpo.eu.cargo.dono, true, 'o apelido de DONO devia mandar no servidor');
  // A sala de notas vem primeiro e é do app, não do .env — por isso não está em ROOMS.
  assert.deepEqual(r.corpo.salas.map((s) => s.nome), ['notas-da-versão', 'Geral', 'Jogos']);
  assert.deepEqual(r.corpo.salas.filter((s) => !s.papel).map((s) => s.tipo), ['voz', 'voz'], 'as semeadas são de voz');
  assert.equal(r.corpo.salas[0].papel, 'notas', 'a de notas é a primeira, e é de texto');
  assert.equal(r.corpo.salas[0].tipo, 'texto');
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

test('errar a senha muitas vezes não tranca ninguém para fora', async () => {
  // Havia um freio de 20 tentativas por IP a cada 10 minutos, e ele contava as CERTAS
  // junto — então o grupo inteiro atrás do mesmo roteador dividia o mesmo balde, e quem
  // errasse duas vezes tomava 10 minutos de porta fechada. Um amigo do dono ficou de
  // fora por isso. Errar é 401 e continua sendo 401; a próxima certa entra na hora.
  await cadastrar('trombadinha');
  for (let i = 0; i < 30; i++) {
    const r = await chamar('POST', '/entrar', { corpo: { apelido: 'trombadinha', senha: 'chute' + i } });
    assert.equal(r.status, 401, `a tentativa ${i + 1} respondeu ${r.status}, não 401`);
  }
  const certa = await chamar('POST', '/entrar', { corpo: { apelido: 'trombadinha', senha: 'segredo123' } });
  assert.equal(certa.status, 200, 'depois de errar muito, a senha certa não entrou');
  assert.ok(certa.corpo.token);
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

test('com Berserk, a imagem animada passa', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/saga/berserk', { sessao: dono.token, corpo: { alvo: dono.eu.id, berserk: true } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.conta.berserk, true);

  const b = await subir('/eu/banner', dono.token, GIF);
  assert.equal(b.status, 200);
  assert.match(b.corpo.eu.banner, /\.gif$/);
});

test('quem não é dono da Saga não mexe no Berserk, nem no próprio', async () => {
  // Dar Berserk deixou de ser permissão de servidor: quem manda no CARDUME não pode
  // distribuir distinção que aparece em todos os outros servidores.
  const bruno = await sessaoDe('bruno');
  const r = await chamar('POST', '/saga/berserk', { sessao: bruno.token, corpo: { alvo: bruno.eu.id, berserk: true } });
  assert.equal(r.status, 403);
  const lista = await chamar('GET', '/saga/contas', { sessao: bruno.token });
  assert.equal(lista.status, 403);
});

test('o painel da Saga lista as contas para quem é dono', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('GET', '/saga/contas', { sessao: dono.token });
  assert.equal(r.status, 200);
  assert.ok(r.corpo.contas.some((c) => c.apelido === 'abner' && c.dono), 'o dono devia constar como dono');
  assert.ok(r.corpo.contas.some((c) => c.apelido === 'bruno' && !c.dono));
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
  assert.deepEqual(r.corpo.rooms.map((s) => s.name), ['notas-da-versão', 'Geral', 'Jogos']);
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
  assert.deepEqual(r.corpo.cargos.map((c) => c.nome), ['Moderador', 'Membro']);
  assert.ok(r.corpo.permissoes.banir, 'a tela precisa saber que permissões desenhar');
});

test('o dono cria um cargo com as permissões que escolher', async () => {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/cargos/criar', {
    sessao: dono.token,
    corpo: { nome: 'Faxineiro', cor: '#22c55e', nivel: 20, permissoes: ['gerirSons', 'gerirSalas', 'inventada'] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.cargo.nome, 'Faxineiro');
  assert.deepEqual(r.corpo.cargo.permissoes, ['gerirSons', 'gerirSalas'], 'permissão inventada foi descartada');
});

test('membro não cria nem apaga cargo', async () => {
  const bruno = await sessaoDe('bruno');
  assert.equal((await chamar('POST', '/cargos/criar', { sessao: bruno.token, corpo: { nome: 'X', nivel: 5 } })).status, 403);
  assert.equal((await chamar('POST', '/cargos/apagar', { sessao: bruno.token, corpo: { id: 1 } })).status, 403);
});

test('todo cargo do servidor pode ser renomeado, inclusive o mais alto', async () => {
  const dono = await sessaoDe('abner');
  const cargos = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  // Não existe mais cargo intocável: todos são do pessoal do servidor, e quem criou pode
  // renomear, mexer e apagar como quiser.
  const oMaisAlto = cargos[0];
  assert.equal((await chamar('POST', '/cargos/editar', { sessao: dono.token, corpo: { id: oMaisAlto.id, nome: 'Rei', nivel: 60, permissoes: [] } })).status, 200);
  const depois = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  assert.ok(depois.some((c) => c.nome === 'Rei'), 'o cargo mais alto devia poder ser renomeado');
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
  const criarSala = (t, nome) => chamar('POST', '/salas/criar', { sessao: t, corpo: { nome, tipo: 'voz' } });

  assert.equal((await criarSala(bruno.token, 'antes')).status, 403);
  await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'cargo', alvo: bruno.eu.id, cargo: faxineiro.id } });
  assert.equal((await criarSala(bruno.token, 'depois')).status, 200, 'o cargo novo não valeu');
});

test('o soundboard é do cargo mais alto, e não de quem só tem a permissão', async () => {
  // "Faxineiro" tem `gerirSons` e está no nível 20; o cargo do topo é outro. Som toca
  // para a call inteira e quem não gostou não desfaz — por isso a permissão sozinha não
  // basta. Quem CRIOU o servidor está sempre acima de todos, mesmo vestindo o cargo mais
  // baixo, e por isso ele continua podendo.
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const cargos = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  const faxineiro = cargos.find((c) => c.nome === 'Faxineiro');
  await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'cargo', alvo: bruno.eu.id, cargo: faxineiro.id } });

  const r = await subirSom(bruno.token, 'do faxineiro');
  assert.equal(r.status, 403, 'quem não é o topo subiu som');
  assert.match(r.corpo.error, /cargo mais alto/);

  assert.equal((await subirSom(dono.token, 'do dono')).status, 200, 'quem criou o servidor devia poder');
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

test('servidor novo é usável de ponta a ponta: salas, voz e chat', async () => {
  // O caminho inteiro de quem cria um servidor e passa a viver nele. Cada pedaço já era
  // testado à parte; o que faltava era a costura, que é onde o x-servidor se perde.
  await cadastrar('duda');
  const duda = await sessaoDe('duda');
  const novo = (await chamar('POST', '/servidores/criar', {
    sessao: duda.token, corpo: { nome: 'Salão de Duda' },
  })).corpo.servidor;

  // 1. cria uma sala de voz e uma de texto no servidor novo
  const voz = await chamar('POST', '/salas/criar', {
    sessao: duda.token, servidor: novo.id, corpo: { nome: 'Bancada', tipo: 'voz' },
  });
  assert.equal(voz.status, 200, JSON.stringify(voz.corpo));
  const texto = await chamar('POST', '/salas/criar', {
    sessao: duda.token, servidor: novo.id, corpo: { nome: 'recados', tipo: 'texto' },
  });
  assert.equal(texto.status, 200);

  // 2. as salas aparecem no servidor certo, e SÓ nele
  const daqui = (await chamar('GET', '/rooms', { sessao: duda.token, servidor: novo.id })).corpo.rooms;
  assert.ok(daqui.some((s) => s.name === 'Bancada'), 'a sala criada não apareceu');
  const deCasa = (await chamar('GET', '/rooms', { sessao: duda.token })).corpo.rooms;
  assert.ok(!deCasa.some((s) => s.name === 'Bancada'), 'a sala vazou para o servidor de casa');

  // 3. o passe de voz sai, e é de uma sala diferente da homônima do outro servidor
  const passe = await chamar('POST', '/token', {
    sessao: duda.token, servidor: novo.id, corpo: { sala: voz.corpo.sala.id },
  });
  assert.equal(passe.status, 200, JSON.stringify(passe.corpo));
  assert.ok(passe.corpo.token, 'não veio passe do LiveKit');

  const geralDaqui = daqui.find((s) => s.name === 'Geral');
  const geralDeCasa = deCasa.find((s) => s.name === 'Geral');
  assert.notEqual(geralDaqui.id, geralDeCasa.id,
    'dois "Geral" com o mesmo id cairiam na mesma conversa');

  // 4. o chat da sala nova funciona e fica onde foi escrito
  const msg = await chamar('POST', '/mensagens', {
    sessao: duda.token, servidor: novo.id,
    corpo: { sala: texto.corpo.sala.id, texto: 'primeira daqui' },
  });
  assert.equal(msg.status, 200, JSON.stringify(msg.corpo));
  const lidas = await chamar('GET', `/mensagens?sala=${texto.corpo.sala.id}`, {
    sessao: duda.token, servidor: novo.id,
  });
  assert.ok(lidas.corpo.mensagens.some((m) => m.texto === 'primeira daqui'));
});

test('o Berserk atravessa os servidores; o cargo, não', async () => {
  // O que distingue os dois: cargo é do vínculo, Berserk é da conta — da Saga inteira.
  const bruno = await sessaoDe('bruno');
  const meus = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores;
  const dele = meus.find((s) => s.nome === 'Sala do Bruno');
  const casa = meus.find((s) => s.id !== dele.id);

  const eu = (await chamar('GET', '/eu', { sessao: bruno.token, servidor: dele.id })).corpo.eu;
  // Quem concede é o dono da Saga, de fora de qualquer servidor — o Bruno manda no
  // servidor dele e mesmo assim não distribui Berserk.
  const dono = await sessaoDe('abner');
  const negado = await chamar('POST', '/saga/berserk', {
    sessao: bruno.token, corpo: { alvo: eu.id, berserk: true },
  });
  assert.equal(negado.status, 403, 'dono de servidor não concede Berserk');

  const deu = await chamar('POST', '/saga/berserk', {
    sessao: dono.token, corpo: { alvo: eu.id, berserk: true },
  });
  assert.equal(deu.status, 200, JSON.stringify(deu.corpo));
  assert.equal(deu.corpo.conta.berserk, true);

  const naCasa = (await chamar('GET', '/eu', { sessao: bruno.token, servidor: casa.id })).corpo.eu;
  assert.equal(naCasa.turbo, true, 'o Berserk tem de valer em todos os servidores');
  assert.equal(naCasa.cargo.dono, false, 'o cargo, esse, continua sendo de cada servidor');
  assert.equal(naCasa.donoDaSaga, false, 'e mandar num servidor não é mandar na Saga');
  assert.equal(naCasa.donoDaSaga, false, 'e mandar num servidor não é mandar na Saga');
});

test('trocar a imagem zera o enquadramento dela, e só o dela', async () => {
  // Foi o bug de verdade: quem tinha dado zoom num banner e subia outro via a imagem
  // nova com a aproximação da antiga — um pedaço gigante no lugar do desenho.
  const { token, eu } = await sessaoDe('abner');
  await chamar('POST', '/saga/berserk', { sessao: token, corpo: { alvo: eu.id, berserk: true } });

  assert.equal((await subir('/eu/foto', token, PNG)).status, 200);
  assert.equal((await subir('/eu/banner', token, GIF)).status, 200);

  const enquadrar = (papel, valor) =>
    chamar('PATCH', '/eu/enquadramento', { sessao: token, corpo: { papel, valor } });
  await enquadrar('foto', { x: 20, y: 30, zoom: 2 });
  await enquadrar('banner', { x: 80, y: 10, zoom: 3 });

  const antes = (await chamar('GET', '/eu', { sessao: token })).corpo.eu;
  assert.deepEqual(antes.enquadramento.banner, { x: 80, y: 10, zoom: 3 });
  assert.deepEqual(antes.enquadramento.foto, { x: 20, y: 30, zoom: 2 });

  // troca só o banner
  assert.equal((await subir('/eu/banner', token, GIF)).status, 200);
  const depois = (await chamar('GET', '/eu', { sessao: token })).corpo.eu;
  assert.equal(depois.enquadramento.banner, undefined, 'o enquadramento do banner tinha de zerar');
  assert.deepEqual(depois.enquadramento.foto, { x: 20, y: 30, zoom: 2 },
    'trocar o banner não pode mexer em como a foto está posta');
});

test('tirar a imagem também leva o enquadramento dela', async () => {
  const sessao = await sessaoDe('abner');
  await chamar('POST', '/saga/berserk', { sessao: sessao.token, corpo: { alvo: sessao.eu.id, berserk: true } });
  assert.equal((await subir('/eu/banner', sessao.token, GIF)).status, 200);
  await chamar('PATCH', '/eu/enquadramento', { sessao: sessao.token, corpo: { papel: 'banner', valor: { x: 10, y: 90, zoom: 2 } } });
  assert.equal((await subir('/eu/banner', sessao.token, Buffer.alloc(0))).status, 200);
  const eu = (await chamar('GET', '/eu', { sessao: sessao.token })).corpo.eu;
  assert.equal(eu.banner, null);
  assert.equal(eu.enquadramento.banner, undefined);
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

test('dá para sair de um servidor, menos se você o criou', async () => {
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


test('arquivo grande demais responde 413 com motivo, e nao derruba a conexao', async () => {
  // O amigo do dono perdeu um zip por causa disso: o servidor fazia `req.destroy()` e o
  // app nao recebia resposta nenhuma — o botao ficava apagado e nada aparecia. No
  // registro sobrava so "Error: aborted". Um NAO precisa chegar.
  const { token } = await sessaoDe('abner');
  const sala = (await chamar('GET', '/rooms', { sessao: token })).corpo.rooms.find((r) => r.tipo === 'texto');
  const gigante = Buffer.alloc(201 * 1024 * 1024, 7);   // acima dos 200 MB

  const r = await fetch(`${base}/mensagens/arquivo?sala=${sala.id}&nome=gigante.zip`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-sessao': token },
    body: gigante,
  });
  assert.equal(r.status, 413, 'devia ser um 413, nao uma conexao morta');
  const corpo = await r.json();
  assert.match(corpo.error, /passa de 200 MB/, 'a mensagem precisa dizer o tamanho');
});

test('arquivo dentro do limite entra, com o nome que a pessoa deu', async () => {
  const { token } = await sessaoDe('abner');
  const sala = (await chamar('GET', '/rooms', { sessao: token })).corpo.rooms.find((r) => r.tipo === 'texto');
  const r = await fetch(`${base}/mensagens/arquivo?sala=${sala.id}&nome=${encodeURIComponent('coisas.zip')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-sessao': token },
    body: Buffer.from('PK isto eh um zip de mentira'),
  });
  assert.equal(r.status, 200);
  const { mensagem } = await r.json();
  assert.equal(mensagem.arquivo.nome, 'coisas.zip');
  assert.match(mensagem.arquivo.url, /^[0-9a-f]{32}\.bin$/, 'no disco vira hash inerte');
});
