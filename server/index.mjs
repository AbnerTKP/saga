// Servidor do Cantinho: contas, cargos e emissão de tokens do LiveKit.
//
// A autenticação é por sessão, não mais pela senha do grupo em cada pedido: a senha do
// grupo virou só o convite, exigida uma vez, no cadastro. Sem isso não haveria como saber
// *quem* está pedindo, e sem saber quem, não há cargo, banimento nem moderação.
import http from 'node:http';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { salvarImagem, salvarSom, nomeValido, ErroDeArquivo, LIMITES } from './arquivos.mjs';
import * as sons from './sons.mjs';
import { verParticipante } from './participantes.mjs';
import { ErroDeConta, criarConta, entrar, usuarioDaSessao, sair } from './contas.mjs';
import { CARGO, NOME_DO_CARGO } from './cargos.mjs';
import * as membros from './membros.mjs';

const PORT = Number(process.env.PORT ?? 3001);
const SENHA_DO_GRUPO = process.env.APP_PASSWORD ?? '';
const SALAS_INICIAIS = (process.env.ROOMS ?? 'Geral').split(',').map((s) => s.trim()).filter(Boolean);
const NOME_DO_SERVIDOR = process.env.SERVER_NAME ?? 'Cantinho do Vorcaro';
const DONO = process.env.DONO ?? '';            // apelido que vira dono; vazio = o primeiro a entrar
const BANCO = process.env.BANCO ?? './dados/cantinho.db';
const ARQUIVOS = process.env.ARQUIVOS ?? './dados/arquivos';
const KEY = process.env.LIVEKIT_API_KEY;
const SECRET = process.env.LIVEKIT_API_SECRET;
const HOST = process.env.LIVEKIT_HOST ?? 'http://localhost:7880';
const PUBLIC_URL = process.env.LIVEKIT_PUBLIC_URL ?? 'ws://localhost:7880';

if (!KEY || !SECRET || !SENHA_DO_GRUPO) {
  console.error('Defina LIVEKIT_API_KEY, LIVEKIT_API_SECRET e APP_PASSWORD');
  process.exit(1);
}

const svc = new RoomServiceClient(HOST, KEY, SECRET);
const db = abrirBanco(BANCO);
const SERVIDOR = garantirServidor(db, { nome: NOME_DO_SERVIDOR, salas: SALAS_INICIAIS });

// A identidade no LiveKit é o id da conta, não o nome: é estável, e é por ela que a
// moderação encontra a pessoa dentro da sala.
const identidadeDe = (usuarioId) => `u${usuarioId}`;
const idDaIdentidade = (identity) => Number(String(identity).replace(/^u/, '')) || null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-sessao',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS });
  res.end(JSON.stringify(body));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = '';
    req.on('data', (c) => { dados += c; if (dados.length > 100_000) req.destroy(); });
    req.on('end', () => { try { resolve(dados ? JSON.parse(dados) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/** Corpo cru, para upload de imagem. Corta na hora se passar do teto, sem juntar tudo antes. */
function lerBinario(req, limite) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limite) { req.destroy(); reject(new ErroDeArquivo('A imagem é grande demais.', 413)); return; }
      pedacos.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(pedacos)));
    req.on('error', reject);
  });
}

// Freio contra chute de senha: 20 tentativas por IP a cada 10 minutos.
const tentativas = new Map();
function demais(ip) {
  const agora = Date.now();
  const recentes = (tentativas.get(ip) ?? []).filter((t) => agora - t < 10 * 60_000);
  recentes.push(agora);
  tentativas.set(ip, recentes);
  return recentes.length > 20;
}

/** Como o app enxerga uma pessoa: sem hash de senha, sem nada interno. */
const verMembro = (m) => m && ({
  id: m.id,
  apelido: m.apelido,
  nome: m.nome,
  cargo: m.cargo,
  cargoNome: NOME_DO_CARGO[m.cargo] ?? 'Membro',
  foto: m.foto ?? null,
  banner: m.banner ?? null,
  banido: !!m.banido_em,
  banidoPor: m.banido_por ?? null,
  castigoAte: m.silenciado_ate ?? null,
});

