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
import { TODAS } from './permissoes.mjs';

let processo, base, pasta;
// O que o servidor escreveu no console: há testes que conferem o que foi anotado, e o que
// NUNCA pode ser — código e senha. Os DOIS canais, porque o `docker logs` junta os dois: só
// com o stdout, um segredo que saísse pelo `console.error` do 500 — o canal mais provável de
// vazamento — passaria com o teste verde e iria parar no registro de produção.
let registro = '';

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
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Lido sempre, e não só quando um teste quer: um cano que ninguém esvazia enche, e o
  // servidor passa a travar no próximo console.log.
  processo.stdout.on('data', (d) => { registro += String(d); });
  processo.stderr.on('data', (d) => {
    const s = String(d);
    registro += s;
    if (!s.includes('Experimental')) console.error('servidor:', s);
  });

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

const chamar = async (metodo, rota, { corpo, sessao, servidor, agente } = {}) => {
  const r = await fetch(base + rota, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(sessao ? { 'x-sessao': sessao } : {}),
      ...(servidor ? { 'x-servidor': String(servidor) } : {}),
      ...(agente ? { 'user-agent': agente } : {}),
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

const criarConta = (apelido, senha = 'segredo123') =>
  chamar('POST', '/cadastrar', { corpo: { apelido, senha, senhaRepetida: senha } });

/**
 * O convite do servidor de casa, gerado uma vez e reusado.
 *
 * Sem `maxUsos` ele vale por uma semana e por quantas pessoas quiserem, que é o que os
 * testes precisam — e é a mesma porta que um amigo de verdade atravessa.
 */
let conviteDeCasa = null;
async function convite() {
  if (!conviteDeCasa) {
    const dono = await sessaoDe('abner');
    const r = await chamar('POST', '/servidores/convite', { sessao: dono.token, corpo: {} });
    assert.equal(r.status, 200, `não saiu convite: ${JSON.stringify(r.corpo)}`);
    conviteDeCasa = r.corpo.convite.codigo;
  }
  return conviteDeCasa;
}

/**
 * Cria a conta e entra no servidor de casa, que é o caminho de quem chega.
 *
 * A conta nova não cai mais em servidor nenhum — ela nasce numa tela vazia, como no
 * Discord, e a porta é o convite. Os testes daqui para baixo falam de gente que já está
 * DENTRO do servidor de casa, então o helper faz as duas coisas; quem quiser exercitar
 * só o cadastro usa `criarConta`.
 */
async function cadastrar(apelido, senha = 'segredo123') {
  const r = await criarConta(apelido, senha);
  // O dono do `.env` já nasce no servidor de casa: é dele.
  if (r.status !== 200 || r.corpo.servidor) return r;
  const entrou = await chamar('POST', '/servidores/entrar', {
    sessao: r.corpo.token, corpo: { codigo: await convite() },
  });
  assert.equal(entrou.status, 200, `não entrei com o convite: ${JSON.stringify(entrou.corpo)}`);
  const eu = await chamar('GET', '/eu', { sessao: r.corpo.token });
  return { status: r.status, corpo: { ...r.corpo, ...eu.corpo } };
}

test('cadastrar não pede mais senha de grupo', async () => {
  // Ela saiu por pedido do dono. Este teste existe para que voltar a exigi-la seja uma
  // decisão, e não um efeito de alguém mexer no cadastro sem saber que ela tinha saído.
  const r = await chamar('POST', '/cadastrar', {
    corpo: { apelido: 'semconvite', senha: 'segredo123', senhaRepetida: 'segredo123' },
  });
  assert.equal(r.status, 200);
  assert.ok(r.corpo.token);
});

test('conta nova não cai em servidor nenhum: a primeira tela é vazia', async () => {
  // Era o contrário: quem se cadastrava caía no servidor de casa, porque ele era o único
  // que existia e a senha do grupo fazia as vezes de porta. Hoje a porta é o convite POR
  // SERVIDOR, e este teste existe para que voltar a jogar todo mundo lá dentro seja uma
  // decisão, e não o efeito de alguém mexer no cadastro sem saber que isso saiu.
  const r = await criarConta('recemchegado');
  assert.equal(r.status, 200);
  assert.equal(r.corpo.servidor, null, 'a conta nova entrou num servidor sozinha');
  assert.deepEqual(r.corpo.servidores, []);
  assert.deepEqual(r.corpo.salas, []);
  // Mas a tela vazia precisa saber QUEM é você — foto, nome e o caminho de sair.
  assert.equal(r.corpo.eu.apelido, 'recemchegado');
  assert.equal(r.corpo.eu.cargo, null, 'cargo é do vínculo, e não há vínculo nenhum');
  // Quem acabou de chegar não está IMPEDIDO de nada: a tela inicial não pode acusar
  // "você não faz parte deste servidor" de um servidor que ninguém mencionou.
  assert.equal(r.corpo.impedimento, null);
});

test('sem servidor, /eu responde quem você é em vez de 404', async () => {
  // O app pergunta isto ao abrir e, tomando erro, entende "essa sessão não vale mais" e
  // apaga o crachá: quem tinha acabado de se cadastrar era deslogado na primeira volta.
  const { corpo } = await criarConta('sozinho');
  const r = await chamar('GET', '/eu', { sessao: corpo.token });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.eu.apelido, 'sozinho');
  assert.equal(r.corpo.servidor, null);
});

test('sem servidor ainda dá para pôr uma foto: ela é da conta', async () => {
  const { corpo } = await criarConta('fotogenico');
  // `subir` e `PNG` moram na seção de imagens, mais abaixo: o caso roda depois de o
  // arquivo inteiro ter sido lido, então declará-los lá não é problema.
  const r = await subir('/eu/foto', corpo.token, PNG);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(r.corpo.eu.foto, 'a foto não voltou');
});

test('código inventado não abre porta nenhuma', async () => {
  const { corpo } = await criarConta('chutador');
  const r = await chamar('POST', '/servidores/entrar', { sessao: corpo.token, corpo: { codigo: 'ABCD2345' } });
  assert.equal(r.status, 404);
  assert.equal((await chamar('GET', '/eu', { sessao: corpo.token })).corpo.servidor, null);
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

test('o convite é a porta: com o código, a conta nova entra no servidor de casa', async () => {
  const { corpo } = await criarConta('convidado');
  const codigo = await convite();
  const entrou = await chamar('POST', '/servidores/entrar', { sessao: corpo.token, corpo: { codigo } });
  assert.equal(entrou.status, 200);

  const eu = await chamar('GET', '/eu', { sessao: corpo.token });
  assert.equal(eu.corpo.servidor.id, entrou.corpo.servidor.id);
  assert.equal(eu.corpo.eu.cargoNome, 'Membro', 'quem entra por convite cai no cargo mais baixo');
  assert.equal(eu.corpo.servidores.length, 1, 'a barra de servidores se desenha com esta lista');
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

test('o crachá da sala deixa o app contar a quem ele assiste', async () => {
  const { token } = await sessaoDe('abner');
  const r = await chamar('POST', '/token', { sessao: token, corpo: { room: 'Geral' } });
  const grant = JSON.parse(Buffer.from(r.corpo.token.split('.')[1], 'base64url')).video;
  // Sem `canUpdateOwnMetadata`, o LiveKit recusa o atributo `assistindo` e quem transmite
  // deixa de saber quem está vendo — sem erro nenhum aparecer para ninguém. É o tipo de
  // coisa que só se descobre em call, então fica travado aqui.
  assert.equal(grant.canUpdateOwnMetadata, true);
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

test('banido num servidor continua logado: perde só aquele servidor', async () => {
  // Banir derrubava as sessões da conta, e o banido num servidor ia parar na tela de login
  // — inclusive o dono, banido do servidor de um amigo em 11/09/2026.
  const dono = await sessaoDe('abner');
  const alvo = (await cadastrar('elias')).corpo;
  const casa = alvo.servidor.id;
  assert.equal((await chamar('GET', '/eu', { sessao: alvo.token })).status, 200);

  await chamar('POST', '/moderar', { sessao: dono.token, servidor: casa, corpo: { acao: 'banir', alvo: alvo.eu.id } });
  const depois = await chamar('GET', '/eu', { sessao: alvo.token });
  assert.equal(depois.status, 200, 'a sessão do banido caiu');
  assert.equal(depois.corpo.servidor, null, 'o servidor de que foi banido devia sumir');
  assert.match(depois.corpo.impedimento ?? '', /banido/, 'o banido devia ver o motivo');

  const volta = await chamar('POST', '/entrar', { corpo: { apelido: 'elias', senha: 'segredo123' } });
  assert.match(volta.corpo.impedimento ?? '', /banido/, 'o banido devia ver o motivo ao entrar');
});

test('expulso sai do servidor, continua logado e volta com convite', async () => {
  const dono = await sessaoDe('abner');
  const alvo = (await cadastrar('gilda')).corpo;
  await chamar('POST', '/moderar', { sessao: dono.token, servidor: alvo.servidor.id, corpo: { acao: 'expulsar', alvo: alvo.eu.id } });

  const depois = await chamar('GET', '/eu', { sessao: alvo.token });
  assert.equal(depois.status, 200, 'a sessão do expulso caiu');
  assert.equal(depois.corpo.servidor, null, 'o expulso continuou no servidor');

  const volta = await chamar('POST', '/servidores/entrar', { sessao: alvo.token, corpo: { codigo: await convite() } });
  assert.equal(volta.status, 200, 'o expulso não conseguiu voltar com convite');
});

test('pedindo pelo servidor de que foi banido, a resposta diz que é de outro', async () => {
  // É por esse número que o app percebe, com a janela aberta, que o servidor aberto não é
  // mais dele: o servidor não responde erro, de propósito.
  const dono = await sessaoDe('abner');
  const alvo = (await cadastrar('helena')).corpo;
  const casa = alvo.servidor.id;
  const dela = (await chamar('POST', '/servidores/criar', { sessao: alvo.token, corpo: { nome: 'Da Helena' } })).corpo.servidor;

  await chamar('POST', '/moderar', { sessao: dono.token, servidor: casa, corpo: { acao: 'banir', alvo: alvo.eu.id } });
  const r = await chamar('GET', '/rooms', { sessao: alvo.token, servidor: casa });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.servidorId, dela.id, 'a resposta devia ser do servidor que sobrou');
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

test('quem escreveu apaga, e a mensagem some também da tela de quem já a tinha', async () => {
  const dono = await sessaoDe('abner');
  // Conta nova: a esta altura o bruno está de castigo, e castigo não escreve.
  const autor = (await cadastrar('ivo_apaga')).corpo;
  const avisos = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms.find((s) => s.name === 'Avisos');

  const envio = await chamar('POST', '/mensagens', { sessao: autor.token, corpo: { sala: avisos.id, texto: 'mandei errado' } });
  assert.equal(envio.status, 200, JSON.stringify(envio.corpo));
  const { mensagem } = envio.corpo;
  // O dono já estava com a sala aberta: a tela dele tem a mensagem e guardou o `agora`.
  const antes = (await chamar('GET', `/mensagens?sala=${avisos.id}`, { sessao: dono.token })).corpo;
  assert.ok(antes.mensagens.some((m) => m.id === mensagem.id));

  const apagou = await chamar('POST', '/mensagens/apagar', { sessao: autor.token, corpo: { id: mensagem.id } });
  assert.equal(apagou.status, 200);

  // A pergunta de sempre — o que chegou depois, e desde quando —: a apagada vem na resposta.
  const depois = (await chamar('GET', `/mensagens?sala=${avisos.id}&depoisDe=${mensagem.id}&apagadasDesde=${antes.agora}`, { sessao: dono.token })).corpo;
  assert.deepEqual(depois.apagadas, [mensagem.id], 'a tela do dono não ficou sabendo');
  const tudo = (await chamar('GET', `/mensagens?sala=${avisos.id}`, { sessao: dono.token })).corpo.mensagens;
  assert.ok(!tudo.some((m) => m.id === mensagem.id), 'a mensagem apagada continuou na leitura');
});

test('apagar a dos outros é do cargo que pode, e só de quem está abaixo', async () => {
  const dono = await sessaoDe('abner');
  const membro = (await cadastrar('joana_apaga')).corpo;
  const avisos = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms.find((s) => s.name === 'Avisos');

  const doDono = (await chamar('POST', '/mensagens', { sessao: dono.token, corpo: { sala: avisos.id, texto: 'do dono' } })).corpo.mensagem;
  const doMembro = (await chamar('POST', '/mensagens', { sessao: membro.token, corpo: { sala: avisos.id, texto: 'do membro' } })).corpo.mensagem;
  assert.ok(doDono && doMembro, 'as mensagens do teste nem chegaram a ser escritas');

  const membroTentou = await chamar('POST', '/mensagens/apagar', { sessao: membro.token, corpo: { id: doDono.id } });
  assert.equal(membroTentou.status, 403, 'membro apagou a mensagem do dono');

  const donoApagou = await chamar('POST', '/mensagens/apagar', { sessao: dono.token, corpo: { id: doMembro.id } });
  assert.equal(donoApagou.status, 200, 'quem criou o servidor não apagou a de um membro');

  const inventada = await chamar('POST', '/mensagens/apagar', { sessao: dono.token, corpo: { id: 999999 } });
  assert.equal(inventada.status, 404);
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

test('quem está digitando vai de carona na busca de mensagens', async () => {
  // Não existe empurrão no servidor, e uma segunda rota polada só para isto dobraria o
  // trânsito do chat. O aviso mora na memória do processo — nada é gravado.
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const salas = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms;
  const avisos = salas.find((s) => s.name === 'Avisos');

  assert.equal((await chamar('POST', '/digitando', { sessao: bruno.token, corpo: { sala: avisos.id } })).status, 200);

  const paraODono = await chamar('GET', `/mensagens?sala=${avisos.id}`, { sessao: dono.token });
  assert.deepEqual(paraODono.corpo.digitando.map((q) => q.id), [bruno.eu.id]);
  // O nome vai junto porque é ele que a frase mostra — e é o nome DESTE servidor, que
  // pode não ser o apelido de entrada.
  assert.ok(paraODono.corpo.digitando[0].nome, 'veio sem nome nenhum');

  const paraOBruno = await chamar('GET', `/mensagens?sala=${avisos.id}`, { sessao: bruno.token });
  assert.deepEqual(paraOBruno.corpo.digitando, [], 'ninguém precisa ser avisado de que está digitando');

  // Mandar a mensagem tira a frase na hora: ela embaixo da mensagem recém-chegada é o
  // pior momento possível para ainda estar lá.
  await chamar('POST', '/mensagens', { sessao: bruno.token, corpo: { sala: avisos.id, texto: 'pronto' } });
  const depois = await chamar('GET', `/mensagens?sala=${avisos.id}`, { sessao: dono.token });
  assert.deepEqual(depois.corpo.digitando, []);
});

test('não se avisa que está digitando em sala de voz nem em sala de outro servidor', async () => {
  const dono = await sessaoDe('abner');
  const salas = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms;
  const voz = salas.find((s) => s.tipo === 'voz');
  assert.equal((await chamar('POST', '/digitando', { sessao: dono.token, corpo: { sala: voz.id } })).status, 400);
  assert.equal((await chamar('POST', '/digitando', { sessao: dono.token, corpo: { sala: 99999 } })).status, 400);
  assert.equal((await chamar('POST', '/digitando', { corpo: { sala: voz.id } })).status, 401);
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

// --- sala privada ---------------------------------------------------------------

test('sala privada some da lista de quem não pode, e continua para quem pode', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const cargos = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  const alto = cargos.reduce((a, b) => (a.nivel >= b.nivel ? a : b));

  const sala = (await chamar('POST', '/salas/criar', { sessao: dono.token, corpo: { nome: 'Reservada', tipo: 'texto' } })).corpo.sala;
  const r = await chamar('POST', '/salas/editar', {
    sessao: dono.token, corpo: { id: sala.id, privada: true, cargos: [alto.id] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.sala.privada, true);
  assert.deepEqual(r.corpo.sala.cargos, [alto.id]);

  const doDono = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms;
  assert.ok(doDono.some((s) => s.id === sala.id), 'quem criou o servidor devia ver');

  const doBruno = (await chamar('GET', '/rooms', { sessao: bruno.token })).corpo.rooms;
  assert.ok(!doBruno.some((s) => s.id === sala.id), 'a sala privada VAZOU na lista');
  const salasDele = (await chamar('GET', '/eu', { sessao: bruno.token })).corpo.salas;
  assert.ok(!salasDele.some((s) => s.id === sala.id), 'vazou no /eu');
});

test('sem poder ver, o chat da sala privada responde como sala inexistente', async () => {
  // 403 numa sala que não se vê ensina que ela existe — que é o que privada evita.
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const salas = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms;
  const sala = salas.find((s) => s.name === 'Reservada');

  const lendo = await chamar('GET', `/mensagens?sala=${sala.id}`, { sessao: bruno.token });
  assert.equal(lendo.status, 404);
  assert.match(lendo.corpo.error, /não existe/);

  const escrevendo = await chamar('POST', '/mensagens', { sessao: bruno.token, corpo: { sala: sala.id, texto: 'oi' } });
  assert.equal(escrevendo.status, 404);

  const digitando = await chamar('POST', '/digitando', { sessao: bruno.token, corpo: { sala: sala.id } });
  assert.equal(digitando.status, 400, 'nem o aviso de digitando pode confirmar que a sala existe');

  // E o dono lê e escreve normalmente.
  assert.equal((await chamar('POST', '/mensagens', { sessao: dono.token, corpo: { sala: sala.id, texto: 'só nós' } })).status, 200);
  assert.equal((await chamar('GET', `/mensagens?sala=${sala.id}`, { sessao: dono.token })).corpo.mensagens.at(-1).texto, 'só nós');
});

test('a voz de uma sala privada não emite passe para quem não a vê', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const voz = (await chamar('POST', '/salas/criar', { sessao: dono.token, corpo: { nome: 'Bunker', tipo: 'voz' } })).corpo.sala;
  const cargos = (await chamar('GET', '/servidor', { sessao: dono.token })).corpo.cargos;
  const alto = cargos.reduce((a, b) => (a.nivel >= b.nivel ? a : b));
  await chamar('POST', '/salas/editar', { sessao: dono.token, corpo: { id: voz.id, privada: true, cargos: [alto.id] } });

  const dele = await chamar('POST', '/token', { sessao: bruno.token, corpo: { sala: voz.id } });
  assert.equal(dele.status, 400, 'saiu passe de voz para sala que ele não vê');
  assert.equal((await chamar('POST', '/token', { sessao: dono.token, corpo: { sala: voz.id } })).status, 200);
});

test('quem não vê a sala privada ainda consegue arrastar as que vê', async () => {
  // A ordem exige "todas as salas, uma vez cada" — e a tela de quem não vê a privada
  // manda a lista sem ela. Exigir a lista inteira tornaria a barra inarrastável.
  const bruno = await sessaoDe('bruno');
  const minhas = (await chamar('GET', '/rooms', { sessao: bruno.token })).corpo.rooms.filter((s) => !s.papel);
  const r = await chamar('POST', '/salas/ordem', {
    sessao: bruno.token,
    corpo: { salas: minhas.reverse().map((s) => ({ id: s.id, categoriaId: s.categoriaId })) },
  });
  // Bruno é membro comum: recusa por PERMISSÃO, não por contagem de salas.
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /cargo/);
});

test('dar acesso a um cargo faz a sala aparecer para quem o veste', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  const salas = (await chamar('GET', '/rooms', { sessao: dono.token })).corpo.rooms;
  const sala = salas.find((s) => s.name === 'Reservada');
  const meu = (await chamar('GET', '/eu', { sessao: bruno.token })).corpo.eu;

  await chamar('POST', '/salas/editar', { sessao: dono.token, corpo: { id: sala.id, cargos: [meu.cargo.id] } });
  const agora = (await chamar('GET', '/rooms', { sessao: bruno.token })).corpo.rooms;
  assert.ok(agora.some((s) => s.id === sala.id), 'o cargo ganhou acesso e a sala não apareceu');

  // E voltando a ser pública, todo mundo vê de novo.
  await chamar('POST', '/salas/editar', { sessao: dono.token, corpo: { id: sala.id, privada: false, cargos: [] } });
  const publica = (await chamar('GET', '/rooms', { sessao: bruno.token })).corpo.rooms;
  assert.ok(publica.some((s) => s.id === sala.id));
});

test('membro comum não edita sala nenhuma', async () => {
  const bruno = await sessaoDe('bruno');
  const salas = (await chamar('GET', '/rooms', { sessao: bruno.token })).corpo.rooms;
  const r = await chamar('POST', '/salas/editar', {
    sessao: bruno.token, corpo: { id: salas[1].id, privada: true, cargos: [] },
  });
  assert.equal(r.status, 403);
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

/*
 * Convidar é permissão PRÓPRIA, e o Membro nasce com ela.
 *
 * Era `gerirServidor` — a de trocar nome e foto — que abria o convite, e nenhum cargo
 * semeado a tem: no "Amigos do Wow" da produção, o Blankito só convidava por ter CRIADO o
 * servidor, e o Druidax, moderador, não convidava ninguém. Estes dois testes trancam as
 * duas pontas: que o cargo mais baixo convida, e que tirar `convidar` de um cargo tira
 * mesmo — por mais poder que ele tenha em tudo o mais.
 */
test('o cargo mais baixo convida, como o @everyone do Discord', async () => {
  const bruno = await sessaoDe('bruno');
  const dele = (await chamar('GET', '/servidores', { sessao: bruno.token })).corpo.servidores
    .find((s) => s.nome === 'Sala do Bruno');
  const caio = await sessaoDe('caio');   // entrou por convite, no cargo mais baixo
  const r = await chamar('POST', '/servidores/convite', { sessao: caio.token, servidor: dele.id, corpo: {} });
  assert.equal(r.status, 200, 'quem entrou no cargo mais baixo devia poder convidar');
  assert.match(r.corpo.convite.codigo, /^[A-Z2-9]{8}$/);
});

test('sem `convidar` no cargo, não sai convite — nem com todo o resto', async () => {
  const dono = await sessaoDe('abner');
  const bruno = await sessaoDe('bruno');
  // Tudo menos convidar: se o convite voltar a depender de outra permissão, este passa a
  // sair e o teste cai.
  const semConvite = (await chamar('POST', '/cargos/criar', {
    sessao: dono.token,
    corpo: { nome: 'Tudo menos convidar', nivel: 30, permissoes: TODAS.filter((p) => p !== 'convidar') },
  })).corpo.cargo;
  await chamar('POST', '/moderar', { sessao: dono.token, corpo: { acao: 'cargo', alvo: bruno.eu.id, cargo: semConvite.id } });

  const r = await chamar('POST', '/servidores/convite', { sessao: bruno.token, corpo: {} });
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /não permite convidar/);
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

// --- xadrez -------------------------------------------------------------------

test('xadrez pela rede: abrir, chamar, o convite no /rooms, aceitar, jogar, assistir e o número noutro servidor', async () => {
  // Contas novas: a costura das rotas não pode depender do que os casos acima fizeram com o bruno.
  const tkp = (await cadastrar('xadrez_tkp')).corpo;
  const juninho = (await cadastrar('xadrez_juninho')).corpo;
  const tava = (await cadastrar('xadrez_tava')).corpo;
  const casa = tkp.servidor.id;
  const naMesa = (sessao, corpo) => chamar('POST', '/jogos/mesa', { sessao, servidor: casa, corpo });

  const aberta = await chamar('POST', '/jogos/abrir', { sessao: tkp.token, servidor: casa, corpo: { tempo: 300, cor: 'brancas' } });
  assert.equal(aberta.status, 200, JSON.stringify(aberta.corpo));
  const { id } = aberta.corpo.mesa;
  assert.equal(aberta.corpo.mesa.eu, 'anfitriao');

  const chamou = await naMesa(tkp.token, { id, acao: 'chamar', alvo: juninho.eu.id });
  assert.equal(chamou.status, 200, JSON.stringify(chamou.corpo));

  // O convite vai de carona na busca de salas, como o "está digitando" na de mensagens.
  const doConvidado = (await chamar('GET', '/rooms', { sessao: juninho.token, servidor: casa })).corpo.jogos;
  assert.deepEqual(
    doConvidado.convites.map((c) => ({ mesa: c.mesa, de: c.de.id, nome: c.de.nome, tempo: c.tempo, cor: c.cor })),
    [{ mesa: id, de: tkp.eu.id, nome: 'xadrez_tkp', tempo: 300, cor: 'pretas' }],
  );
  assert.ok(doConvidado.mesas.some((m) => m.id === id && m.estado === 'lobby' && m.convidado === juninho.eu.id));
  assert.deepEqual((await chamar('GET', '/rooms', { sessao: tava.token, servidor: casa })).corpo.jogos.convites, []);

  const aceitou = await naMesa(juninho.token, { id, acao: 'aceitar' });
  assert.equal(aceitou.status, 200, JSON.stringify(aceitou.corpo));
  assert.equal(aceitou.corpo.mesa.estado, 'jogando');
  assert.deepEqual([aceitou.corpo.mesa.brancas.id, aceitou.corpo.mesa.pretas.id], [tkp.eu.id, juninho.eu.id]);

  const ilegal = await naMesa(tkp.token, { id, acao: 'lance', de: 'e2', para: 'e5' });
  assert.equal(ilegal.status, 400);
  assert.match(ilegal.corpo.error, /não vale/);
  assert.equal((await naMesa(juninho.token, { id, acao: 'lance', de: 'e7', para: 'e5' })).status, 409, 'jogou fora da vez');

  const jogou = await naMesa(tkp.token, { id, acao: 'lance', de: 'e2', para: 'e4' });
  assert.equal(jogou.status, 200, JSON.stringify(jogou.corpo));
  assert.deepEqual(jogou.corpo.mesa.lances, [{ san: 'e4', de: 'e2', para: 'e4' }]);
  assert.equal(jogou.corpo.mesa.relogio.correndo, 'b');

  // Um terceiro abre a mesa: entra na plateia, e não tem lance nenhum a fazer.
  const vista = await chamar('GET', `/jogos/mesa?id=${id}`, { sessao: tava.token, servidor: casa });
  assert.equal(vista.status, 200, JSON.stringify(vista.corpo));
  assert.equal(vista.corpo.mesa.eu, 'plateia');
  assert.deepEqual(vista.corpo.mesa.legais, []);
  assert.equal((await naMesa(tava.token, { id, acao: 'lance', de: 'e7', para: 'e5' })).status, 403);

  const dasPretas = (await chamar('GET', `/jogos/mesa?id=${id}`, { sessao: juninho.token, servidor: casa })).corpo.mesa;
  assert.equal(dasPretas.eu, 'pretas');
  assert.equal(dasPretas.legais.length, 20);
  assert.deepEqual(dasPretas.plateia.map((p) => p.id), [tava.eu.id]);

  const noResumo = (await chamar('GET', '/rooms', { sessao: tava.token, servidor: casa })).corpo.jogos.mesas.find((m) => m.id === id);
  assert.deepEqual(noResumo, { id, estado: 'jogando', anfitriao: tkp.eu.id, brancas: tkp.eu.id, pretas: juninho.eu.id, convidado: null, vez: 'b' });

  // Noutro servidor o número não abre a mesa: responde como mesa que não existe.
  const outro = (await chamar('POST', '/servidores/criar', { sessao: tava.token, corpo: { nome: 'Clube do Xadrez' } })).corpo.servidor;
  const deFora = await chamar('GET', `/jogos/mesa?id=${id}`, { sessao: tava.token, servidor: outro.id });
  assert.equal(deFora.status, 404);
  assert.equal(deFora.corpo.error, 'Essa mesa não existe mais.');
  assert.equal((await chamar('POST', '/jogos/mesa', { sessao: tava.token, servidor: outro.id, corpo: { id, acao: 'fechar' } })).status, 404);
  assert.deepEqual((await chamar('GET', '/rooms', { sessao: tava.token, servidor: outro.id })).corpo.jogos.mesas, []);

  // Com a partida andando não se fecha; depois de desistir, sim.
  assert.equal((await naMesa(tkp.token, { id, acao: 'fechar' })).status, 409);
  assert.equal((await naMesa(juninho.token, { id, acao: 'desistir' })).corpo.mesa.fim.vencedor, tkp.eu.id);
  assert.deepEqual((await naMesa(juninho.token, { id, acao: 'fechar' })).corpo, { ok: true });
});

test('xadrez: só se chama quem é do servidor e não foi banido, e sem sessão nada', async () => {
  const dono = await sessaoDe('abner');
  const quem = (await cadastrar('xadrez_quem')).corpo;
  const banido = (await cadastrar('xadrez_banido')).corpo;
  const deFora = (await criarConta('xadrez_defora')).corpo;
  const casa = quem.servidor.id;
  await chamar('POST', '/moderar', { sessao: dono.token, servidor: casa, corpo: { acao: 'banir', alvo: banido.eu.id } });

  const aberta = await chamar('POST', '/jogos/abrir', { sessao: quem.token, servidor: casa, corpo: {} });
  assert.equal(aberta.status, 200, JSON.stringify(aberta.corpo));
  const { id } = aberta.corpo.mesa;
  for (const alvo of [deFora.eu.id, banido.eu.id]) {
    const r = await chamar('POST', '/jogos/mesa', { sessao: quem.token, servidor: casa, corpo: { id, acao: 'chamar', alvo } });
    assert.equal(r.status, 404, `chamou ${alvo}: ${JSON.stringify(r.corpo)}`);
  }
  assert.equal((await chamar('POST', '/jogos/abrir', { sessao: quem.token, servidor: casa, corpo: {} })).status, 409,
    'abriu uma segunda mesa com a primeira esperando');

  for (const [metodo, rota] of [['POST', '/jogos/abrir'], ['GET', `/jogos/mesa?id=${id}`], ['POST', '/jogos/mesa']]) {
    const r = await chamar(metodo, rota, metodo === 'GET' ? {} : { corpo: { id, acao: 'fechar' } });
    assert.equal(r.status, 401, `${metodo} ${rota} respondeu ${r.status} sem sessão`);
  }
});

// --- administração da Saga ------------------------------------------------------

test('a administração não abre sem sessão', async () => {
  assert.equal((await chamar('GET', '/saga/servidores')).status, 401);
  assert.equal((await chamar('GET', '/saga/servidor?id=1')).status, 401);
});

test('quem não é dono da Saga recebe 403 nas duas rotas, mesmo sem servidor nenhum', async () => {
  // As rotas não passam por `exigirMembro`: o dono da Saga pode não estar em servidor
  // algum. Por isso quem não é dono e também não está em lugar nenhum tem de ouvir
  // "isto é do dono", e não "você não faz parte de nenhum servidor".
  await criarConta('nina_adm');
  const nina = await sessaoDe('nina_adm');
  for (const rota of ['/saga/servidores', '/saga/servidor?id=1']) {
    const r = await chamar('GET', rota, { sessao: nina.token });
    assert.equal(r.status, 403, rota);
    assert.match(r.corpo.error, /dono da Saga/);
  }
});

test('o dono da Saga vê na lista um servidor de que não faz parte', async () => {
  await criarConta('otavio_adm');
  const otavio = await sessaoDe('otavio_adm');
  const criado = await chamar('POST', '/servidores/criar', { sessao: otavio.token, corpo: { nome: 'Toca do Otávio' } });
  assert.equal(criado.status, 200, JSON.stringify(criado.corpo));

  // Mandar num servidor não é mandar na Saga.
  assert.equal((await chamar('GET', '/saga/servidores', { sessao: otavio.token })).status, 403);

  const dono = await sessaoDe('abner');
  const r = await chamar('GET', '/saga/servidores', { sessao: dono.token });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const toca = r.corpo.servidores.find((s) => s.id === criado.corpo.servidor.id);
  assert.ok(toca, 'o servidor alheio não apareceu na lista');
  assert.equal(toca.souMembro, false);
  assert.equal(toca.criador.apelido, 'otavio_adm');
  assert.equal(toca.pessoas, 1);
  assert.ok(r.corpo.servidores.some((s) => s.souMembro), 'o de casa, que é dele, devia vir como dele');
});

test('o detalhe traz as pessoas como o /servidor as mostra, as salas, e nada da conversa', async () => {
  const dono = await sessaoDe('abner');
  const otavio = await sessaoDe('otavio_adm');
  const toca = (await chamar('GET', '/servidores', { sessao: otavio.token })).corpo.servidores
    .find((s) => s.nome === 'Toca do Otávio');
  const avisos = (await chamar('GET', '/rooms', { sessao: otavio.token, servidor: toca.id })).corpo.rooms
    .find((s) => s.name === 'Avisos');
  const envio = await chamar('POST', '/mensagens', {
    sessao: otavio.token, servidor: toca.id, corpo: { sala: avisos.id, texto: 'o que se fala na toca fica na toca' },
  });
  assert.equal(envio.status, 200, JSON.stringify(envio.corpo));
  const convite = await chamar('POST', '/servidores/convite', { sessao: otavio.token, servidor: toca.id, corpo: {} });
  assert.equal(convite.status, 200, JSON.stringify(convite.corpo));

  const r = await chamar('GET', `/saga/servidor?id=${toca.id}`, { sessao: dono.token });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const { servidor } = r.corpo;

  // O MESMO verMembro de GET /servidor: a pessoa não pode ter um formato em cada rota.
  const comoOServidorMostra = (await chamar('GET', '/servidor', { sessao: otavio.token, servidor: toca.id })).corpo.membros;
  assert.deepEqual(servidor.membros, comoOServidorMostra);

  assert.deepEqual(servidor.salas.map((s) => `${s.nome}:${s.tipo}`), ['Geral:voz', 'Avisos:texto']);
  assert.ok(servidor.salas.every((s) => Array.isArray(s.naCall)), 'toda sala leva quem está na call');
  assert.equal(servidor.salas.find((s) => s.id === avisos.id).mensagens.total, 1);
  assert.equal(servidor.convitesAtivos, 1);
  assert.equal(servidor.souMembro, false);

  const tudo = JSON.stringify(r.corpo);
  assert.ok(!tudo.includes('fica na toca'), 'o texto da mensagem vazou');
  assert.ok(!tudo.includes(convite.corpo.convite.codigo), 'o código do convite vazou');
});

test('servidor que não existe, ou número que nem é número, dá 404', async () => {
  const dono = await sessaoDe('abner');
  for (const rota of ['/saga/servidor?id=abc', '/saga/servidor?id=999999', '/saga/servidor']) {
    const r = await chamar('GET', rota, { sessao: dono.token });
    assert.equal(r.status, 404, rota);
    assert.match(r.corpo.error, /não existe/);
  }
});

// --- recuperar e trocar a senha -------------------------------------------------
//
// Só com contas destes testes: `sessaoDe` guarda a sessão por apelido, e trocar a senha de
// alguém que outro teste usa (abner, bruno…) mataria o crachá guardado dele, com o erro
// aparecendo num teste que não tem nada a ver com senha.

const RECUSA_DO_CODIGO = 'Código inválido ou vencido. Peça outro.';

const recuperarPorHttp = (apelido, codigo, senha = 'novasenha789') =>
  chamar('POST', '/recuperar', { corpo: { apelido, codigo, senha, senhaRepetida: senha } });

/** O código que o dono da Saga gera para a conta — com a senha dele, que a rota pede. */
async function codigoPara(conta) {
  const dono = await sessaoDe('abner');
  const r = await chamar('POST', '/saga/recuperacao', { sessao: dono.token, corpo: { alvo: conta.eu.id, senha: 'segredo123' } });
  assert.equal(r.status, 200, `não saiu código: ${JSON.stringify(r.corpo)}`);
  return r;
}

/**
 * Espera o servidor anotar um trecho no registro. O console do processo filho chega por um
 * cano, e pode chegar depois da resposta HTTP que o provocou.
 */
async function noRegistro(trecho) {
  for (let i = 0; i < 60 && !registro.includes(trecho); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(registro.includes(trecho), `o registro não anotou: ${trecho}`);
}

/** Um corpo com um array de milhares de níveis, montado à mão: `JSON.stringify` nem chegaria nele. */
const comFundo = (campo, resto) => {
  const fundo = '['.repeat(20_000) + ']'.repeat(20_000);
  return `{${Object.entries(resto).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)},`).join('')}"${campo}":${fundo}}`;
};
const cru = (rota, corpo, sessao) => fetch(`${base}${rota}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(sessao ? { 'x-sessao': sessao } : {}) }, body: corpo,
});

function semSegredo(respostas) {
  const tudo = JSON.stringify(respostas.map((r) => r.corpo));
  for (const segredo of ['senha_hash', 'codigo_hash', 'scrypt$']) {
    assert.ok(!tudo.includes(segredo), `vazou na resposta: ${segredo}`);
  }
}

test('quem não é dono da Saga não gera código de senha, nem para a própria conta', async () => {
  const ele = (await criarConta('esqueceu1')).corpo;
  const r = await chamar('POST', '/saga/recuperacao', { sessao: ele.token, corpo: { alvo: ele.eu.id } });
  assert.equal(r.status, 403);
  assert.match(r.corpo.error, /dono da Saga/);
  assert.equal(r.corpo.codigo, undefined);
  assert.equal((await chamar('POST', '/saga/recuperacao', { corpo: { alvo: ele.eu.id } })).status, 401);

  const dono = await sessaoDe('abner');
  const ninguem = await chamar('POST', '/saga/recuperacao', { sessao: dono.token, corpo: { alvo: 999999, senha: 'segredo123' } });
  assert.equal(ninguem.status, 404);
});

test('gerar código pede a senha do dono, e não serve para a conta dele: 403, nunca 401', async () => {
  // Só o crachá do dono — uma Saga dele aberta sem ninguém por perto — não pode valer a conta
  // de todo mundo. E 401 o app lê como "a sessão caiu": errar a senha deslogaria o dono.
  const alvo = (await criarConta('esqueceu4')).corpo;
  const dono = await sessaoDe('abner');
  const pedir = (corpo) => chamar('POST', '/saga/recuperacao', { sessao: dono.token, corpo });

  for (const corpo of [{ alvo: alvo.eu.id }, { alvo: alvo.eu.id, senha: 'naoeessa' }, { alvo: alvo.eu.id, senha: 12345678 }]) {
    const r = await pedir(corpo);
    assert.equal(r.status, 403, JSON.stringify(corpo));
    assert.equal(r.corpo.error, 'A sua senha não confere.');
    assert.equal(r.corpo.codigo, undefined);
  }
  const propria = await pedir({ alvo: dono.eu.id, senha: 'segredo123' });
  assert.equal(propria.status, 403);
  assert.match(propria.corpo.error, /Sua conta/);
  assert.equal(propria.corpo.codigo, undefined);

  assert.equal((await chamar('GET', '/eu', { sessao: dono.token })).status, 200, 'errar a senha derrubou a sessão do dono');
  const contas = await chamar('GET', '/saga/contas', { sessao: dono.token });
  assert.equal(contas.corpo.contas.find((c) => c.id === alvo.eu.id).recuperacaoAte, null, 'saiu código sem a senha');
  assert.equal(contas.corpo.contas.find((c) => c.id === dono.eu.id).recuperacaoAte, null, 'saiu código para o próprio dono');
});

test('o registro anota código emitido, código queimado e senha trocada — nunca o código nem a senha', async () => {
  const alvo = (await criarConta('registro1')).corpo;
  const queimado = (await codigoPara(alvo)).corpo.codigo;
  await noRegistro('recuperação: código emitido para registro1 por abner');

  // Cinco chutes sem sessão queimam o código; quem pede não vê diferença, o registro vê.
  const errado = queimado === 'AAAA-AAAA' ? 'BBBB-BBBB' : 'AAAA-AAAA';
  for (let i = 0; i < 5; i++) assert.equal((await recuperarPorHttp('registro1', errado)).status, 400);
  await noRegistro('recuperação: o código de registro1 morreu depois de 5 erros');

  const { codigo } = (await codigoPara(alvo)).corpo;
  const r = await recuperarPorHttp('registro1', codigo, 'senhaDoRegistro42');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  await noRegistro('recuperação: registro1 trocou a senha com o código do dono');

  for (const segredo of [queimado, codigo, codigo.replace('-', ''), errado, 'senhaDoRegistro42', 'segredo123']) {
    assert.ok(!registro.includes(segredo), `o registro escreveu um segredo: ${segredo}`);
  }
});

test('o código do dono troca a senha e já entra, com a mesma resposta do /entrar', async () => {
  const antes = (await cadastrar('esqueceu2')).corpo;   // a sessão que a pessoa já tinha
  const emitido = await codigoPara(antes);
  assert.match(emitido.corpo.codigo, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(emitido.corpo.conta.apelido, 'esqueceu2');
  assert.equal(emitido.corpo.conta.recuperacaoAte, emitido.corpo.expiraEm);

  // O painel diz até quando vale, e só isso.
  const dono = await sessaoDe('abner');
  const lista = await chamar('GET', '/saga/contas', { sessao: dono.token });
  assert.equal(lista.corpo.contas.find((c) => c.id === antes.eu.id).recuperacaoAte, emitido.corpo.expiraEm);
  assert.equal(lista.corpo.contas.find((c) => c.apelido === 'abner').recuperacaoAte, null);
  assert.ok(!JSON.stringify(lista.corpo).includes(emitido.corpo.codigo.replace('-', '')), 'o código voltou na lista');

  const r = await recuperarPorHttp('esqueceu2', emitido.corpo.codigo);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(r.corpo.token);
  assert.equal(r.corpo.eu.apelido, 'esqueceu2');

  assert.equal((await chamar('GET', '/eu', { sessao: antes.token })).status, 401, 'a sessão de antes continuou valendo');
  assert.equal((await chamar('GET', '/eu', { sessao: r.corpo.token })).status, 200);
  const velha = await chamar('POST', '/entrar', { corpo: { apelido: 'esqueceu2', senha: 'segredo123' } });
  assert.equal(velha.status, 401);
  const nova = await chamar('POST', '/entrar', { corpo: { apelido: 'esqueceu2', senha: 'novasenha789' } });
  assert.equal(nova.status, 200);

  // Tirando o token, a mesma coisa que o /entrar: as duas portas dão na mesma tela.
  const { token: _pelaRecuperacao, ...recuperou } = r.corpo;
  const { token: _pelaSenha, ...entrou } = nova.corpo;
  assert.deepEqual(recuperou, entrou);

  // Uso único, e a lista para de mostrar o código.
  assert.equal((await recuperarPorHttp('esqueceu2', emitido.corpo.codigo, 'outrasenha000')).status, 400);
  const depois = await chamar('GET', '/saga/contas', { sessao: dono.token });
  assert.equal(depois.corpo.contas.find((c) => c.id === antes.eu.id).recuperacaoAte, null);

  semSegredo([emitido, lista, r, velha, nova, depois]);
});

test('código errado é 400 com a mesma recusa de apelido inexistente, e /recuperar nunca responde 401', async () => {
  // 401, no app, é "a sessão caiu": errar um código na tela de entrar não pode soar assim.
  const alvo = (await criarConta('esqueceu3')).corpo;
  await criarConta('semcodigo1');
  const { corpo: { codigo } } = await codigoPara(alvo);
  const errado = codigo === 'AAAA-AAAA' ? 'BBBB-BBBB' : 'AAAA-AAAA';

  const recusas = [
    await recuperarPorHttp('esqueceu3', errado),
    await recuperarPorHttp('ninguem_aqui', codigo),
    await recuperarPorHttp('semcodigo1', codigo),
  ];
  for (const r of recusas) {
    assert.equal(r.status, 400);
    assert.equal(r.corpo.error, RECUSA_DO_CODIGO);
  }

  // Nem com lixo no corpo, nem com um crachá velho no cabeçalho.
  for (const corpo of [
    {},
    { apelido: 'esqueceu3' },
    { apelido: 5, codigo: {}, senha: 12345678, senhaRepetida: 12345678 },
    { apelido: 'esqueceu3', codigo, senha: 'curta', senhaRepetida: 'curta' },
  ]) {
    const r = await chamar('POST', '/recuperar', { corpo, sessao: 'cracha-que-nao-vale' });
    assert.equal(r.status, 400, JSON.stringify(corpo));
  }
  const malformado = await fetch(`${base}/recuperar`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"codigo": K7QM',
  });
  assert.equal(malformado.status, 400, 'corpo que não é JSON virou erro do servidor');

  // Array de milhares de níveis: passa pelo JSON.parse e estourava a pilha ao virar texto —
  // um 500, com a pilha inteira no registro, a cada pedido de 40 KB.
  const senhas = { senha: 'novasenha789', senhaRepetida: 'novasenha789' };
  for (const corpo of [comFundo('apelido', { codigo, ...senhas }), comFundo('codigo', { apelido: 'esqueceu3', ...senhas })]) {
    const r = await cru('/recuperar', corpo);
    assert.equal(r.status, 400, 'array aninhado virou erro do servidor');
    assert.equal((await r.json()).error, RECUSA_DO_CODIGO);
  }
  assert.equal((await cru('/entrar', comFundo('apelido', { senha: 'segredo123' }))).status, 401);
  assert.equal((await cru('/entrar', comFundo('senha', { apelido: 'esqueceu3' }))).status, 401);
  assert.equal((await cru('/cadastrar', comFundo('apelido', senhas))).status, 400);

  // Um erro não mata o código, e errar a senha nova não gastou tentativa: o certo ainda entra.
  const certo = await recuperarPorHttp('esqueceu3', codigo);
  assert.equal(certo.status, 200, JSON.stringify(certo.corpo));
  semSegredo([...recusas, certo]);
});

test('corpo que é JSON mas não é objeto é 400 nas portas da conta e nas rotas com sessão, e não 500', async () => {
  // `null`, `5`, `"texto"` e `[]` passam pelo JSON.parse. O `/entrar` desestruturava direto,
  // e as rotas com sessão também: um 500 com "Cannot destructure" e a pilha no registro.
  // /mensagens e /digitando leem o corpo antes da sessão, então ali nem crachá era preciso.
  const dono = await sessaoDe('abner');
  const semSessao = ['/entrar', '/cadastrar', '/recuperar', '/mensagens', '/digitando'];
  const comSessao = ['/eu/senha', '/saga/recuperacao', '/amigos/pedir', '/conversas/abrir', '/mensagens/apagar', '/servidores/entrar'];
  for (const corpo of ['null', '5', '"texto"', '[]']) {
    for (const rota of semSessao) {
      const r = await cru(rota, corpo);
      assert.equal(r.status, 400, `${rota} com ${corpo} sem sessão`);
      assert.equal((await r.json()).error, 'O pedido veio malformado.');
    }
    for (const rota of comSessao) {
      const r = await cru(rota, corpo, dono.token);
      assert.equal(r.status, 400, `${rota} com ${corpo} e sessão`);
    }
  }
  assert.ok(!registro.includes('Cannot destructure'), 'um corpo que não é objeto chegou a uma rota');
  // O objeto vazio continua sendo pedido, e quem responde é a regra de cada rota.
  assert.equal((await cru('/entrar', '{}')).status, 401);
  assert.equal((await cru('/entrar', '')).status, 401);
  assert.equal((await chamar('GET', '/eu', { sessao: dono.token })).status, 200);
});

test('/eu/senha pede a senha atual: errada é 403 sem derrubar ninguém, certa derruba só as outras sessões', async () => {
  const minha = (await criarConta('trocasenha1')).corpo;
  const outra = (await chamar('POST', '/entrar', { corpo: { apelido: 'trocasenha1', senha: 'segredo123' } })).corpo;
  const nova = { senha: 'novasenha789', senhaRepetida: 'novasenha789' };
  const trocar = (sessao, corpo) => chamar('POST', '/eu/senha', { sessao, corpo });
  const eu = (sessao) => chamar('GET', '/eu', { sessao });

  assert.equal((await trocar(undefined, { senhaAtual: 'segredo123', ...nova })).status, 401);

  const errada = await trocar(minha.token, { senhaAtual: 'naoeessa', ...nova });
  assert.equal(errada.status, 403, 'senha atual errada não pode ser 401: o app deslogaria');
  assert.equal(errada.corpo.error, 'A senha atual não confere.');
  assert.equal((await eu(minha.token)).status, 200);
  assert.equal((await eu(outra.token)).status, 200);

  const curta = await trocar(minha.token, { senhaAtual: 'segredo123', senha: 'curta', senhaRepetida: 'curta' });
  assert.equal(curta.status, 400);
  const aninhada = await cru('/eu/senha', comFundo('senhaAtual', nova), minha.token);
  assert.equal(aninhada.status, 403, 'array aninhado na senha atual virou erro do servidor');

  const certa = await trocar(minha.token, { senhaAtual: 'segredo123', ...nova });
  assert.equal(certa.status, 200, JSON.stringify(certa.corpo));
  assert.deepEqual(certa.corpo, { ok: true, encerradas: 1 });
  assert.equal((await eu(outra.token)).status, 401, 'a sessão de outro lugar continuou');
  assert.equal((await eu(minha.token)).status, 200, 'a sessão de quem trocou caiu');
  assert.equal((await chamar('POST', '/entrar', { corpo: { apelido: 'trocasenha1', senha: 'segredo123' } })).status, 401);
  const entrou = await chamar('POST', '/entrar', { corpo: { apelido: 'trocasenha1', senha: 'novasenha789' } });
  assert.equal(entrou.status, 200);
  semSegredo([errada, curta, certa, entrou]);
});

// --- Fórmula 1 ------------------------------------------------------------------

test('fórmula 1 pela rede: abrir, chamar, o convite no /rooms, sentar, largar, o passe só de dados e o número noutro servidor', async () => {
  const tkp = (await cadastrar('f1_tkp')).corpo;
  const juninho = (await cadastrar('f1_juninho')).corpo;
  const tava = (await cadastrar('f1_tava')).corpo;
  const casa = tkp.servidor.id;
  const noGrid = (sessao, corpo) => chamar('POST', '/corridas/grid', { sessao, servidor: casa, corpo });

  const aberto = await chamar('POST', '/corridas/abrir', { sessao: tkp.token, servidor: casa, corpo: { voltas: 3 } });
  assert.equal(aberto.status, 200, JSON.stringify(aberto.corpo));
  const { id } = aberto.corpo.grid;
  assert.equal(aberto.corpo.grid.assentos.length, 8);

  assert.equal((await noGrid(tkp.token, { id, acao: 'chamar', alvo: juninho.eu.id })).status, 200);
  const doConvidado = (await chamar('GET', '/rooms', { sessao: juninho.token, servidor: casa })).corpo.corridas;
  assert.deepEqual(doConvidado.convites.map((c) => [c.grid, c.de.id, c.voltas]), [[id, tkp.eu.id, 3]]);

  assert.equal((await noGrid(tkp.token, { id, acao: 'sentar', carro: 'VER', protocolo: 2 })).status, 200);
  const sentou = await noGrid(juninho.token, { id, acao: 'sentar', carro: 'LEC', protocolo: 2 });
  assert.equal(sentou.corpo.grid.meuCarro, 'LEC');
  assert.equal((await noGrid(tava.token, { id, acao: 'sentar', carro: 'VER', protocolo: 2 })).status, 409);

  const largou = await noGrid(tkp.token, { id, acao: 'largar' });
  assert.equal(largou.status, 200, JSON.stringify(largou.corpo));
  assert.equal(largou.corpo.grid.estado, 'correndo');

  // O passe da corrida: sala própria, sem publicar áudio nem vídeo; dados só de quem pilota.
  const grantDe = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).video;
  const doPiloto = await chamar('POST', '/corridas/token', { sessao: juninho.token, servidor: casa, corpo: { id } });
  assert.equal(doPiloto.status, 200, JSON.stringify(doPiloto.corpo));
  const g = grantDe(doPiloto.corpo.token);
  assert.match(g.room, /^corrida-[0-9a-f]+-1$/);
  assert.equal(g.canPublish, false);
  assert.equal(g.canPublishData, true);
  const daPlateia = await chamar('POST', '/corridas/token', { sessao: tava.token, servidor: casa, corpo: { id } });
  assert.equal(grantDe(daPlateia.corpo.token).room, g.room);
  assert.equal(grantDe(daPlateia.corpo.token).canPublishData, false);

  const outro = (await chamar('POST', '/servidores/criar', { sessao: tava.token, corpo: { nome: 'Autódromo' } })).corpo.servidor;
  assert.equal((await chamar('GET', `/corridas/grid?id=${id}`, { sessao: tava.token, servidor: outro.id })).status, 404);
  assert.equal((await chamar('POST', '/corridas/token', { sessao: tava.token, servidor: outro.id, corpo: { id } })).status, 404);

  assert.equal((await noGrid(tkp.token, { id, acao: 'fechar' })).status, 409);
  await noGrid(tkp.token, { id, acao: 'abandonar' });
  const fim = await noGrid(juninho.token, { id, acao: 'abandonar' });
  assert.equal(fim.corpo.grid.estado, 'fim');
  assert.deepEqual((await noGrid(tkp.token, { id, acao: 'fechar' })).corpo, { ok: true });
});

// --- Dragão Quadrado ------------------------------------------------------------

test('dragão quadrado pela rede: abrir, chamar, o convite no /rooms, sentar, começar, o passe só de dados e o número noutro servidor', async () => {
  const tkp = (await cadastrar('dq_tkp')).corpo;
  const juninho = (await cadastrar('dq_juninho')).corpo;
  const tava = (await cadastrar('dq_tava')).corpo;
  const casa = tkp.servidor.id;
  const naArena = (sessao, corpo) => chamar('POST', '/lutas/arena', { sessao, servidor: casa, corpo });

  // App velho não abre: abrir já é sentar.
  assert.equal((await chamar('POST', '/lutas/abrir', { sessao: tkp.token, servidor: casa, corpo: {} })).status, 409);
  const aberta = await chamar('POST', '/lutas/abrir', { sessao: tkp.token, servidor: casa, corpo: { cenario: 'ilha', rounds: 1, protocolo: 7 } });
  assert.equal(aberta.status, 200, JSON.stringify(aberta.corpo));
  const { id } = aberta.corpo.arena;
  assert.equal(aberta.corpo.arena.meuLado, 0);

  assert.equal((await naArena(tkp.token, { id, acao: 'chamar', alvo: juninho.eu.id })).status, 200);
  const doConvidado = (await chamar('GET', '/rooms', { sessao: juninho.token, servidor: casa })).corpo.lutas;
  assert.deepEqual(doConvidado.convites.map((c) => [c.arena, c.de.id, c.cenario]), [[id, tkp.eu.id, 'ilha']]);
  assert.deepEqual(doConvidado.arenas.map((a) => a.id), [id]);

  const sentou = await naArena(juninho.token, { id, acao: 'escolher', lutador: 'geladeira', protocolo: 7 });
  assert.equal(sentou.corpo.arena.meuLado, 1);
  assert.equal((await naArena(tava.token, { id, acao: 'escolher', lutador: 'vegetal', protocolo: 7 })).status, 409);

  const comecou = await naArena(tkp.token, { id, acao: 'comecar' });
  assert.equal(comecou.status, 200, JSON.stringify(comecou.corpo));
  assert.equal(comecou.corpo.arena.estado, 'lutando');

  // O passe da luta: sala própria, sem áudio nem vídeo; dados só de quem está de um lado.
  const grantDe = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url')).video;
  const doLutador = await chamar('POST', '/lutas/token', { sessao: juninho.token, servidor: casa, corpo: { id } });
  assert.equal(doLutador.status, 200, JSON.stringify(doLutador.corpo));
  const g = grantDe(doLutador.corpo.token);
  assert.match(g.room, /^luta-[0-9a-f]+-1$/);
  assert.equal(g.canPublish, false);
  assert.equal(g.canPublishData, true);
  const daPlateia = await chamar('POST', '/lutas/token', { sessao: tava.token, servidor: casa, corpo: { id } });
  assert.equal(grantDe(daPlateia.corpo.token).room, g.room);
  assert.equal(grantDe(daPlateia.corpo.token).canPublishData, false);
  const vista = await chamar('GET', `/lutas/arena?id=${id}`, { sessao: tava.token, servidor: casa });
  assert.deepEqual(vista.corpo.arena.plateia.map((p) => p.id), [tava.eu.id]);

  const outro = (await chamar('POST', '/servidores/criar', { sessao: tava.token, corpo: { nome: 'Torneio' } })).corpo.servidor;
  assert.equal((await chamar('GET', `/lutas/arena?id=${id}`, { sessao: tava.token, servidor: outro.id })).status, 404);
  assert.equal((await chamar('POST', '/lutas/token', { sessao: tava.token, servidor: outro.id, corpo: { id } })).status, 404);

  assert.equal((await naArena(tkp.token, { id, acao: 'fechar' })).status, 409);
  const fim = await naArena(tkp.token, { id, acao: 'abandonar' });
  assert.deepEqual([fim.corpo.arena.estado, fim.corpo.arena.vencedor], ['fim', 1]);
  assert.deepEqual((await naArena(tkp.token, { id, acao: 'fechar' })).corpo, { ok: true });
});

test('dragão quadrado: a Saga antiga não recebe lutador que não conhece, pela versão no User-Agent', async () => {
  const tkp = (await cadastrar('dqv_tkp')).corpo;
  const juninho = (await cadastrar('dqv_juninho')).corpo;
  const casa = tkp.servidor.id;
  // O User-Agent de verdade do Electron: o `%s/%s Chrome/%s Electron/…` com o nome e a versão do app.
  const saga = (v) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Saga/${v} Chrome/142.0.7444.265 Electron/39.8.10 Safari/537.36`;
  const { id } = (await chamar('POST', '/lutas/abrir', { sessao: tkp.token, servidor: casa, corpo: { protocolo: 7 }, agente: saga('0.57.0') })).corpo.arena;
  await chamar('POST', '/lutas/arena', { sessao: tkp.token, servidor: casa, corpo: { id, acao: 'escolher', lutador: 'goteira', protocolo: 7 } });
  assert.equal((await chamar('POST', '/lutas/arena', { sessao: tkp.token, servidor: casa, corpo: { id, acao: 'chamar', alvo: juninho.eu.id } })).status, 200);

  const convite = async (agente) => (await chamar('GET', '/rooms', { sessao: juninho.token, servidor: casa, agente })).corpo.lutas.convites[0];
  assert.equal((await convite(saga('0.56.2'))).oponente, null);
  assert.equal((await convite(saga('0.57.0'))).oponente.lutador, 'goteira');
  const vista = await chamar('GET', `/lutas/arena?id=${id}`, { sessao: juninho.token, servidor: casa, agente: saga('0.56.2') });
  assert.equal(vista.status, 409);
  assert.match(vista.corpo.error, /atualize/);
  assert.equal((await chamar('GET', `/lutas/arena?id=${id}`, { sessao: juninho.token, servidor: casa, agente: saga('0.57.0') })).corpo.arena.lados[0].lutador, 'goteira');
  await chamar('POST', '/lutas/arena', { sessao: tkp.token, servidor: casa, corpo: { id, acao: 'fechar' } });
});

// --- relatos -----------------------------------------------------------------------

test('relatar pela rede: com conta, sem conta, e o que se guarda', async () => {
  const quem = (await cadastrar('relato_quem')).corpo;
  const comConta = await chamar('POST', '/relatos', {
    sessao: quem.token, corpo: { tipo: 'melhoria', texto: 'um botão de pular a intro', contexto: { versao: '0.50.0', tela: 'Fórmula 1' } },
  });
  assert.equal(comConta.status, 200, JSON.stringify(comConta.corpo));
  assert.ok(comConta.corpo.relato.id > 0);

  // O erro que impede de entrar também chega: sem sessão nenhuma.
  const semConta = await chamar('POST', '/relatos', { corpo: { tipo: 'erro', texto: 'a tela de login não sai do lugar' } });
  assert.equal(semConta.status, 200, JSON.stringify(semConta.corpo));

  const invalido = await chamar('POST', '/relatos', { sessao: quem.token, corpo: { tipo: 'erro', texto: '' } });
  assert.equal(invalido.status, 400);
});

// --- e-mail, com o envio desligado ----------------------------------------------------
//
// É a produção enquanto não houver um domínio verificado no Resend: sem `RESEND_KEY` e
// `EMAIL_DE`, a Saga não pede e-mail a ninguém. O caminho com o envio ligado mora em
// api-email.test.mjs, com outro servidor.

test('sem envio de e-mail, nada muda: cadastro sem e-mail entra e ninguém é mandado confirmar', async () => {
  assert.deepEqual((await chamar('GET', '/health')).corpo, { ok: true, email: false });

  const r = await cadastrar('sem_envio');
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.precisaDeEmail, false);
  assert.equal(r.corpo.email, null);
  assert.equal((await chamar('GET', '/eu', { sessao: r.corpo.token })).corpo.precisaDeEmail, false);

  const entrou = await chamar('POST', '/entrar', { corpo: { apelido: 'sem_envio', senha: 'segredo123' } });
  assert.equal(entrou.corpo.precisaDeEmail, false);
});

test('sem envio de e-mail, pedir código diz por quê — e nunca é 401', async () => {
  const esqueci = await chamar('POST', '/esqueci', { corpo: { conta: 'abner' } });
  assert.equal(esqueci.status, 503);
  assert.match(esqueci.corpo.error, /dono da Saga/, 'a saída que continua existindo é o código do dono');

  const quem = (await cadastrar('sem_envio2')).corpo;
  const pedir = await chamar('POST', '/eu/email', { sessao: quem.token, corpo: { email: 'x@gmail.com' } });
  assert.equal(pedir.status, 503);
  assert.equal((await chamar('GET', '/eu', { sessao: quem.token })).corpo.emailPendente, null);
});