const verServidor = () => {
  const s = db.prepare('SELECT * FROM servidores WHERE id = ?').get(SERVIDOR.id);
  return { id: s.id, nome: s.nome, foto: s.foto ?? null, banner: s.banner ?? null };
};

const salasDoServidor = () =>
  db.prepare('SELECT nome FROM salas WHERE servidor_id = ? ORDER BY ordem, id').all(SERVIDOR.id).map((r) => r.nome);

/** Entra na conta e já a vincula ao servidor, devolvendo o que o app precisa para desenhar tudo. */
function sessaoCompleta(usuario, token) {
  const membro = membros.garantirMembro(db, SERVIDOR.id, usuario, { dono: DONO });
  return { token, eu: verMembro(membro), servidor: verServidor(), salas: salasDoServidor() };
}

function exigirSessao(req) {
  const membro = quemE(req);
  if (!membro) throw new ErroDeConta('Faça login novamente.', 401);
  return membro;
}

function quemE(req) {
  const usuario = usuarioDaSessao(db, req.headers['x-sessao']);
  if (!usuario) return null;
  return membros.buscarMembro(db, SERVIDOR.id, usuario.id);
}

async function participantesDaSala(nome) {
  const vivas = await svc.listRooms().catch(() => []);
  const r = vivas.find((x) => x.name === nome);
  if (!r || r.numParticipants === 0) return [];
  const ps = await svc.listParticipants(nome).catch(() => []);
  return ps.map((p) => {
    const base = verParticipante(p);
    const membro = membros.buscarMembro(db, SERVIDOR.id, idDaIdentidade(p.identity));
    // Cargo e foto vêm do banco; microfone e tela, do LiveKit.
    return { ...base, ...(membro ? { usuarioId: membro.id, name: membro.nome, cargo: membro.cargo, foto: membro.foto ?? null } : {}) };
  });
}

/** Tira da sala de voz, se estiver em alguma. Não estar em nenhuma não é erro. */
async function tirarDaSala(usuarioId) {
  const onde = await ondeEsta(usuarioId);
  if (onde) await svc.removeParticipant(onde.sala, identidadeDe(usuarioId)).catch(() => {});
}

/** Encontra em que sala a pessoa está agora, para poder mutá-la ou desconectá-la. */
async function ondeEsta(usuarioId) {
  const alvo = identidadeDe(usuarioId);
  for (const nome of salasDoServidor()) {
    const ps = await svc.listParticipants(nome).catch(() => []);
    const p = ps.find((x) => x.identity === alvo);
    if (p) return { sala: nome, participante: p };
  }
  return null;
}

/** Sobe (ou remove, se vier vazio) a foto/banner de quem pediu ou do servidor. */
async function trocarImagem(req, de, papel) {
  const eu = exigirSessao(req);
  if (de === 'servidor' && eu.cargo < CARGO.DONO) {
    throw new ErroDeConta('Só o dono muda a imagem do servidor.', 403);
  }
  const bruto = await lerBinario(req, LIMITES[papel] + 1024);
  // Corpo vazio significa "tirar a imagem": é como o app pede a remoção.
  const nome = bruto.length ? salvarImagem(ARQUIVOS, bruto, papel) : null;

  if (de === 'servidor') {
    db.prepare(`UPDATE servidores SET ${papel} = ? WHERE id = ?`).run(nome, SERVIDOR.id);
    return { servidor: verServidor() };
  }
  db.prepare(`UPDATE usuarios SET ${papel} = ? WHERE id = ?`).run(nome, eu.id);
  return { eu: verMembro(membros.buscarMembro(db, SERVIDOR.id, eu.id)) };
}

const ROTAS = {
  'POST /cadastrar': async (req) => {
    const c = await lerCorpo(req);
    if (c.senhaDoGrupo !== SENHA_DO_GRUPO) throw new ErroDeConta('Senha do grupo incorreta.', 401);
    const usuario = criarConta(db, c);
    const { token } = entrar(db, { apelido: usuario.apelido, senha: c.senha });
    return sessaoCompleta(usuario, token);
  },

  'POST /entrar': async (req) => {
    const c = await lerCorpo(req);
    const { usuario, token } = entrar(db, c);
    const sessao = sessaoCompleta(usuario, token);
    const barrado = membros.impedimento(membros.buscarMembro(db, SERVIDOR.id, usuario.id));
    // Banido entra na conta mas não na voz; o app mostra o motivo em vez de uma tela vazia.
    return { ...sessao, impedimento: barrado };
  },

  'POST /sair': async (req) => { sair(db, req.headers['x-sessao']); return { ok: true }; },

  'GET /eu': async (req) => {
    const eu = exigirSessao(req);
    return { eu: verMembro(eu), servidor: verServidor(), salas: salasDoServidor(), impedimento: membros.impedimento(eu) };
  },

  'PATCH /eu': async (req) => {
    const eu = exigirSessao(req);
    const { nome } = await lerCorpo(req);
    return { eu: verMembro(membros.mudarNomeExibido(db, SERVIDOR.id, eu.id, nome)) };
  },

  'GET /servidor': async (req) => {
    exigirSessao(req);
    return { servidor: verServidor(), salas: salasDoServidor(), membros: membros.listarMembros(db, SERVIDOR.id).map(verMembro) };
  },

  'PATCH /servidor': async (req) => {
    const eu = exigirSessao(req);
    if (eu.cargo < CARGO.DONO) throw new ErroDeConta('Só o dono edita o servidor.', 403);
    const { nome } = await lerCorpo(req);
    const limpo = String(nome ?? '').trim();
    if (limpo.length < 2 || limpo.length > 40) throw new ErroDeConta('O nome do servidor precisa ter de 2 a 40 caracteres.');
    db.prepare('UPDATE servidores SET nome = ? WHERE id = ?').run(limpo, SERVIDOR.id);
    return { servidor: verServidor() };
  },

  'GET /rooms': async (req) => {
    exigirSessao(req);
    const salas = [];
    for (const nome of salasDoServidor()) salas.push({ name: nome, participants: await participantesDaSala(nome) });
    return { rooms: salas };
  },

  'POST /token': async (req) => {
    const eu = exigirSessao(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const { room } = await lerCorpo(req);
    if (!salasDoServidor().includes(room)) throw new ErroDeConta('Essa sala não existe.', 400);

    const at = new AccessToken(KEY, SECRET, { identity: identidadeDe(eu.id), name: eu.nome, ttl: '12h' });
    at.addGrant({ room, roomJoin: true, roomCreate: true, canPublish: true, canSubscribe: true, canPublishData: true });
    return { url: PUBLIC_URL, token: await at.toJwt(), identity: identidadeDe(eu.id) };
  },

  'POST /eu/foto':   (req) => trocarImagem(req, 'usuario', 'foto'),
  'POST /eu/banner': (req) => trocarImagem(req, 'usuario', 'banner'),
  'POST /servidor/foto':   (req) => trocarImagem(req, 'servidor', 'foto'),
  'POST /servidor/banner': (req) => trocarImagem(req, 'servidor', 'banner'),

  'GET /sons': async (req) => {
    exigirSessao(req);
    return { sons: sons.listarSons(db, SERVIDOR.id) };
  },

  // O nome vem na URL porque o corpo é o arquivo cru, sem espaço para campos.
  'POST /sons': async (req) => {
    const eu = exigirSessao(req);
    const nome = new URL(req.url, 'http://x').searchParams.get('nome');
    const bruto = await lerBinario(req, LIMITES.som + 1024);
    const arquivo = salvarSom(ARQUIVOS, bruto);
    return { som: sons.adicionarSom(db, SERVIDOR.id, eu, { nome, arquivo }) };
  },

  'POST /sons/apagar': async (req) => {
    const eu = exigirSessao(req);
    const { id } = await lerCorpo(req);
    return sons.removerSom(db, SERVIDOR.id, eu, id);
  },

  'POST /moderar': async (req) => {
    const eu = exigirSessao(req);
    const { acao, alvo, minutos, cargo } = await lerCorpo(req);
    const sid = SERVIDOR.id;

    switch (acao) {
      // Banir e dar castigo também tiram da call. Sem isso a pessoa continua conversando
      // depois de banida — some só quando o app dela percebe — e quem clicou conclui,
      // com razão, que o botão não funcionou.
      case 'banir': {
        const r = membros.banir(db, sid, eu.id, alvo);
        await tirarDaSala(alvo);
        return { alvo: verMembro(r) };
      }
      case 'timeout': {
        const r = membros.darTimeout(db, sid, eu.id, alvo, minutos);
        await tirarDaSala(alvo);
        return { alvo: verMembro(r) };
      }
      case 'desbanir':   return { alvo: verMembro(membros.desbanir(db, sid, eu.id, alvo)) };
      case 'tirarTimeout': return { alvo: verMembro(membros.tirarTimeout(db, sid, eu.id, alvo)) };
      case 'cargo':      return { alvo: verMembro(membros.definirCargo(db, sid, eu.id, alvo, cargo)) };

      case 'expulsar': {
        membros.expulsar(db, sid, eu.id, alvo);
        await tirarDaSala(alvo);
        return { ok: true };
      }
      case 'desconectar': {
        membros.exigirPermissao(db, sid, eu.id, 'desconectar', alvo);
        const onde = await ondeEsta(alvo);
        if (!onde) throw new ErroDeConta('Essa pessoa não está em nenhuma sala.', 409);
        await svc.removeParticipant(onde.sala, identidadeDe(alvo));
        return { ok: true };
      }
      case 'mutar': {
        membros.exigirPermissao(db, sid, eu.id, 'mutar', alvo);
        const onde = await ondeEsta(alvo);
        if (!onde) throw new ErroDeConta('Essa pessoa não está em nenhuma sala.', 409);
        const microfones = onde.participante.tracks.filter((t) => t.source === 2 /* MICROPHONE */);
        for (const t of microfones) await svc.mutePublishedTrack(onde.sala, identidadeDe(alvo), t.sid, true);
        return { ok: true, mutadas: microfones.length };
      }
      default: throw new ErroDeConta('Ação desconhecida.', 400);
    }
  },
};

const servidor = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? '?';
  const url = new URL(req.url ?? '/', 'http://x');

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/health') return json(res, 200, { ok: true });

  // As imagens são públicas de propósito: o <img> do app não manda cabeçalho de sessão.
  // O nome é o hash do conteúdo, então não dá para descobrir a de alguém por adivinhação.
  if (req.method === 'GET' && url.pathname.startsWith('/arquivos/')) {
    const arquivo = nomeValido(decodeURIComponent(url.pathname.slice('/arquivos/'.length)));
    if (!arquivo) return json(res, 404, { error: 'não encontrado' });
    // Conferir antes de responder: escrever o cabeçalho 200 e só então descobrir que o
    // arquivo sumiu deixa o cliente com uma resposta truncada em vez de um 404.
    let tamanho;
    try { tamanho = statSync(join(ARQUIVOS, arquivo.nome)).size; }
    catch { return json(res, 404, { error: 'não encontrado' }); }
    res.writeHead(200, {
      'content-length': tamanho,
      'content-type': arquivo.tipo,
      // O nome muda quando a imagem muda, então o cache pode ser eterno.
      'cache-control': 'public, max-age=31536000, immutable',
      ...CORS,
    });
    return createReadStream(join(ARQUIVOS, arquivo.nome))
      .on('error', () => { res.destroy(); })
      .pipe(res);
  }

  const chave = `${req.method} ${url.pathname}`;
  const rota = ROTAS[chave];
  if (!rota) return json(res, 404, { error: 'não encontrado' });

  // Só o que aceita senha é freado: o resto já exige sessão válida.
  if ((chave === 'POST /entrar' || chave === 'POST /cadastrar') && demais(ip)) {
    return json(res, 429, { error: 'muitas tentativas, espere 10 minutos' });
  }

  try {
    return json(res, 200, await rota(req));
  } catch (e) {
    if (e instanceof ErroDeConta || e instanceof ErroDeArquivo) return json(res, e.status, { error: e.message });
    console.error(chave, e);
    return json(res, 500, { error: 'erro no servidor' });
  }
});

servidor.listen(PORT, () => console.log(
  `Cantinho em http://0.0.0.0:${PORT} — servidor "${verServidor().nome}", salas: ${salasDoServidor().join(', ')}`,
));
