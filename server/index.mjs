// Servidor do Cantinho: contas, cargos e emissão de tokens do LiveKit.
//
// A autenticação é por sessão, não mais pela senha do grupo em cada pedido: a senha do
// grupo virou só o convite, exigida uma vez, no cadastro. Sem isso não haveria como saber
// *quem* está pedindo, e sem saber quem, não há cargo, banimento nem moderação.
import http from 'node:http';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { createReadStream, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { salvarImagem, salvarSom, nomeValido, pastaDosArquivos, ErroDeArquivo, LIMITES } from './arquivos.mjs';
import * as sons from './sons.mjs';
import { buscarGifs, baixarGif } from './giphy.mjs';
import * as enquadramento from './enquadramento.mjs';
import * as salasM from './salas.mjs';
import * as mensagens from './mensagens.mjs';
import * as servidoresM from './servidores.mjs';
import { verParticipante } from './participantes.mjs';
import { ErroDeConta, criarConta, entrar, usuarioDaSessao, sair } from './contas.mjs';
import { temPermissao, PERMISSOES } from './permissoes.mjs';
import * as cargosM from './cargos.mjs';
import * as membros from './membros.mjs';

const PORT = Number(process.env.PORT ?? 3001);
const SENHA_DO_GRUPO = process.env.APP_PASSWORD ?? '';
const SALAS_INICIAIS = (process.env.ROOMS ?? 'Geral').split(',').map((s) => s.trim()).filter(Boolean);
const NOME_DO_SERVIDOR = process.env.SERVER_NAME ?? 'Cantinho do Vorcaro';
const DONO = process.env.DONO ?? '';            // apelido que vira dono; vazio = o primeiro a entrar
const BANCO = process.env.BANCO ?? './dados/cantinho.db';
/**
 * As fotos moram AO LADO DO BANCO, e isso não é estilo — é o que impede de perdê-las.
 *
 * Era um caminho solto (`./dados/arquivos`), relativo à pasta de trabalho. Em produção o
 * banco é apontado para o volume (`/dados/cantinho.db`) e ninguém lembrou de apontar as
 * fotos também: elas iam para `/srv/dados/arquivos`, DENTRO do contêiner. Cada
 * `up -d --build` levava tudo embora, com o banco intacto apontando para arquivos que já
 * não existiam. Ninguém percebeu porque o nome do arquivo é o hash e a resposta vem com
 * `immutable, max-age=31536000`: quem já tinha visto continuava vendo do cache por um ano,
 * e só quem chegava depois via a inicial no lugar da foto. Foram 6 imagens de 12.
 *
 * Amarrando ao banco, apontar um sem o outro deixa de ser possível.
 */
const ARQUIVOS = process.env.ARQUIVOS ?? pastaDosArquivos(BANCO);
const GIPHY = process.env.GIPHY_KEY ?? '';   // vazio = busca de GIF desligada
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
// O servidor semeado pelo .env. Continua existindo, mas deixou de ser o único: agora é
// só o primeiro, e cada pedido diz de qual servidor fala pelo cabeçalho x-servidor.
const SERVIDOR = garantirServidor(db, { nome: NOME_DO_SERVIDOR, salas: SALAS_INICIAIS });

// A identidade no LiveKit é o id da conta, não o nome: é estável, e é por ela que a
// moderação encontra a pessoa dentro da sala.
const identidadeDe = (usuarioId) => `u${usuarioId}`;

// A sala do LiveKit é identificada pelo id, não pelo nome: dois servidores com uma sala
// "Geral" cairiam na mesma conversa se fosse pelo nome.
const salaNoLiveKit = (sala) => `sala-${sala.id}`;
const idDaIdentidade = (identity) => Number(String(identity).replace(/^u/, '')) || null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-sessao, x-servidor',
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
  // O cargo vai inteiro: a tela precisa do nome e da cor para desenhar, e das
  // permissões para não oferecer botão que o servidor vai recusar.
  cargo: m.cargo ?? null,
  cargoNome: m.cargo?.nome ?? 'Sem cargo',
  foto: m.foto ?? null,
  banner: m.banner ?? null,
  // O enquadramento viaja junto da imagem: sem ele, a mesma foto apareceria enquadrada
  // num lugar e torta no outro.
  enquadramento: enquadramento.ler(m.enquadramento),
  turbo: !!m.turbo,
  idExibido: m.id_exibido ?? null,
  banido: !!m.banido_em,
  banidoPor: m.banido_por ?? null,
  castigoAte: m.silenciado_ate ?? null,
  entrouEm: m.entrou_em ?? null,
});

const verServidor = (sid) => {
  const s = db.prepare('SELECT * FROM servidores WHERE id = ?').get(sid);
  return { id: s.id, nome: s.nome, foto: s.foto ?? null, banner: s.banner ?? null };
};

const salasDoServidor = (sid) => salasM.listarSalas(db, sid);
const salasDeVoz = (sid) => salasDoServidor(sid).filter((s) => s.tipo === 'voz');

/** Entra na conta e já a vincula ao servidor, devolvendo o que o app precisa para desenhar tudo. */
function sessaoCompleta(usuario, token) {
  // Quem chega sem vínculo nenhum entra no semeado pelo .env — é o Cantinho de casa.
  const temVinculo = db.prepare('SELECT count(*) c FROM membros WHERE usuario_id = ?').get(usuario.id).c > 0;
  if (!temVinculo) membros.garantirMembro(db, SERVIDOR.id, usuario, { dono: DONO });

  const meus = servidoresM.meusServidores(db, usuario.id);
  if (meus.length === 0) {
    // Banido de todos os servidores em que estava. Ainda assim entra na conta: precisa
    // ver o motivo, em vez de bater numa tela que não explica nada.
    const qualquer = db.prepare('SELECT servidor_id FROM membros WHERE usuario_id = ? LIMIT 1').get(usuario.id);
    const membro = qualquer ? membros.buscarMembro(db, qualquer.servidor_id, usuario.id) : null;
    return {
      token,
      eu: membro ? verMembro(membro) : null,
      servidor: null,
      servidores: [],
      salas: [],
      impedimento: membros.impedimento(membro),
    };
  }

  const sid = meus[0].id;
  return {
    token,
    eu: verMembro(membros.buscarMembro(db, sid, usuario.id)),
    servidor: verServidor(sid),
    servidores: meus,
    salas: salasDoServidor(sid),
  };
}

/** Só a conta, sem servidor: serve para o que é global, como listar meus servidores. */
function exigirConta(req) {
  const usuario = usuarioDaSessao(db, req.headers['x-sessao']);
  if (!usuario) throw new ErroDeConta('Faça login novamente.', 401);
  return usuario;
}

/**
 * A conta e o servidor de que o pedido fala. Sem cabeçalho, usa o primeiro servidor da
 * pessoa — é o que o app antigo, que não manda o cabeçalho, espera encontrar.
 */
function exigirMembro(req) {
  const usuario = exigirConta(req);
  const pedido = Number(req.headers['x-servidor']) || null;
  const meus = servidoresM.meusServidores(db, usuario.id);
  if (meus.length === 0) throw new ErroDeConta('Você não faz parte de nenhum servidor.', 404);

  const sid = pedido && meus.some((s) => s.id === pedido) ? pedido : meus[0].id;
  const membro = membros.buscarMembro(db, sid, usuario.id);
  if (!membro) throw new ErroDeConta('Você não faz parte deste servidor.', 403);
  return { usuario, sid, membro };
}

/** Compatível com o que já existia: devolve o membro, agora do servidor do pedido. */
function exigirSessao(req) {
  return exigirMembro(req).membro;
}

async function participantesDaSala(sid, sala) {
  const nome = salaNoLiveKit(sala);
  const vivas = await svc.listRooms().catch(() => []);
  const r = vivas.find((x) => x.name === nome);
  if (!r || r.numParticipants === 0) return [];
  const ps = await svc.listParticipants(nome).catch(() => []);
  return ps.map((p) => {
    const base = verParticipante(p);
    const membro = membros.buscarMembro(db, sid, idDaIdentidade(p.identity));
    // Cargo e foto vêm do banco; microfone e tela, do LiveKit.
    // O LiveKit sabe microfone e tela; quem a pessoa é vem do banco.
    return {
      ...base,
      ...(membro ? {
        usuarioId: membro.id,
        name: membro.nome,
        cargo: membro.cargo,
        foto: membro.foto ?? null,
        banner: membro.banner ?? null,
        enquadramento: enquadramento.ler(membro.enquadramento),
        entrouEm: membro.entrou_em ?? null,
        turbo: !!membro.turbo,
        idExibido: membro.id_exibido ?? null,
      } : {}),
    };
  });
}

/** Tira da sala de voz, se estiver em alguma. Não estar em nenhuma não é erro. */
async function tirarDaSala(sid, usuarioId) {
  const onde = await ondeEsta(sid, usuarioId);
  if (onde) await svc.removeParticipant(onde.sala, identidadeDe(usuarioId)).catch(() => {});
}

/** Encontra em que sala a pessoa está agora, para poder mutá-la ou desconectá-la. */
async function ondeEsta(sid, usuarioId) {
  const alvo = identidadeDe(usuarioId);
  for (const sala of salasDeVoz(sid)) {
    const nome = salaNoLiveKit(sala);
    const ps = await svc.listParticipants(nome).catch(() => []);
    const p = ps.find((x) => x.identity === alvo);
    if (p) return { sala: nome, participante: p };
  }
  return null;
}

/**
 * Imagem animada é privilégio do Vorcaro Turbo. O servidor confere, e não a tela: do
 * contrário bastaria alterar o app para contornar.
 */
function guardarComRegraDoTurbo(eu, bruto, papel, de) {
  const nome = salvarImagem(ARQUIVOS, bruto, papel);
  const animada = nome.endsWith('.gif');
  // O servidor é do dono, então a imagem dele não passa por essa régua.
  if (animada && de === 'usuario' && !eu.turbo) {
    throw new ErroDeConta(
      'Imagem animada é do Vorcaro Turbo. Peça ao dono, ou use PNG, JPG ou WEBP.', 403, 'turbo');
  }
  return nome;
}

/** Sobe (ou remove, se vier vazio) a foto/banner de quem pediu ou do servidor. */
async function trocarImagem(req, de, papel) {
  const { sid, membro: eu } = exigirMembro(req);
  if (de === 'servidor' && !temPermissao(eu.cargo, 'gerirServidor')) {
    throw new ErroDeConta('Seu cargo não permite mudar a imagem do servidor.', 403);
  }
  const bruto = await lerBinario(req, LIMITES[papel] + 1024);
  // Corpo vazio significa "tirar a imagem": é como o app pede a remoção.
  const nome = bruto.length ? guardarComRegraDoTurbo(eu, bruto, papel, de) : null;

  if (de === 'servidor') {
    db.prepare(`UPDATE servidores SET ${papel} = ? WHERE id = ?`).run(nome, sid);
    return { servidor: verServidor(sid) };
  }
  db.prepare(`UPDATE usuarios SET ${papel} = ? WHERE id = ?`).run(nome, eu.id);
  return { eu: verMembro(membros.buscarMembro(db, sid, eu.id)) };
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
    // Banido entra na conta mas não na voz; o app mostra o motivo em vez de uma tela vazia.
    const barrado = sessao.impedimento
      ?? (sessao.servidor ? membros.impedimento(membros.buscarMembro(db, sessao.servidor.id, usuario.id)) : null);
    return { ...sessao, impedimento: barrado };
  },

  'POST /sair': async (req) => { sair(db, req.headers['x-sessao']); return { ok: true }; },

  'GET /eu': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    return { eu: verMembro(eu), servidor: verServidor(sid), salas: salasDoServidor(sid), impedimento: membros.impedimento(eu) };
  },

  'PATCH /eu': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { nome } = await lerCorpo(req);
    return { eu: verMembro(membros.mudarNomeExibido(db, sid, eu.id, nome)) };
  },

  'GET /servidor': async (req) => {
    const { sid } = exigirMembro(req);
    return {
      servidor: verServidor(sid),
      salas: salasDoServidor(sid),
      membros: membros.listarMembros(db, sid).map(verMembro),
      cargos: cargosM.listarCargos(db, sid),
      servidores: servidoresM.meusServidores(db, exigirConta(req).id),
      // A tela precisa saber que permissões existem para desenhar as caixinhas.
      permissoes: PERMISSOES,
    };
  },

  'PATCH /servidor': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    if (!temPermissao(eu.cargo, 'gerirServidor')) {
      throw new ErroDeConta('Seu cargo não permite editar o servidor.', 403);
    }
    const { nome } = await lerCorpo(req);
    const limpo = String(nome ?? '').trim();
    if (limpo.length < 2 || limpo.length > 40) throw new ErroDeConta('O nome do servidor precisa ter de 2 a 40 caracteres.');
    db.prepare('UPDATE servidores SET nome = ? WHERE id = ?').run(limpo, sid);
    return { servidor: verServidor(sid) };
  },

  'GET /rooms': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    // O app manda até onde já leu cada sala, e recebe de volta quanto falta. Assim o
    // aviso de mensagem nova sai na mesma busca que já acontece, sem uma segunda.
    const lidas = mensagens.lerMarcadores(new URL(req.url, 'http://x').searchParams.get('lidas'));
    const salas = [];
    for (const s of salasDoServidor(sid)) {
      salas.push({
        id: s.id,
        name: s.nome,
        tipo: s.tipo,
        // Sala de texto não tem gente "dentro": ninguém entra nela, se lê e se escreve.
        participants: s.tipo === 'voz' ? await participantesDaSala(sid, s) : [],
        naoLidas: s.tipo === 'texto'
          ? mensagens.contarNaoLidas(db, s.id, lidas.get(s.id) ?? 0, eu.id)
          : 0,
      });
    }
    return { rooms: salas };
  },

  'POST /salas/criar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { nome, tipo } = await lerCorpo(req);
    return { sala: salasM.criarSala(db, sid, eu, { nome, tipo }) };
  },

  'POST /salas/renomear': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { id, nome } = await lerCorpo(req);
    return { sala: salasM.renomearSala(db, sid, eu, id, nome) };
  },

  'POST /salas/apagar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { id } = await lerCorpo(req);
    return salasM.apagarSala(db, sid, eu, id);
  },

  'POST /salas/ordem': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { ids } = await lerCorpo(req);
    return { salas: salasM.reordenarSalas(db, sid, eu, ids) };
  },

  'GET /mensagens': async (req) => {
    const { sid } = exigirMembro(req);
    const q = new URL(req.url, 'http://x').searchParams;
    const depoisDe = q.get('depoisDe');
    return {
      mensagens: mensagens.listarMensagens(db, sid, q.get('sala'), {
        depoisDe: depoisDe ? Number(depoisDe) : undefined,
      }),
    };
  },

  'POST /mensagens': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const { sala, texto } = await lerCorpo(req);
    return { mensagem: mensagens.enviarMensagem(db, sid, eu, sala, texto) };
  },

  // O GIF do chat também é baixado e guardado aqui, pelo mesmo motivo do GIF de perfil:
  // continua funcionando se sumir do Giphy, e passa pela conferência de bytes de sempre.
  // Não é do Turbo: o que o Turbo destrava é a imagem animada NO PERFIL.
  // Enquadrar não muda o arquivo: grava só onde a imagem ficou e o quanto foi aproximada.
  'PATCH /eu/enquadramento': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { papel, valor } = await lerCorpo(req);
    if (!['foto', 'banner'].includes(papel)) {
      throw new ErroDeConta('Só dá para enquadrar a foto ou o banner.', 400);
    }
    const atual = db.prepare('SELECT enquadramento FROM usuarios WHERE id = ?').get(eu.id);
    const novo = enquadramento.guardar(atual?.enquadramento, papel, valor);
    db.prepare('UPDATE usuarios SET enquadramento = ? WHERE id = ?').run(novo, eu.id);
    return { eu: verMembro(membros.buscarMembro(db, sid, eu.id)) };
  },

  'POST /mensagens/gif': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const { sala, url } = await lerCorpo(req);
    const bruto = await baixarGif(url, LIMITES.chat);
    const nome = salvarImagem(ARQUIVOS, bruto, 'chat');
    return { mensagem: mensagens.enviarMensagem(db, sid, eu, sala, '', nome) };
  },

  'POST /token': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const { room, sala: salaId } = await lerCorpo(req);
    // Aceita o id (novo) ou o nome (como o app antigo pedia).
    const sala = salasDeVoz(sid).find((s) => (salaId ? s.id === Number(salaId) : s.nome === room));
    if (!sala) throw new ErroDeConta('Essa sala não existe, ou é de texto.', 400);

    const nome = salaNoLiveKit(sala);
    const at = new AccessToken(KEY, SECRET, { identity: identidadeDe(eu.id), name: eu.nome, ttl: '12h' });
    at.addGrant({ room: nome, roomJoin: true, roomCreate: true, canPublish: true, canSubscribe: true, canPublishData: true });
    return { url: PUBLIC_URL, token: await at.toJwt(), identity: identidadeDe(eu.id) };
  },

  'POST /eu/foto':   (req) => trocarImagem(req, 'usuario', 'foto'),
  'POST /eu/banner': (req) => trocarImagem(req, 'usuario', 'banner'),
  'POST /servidor/foto':   (req) => trocarImagem(req, 'servidor', 'foto'),
  'POST /servidor/banner': (req) => trocarImagem(req, 'servidor', 'banner'),

  'GET /sons': async (req) => {
    const { sid } = exigirMembro(req);
    return { sons: sons.listarSons(db, sid) };
  },

  // O nome vem na URL porque o corpo é o arquivo cru, sem espaço para campos.
  'POST /sons': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const nome = new URL(req.url, 'http://x').searchParams.get('nome');
    const bruto = await lerBinario(req, LIMITES.som + 1024);
    const arquivo = salvarSom(ARQUIVOS, bruto);
    return { som: sons.adicionarSom(db, sid, eu, { nome, arquivo }) };
  },

  'POST /sons/apagar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { id } = await lerCorpo(req);
    return sons.removerSom(db, sid, eu, id);
  },

  'GET /servidores': async (req) => {
    const usuario = exigirConta(req);
    return { servidores: servidoresM.meusServidores(db, usuario.id) };
  },

  'POST /servidores/criar': async (req) => {
    const usuario = exigirConta(req);
    return { servidor: servidoresM.criarServidor(db, usuario, await lerCorpo(req)) };
  },

  'POST /servidores/convite': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    return { convite: servidoresM.criarConvite(db, sid, eu, await lerCorpo(req)) };
  },

  'GET /servidores/convites': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    if (!temPermissao(eu.cargo, 'gerirServidor')) {
      throw new ErroDeConta('Seu cargo não permite ver os convites.', 403);
    }
    return { convites: servidoresM.listarConvites(db, sid) };
  },

  'POST /servidores/entrar': async (req) => {
    const usuario = exigirConta(req);
    const { codigo } = await lerCorpo(req);
    return { servidor: servidoresM.usarConvite(db, usuario, codigo) };
  },

  'POST /servidores/sair': async (req) => {
    const { sid, usuario } = exigirMembro(req);
    return servidoresM.sairDoServidor(db, sid, usuario);
  },

  'POST /cargos/criar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    return { cargo: cargosM.criarCargo(db, sid, eu, await lerCorpo(req)) };
  },

  'POST /cargos/editar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const c = await lerCorpo(req);
    return { cargo: cargosM.editarCargo(db, sid, eu, c.id, c) };
  },

  'POST /cargos/apagar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { id } = await lerCorpo(req);
    return cargosM.apagarCargo(db, sid, eu, id);
  },

  'GET /giphy': async (req) => {
    const { sid } = exigirMembro(req);
    const q = new URL(req.url, 'http://x').searchParams;
    return { gifs: await buscarGifs({ chave: GIPHY, termo: q.get('q'), limite: q.get('limite') }) };
  },

  // O GIF escolhido é baixado e guardado aqui: assim continua funcionando se sumir do
  // Giphy, e passa pelas mesmas conferências de qualquer imagem enviada.
  'POST /giphy/usar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { onde, url } = await lerCorpo(req);
    const [de, papel] = String(onde ?? '').split('.');
    if (!['usuario', 'servidor'].includes(de) || !['foto', 'banner'].includes(papel)) {
      throw new ErroDeConta('Não sei onde pôr essa imagem.', 400);
    }
    if (de === 'servidor' && !temPermissao(eu.cargo, 'gerirServidor')) {
      throw new ErroDeConta('Seu cargo não permite mudar a imagem do servidor.', 403);
    }
    const bruto = await baixarGif(url, LIMITES[papel]);
    const nome = guardarComRegraDoTurbo(eu, bruto, papel, de);

    if (de === 'servidor') {
      db.prepare(`UPDATE servidores SET ${papel} = ? WHERE id = ?`).run(nome, sid);
      return { servidor: verServidor(sid) };
    }
    db.prepare(`UPDATE usuarios SET ${papel} = ? WHERE id = ?`).run(nome, eu.id);
    return { eu: verMembro(membros.buscarMembro(db, sid, eu.id)) };
  },

  'POST /moderar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { acao, alvo, minutos, cargo, turbo, idExibido } = await lerCorpo(req);

    switch (acao) {
      // Banir e dar castigo também tiram da call. Sem isso a pessoa continua conversando
      // depois de banida — some só quando o app dela percebe — e quem clicou conclui,
      // com razão, que o botão não funcionou.
      case 'banir': {
        const r = membros.banir(db, sid, eu.id, alvo);
        await tirarDaSala(sid, alvo);
        return { alvo: verMembro(r) };
      }
      case 'timeout': {
        const r = membros.darTimeout(db, sid, eu.id, alvo, minutos);
        await tirarDaSala(sid, alvo);
        return { alvo: verMembro(r) };
      }
      case 'desbanir':   return { alvo: verMembro(membros.desbanir(db, sid, eu.id, alvo)) };
      case 'tirarTimeout': return { alvo: verMembro(membros.tirarTimeout(db, sid, eu.id, alvo)) };
      case 'cargo':      return { alvo: verMembro(membros.definirCargo(db, sid, eu.id, alvo, cargo)) };
      case 'turbo':      return { alvo: verMembro(membros.definirTurbo(db, sid, eu.id, alvo, turbo)) };
      case 'id':         return { alvo: verMembro(membros.definirIdExibido(db, sid, eu.id, alvo, idExibido)) };

      case 'expulsar': {
        membros.expulsar(db, sid, eu.id, alvo);
        await tirarDaSala(sid, alvo);
        return { ok: true };
      }
      case 'desconectar': {
        membros.exigirPermissao(db, sid, eu.id, 'desconectar', alvo);
        const onde = await ondeEsta(sid, alvo);
        if (!onde) throw new ErroDeConta('Essa pessoa não está em nenhuma sala.', 409);
        await svc.removeParticipant(onde.sala, identidadeDe(alvo));
        return { ok: true };
      }
      case 'mutar': {
        membros.exigirPermissao(db, sid, eu.id, 'mutar', alvo);
        const onde = await ondeEsta(sid, alvo);
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
    if (e instanceof ErroDeConta || e instanceof ErroDeArquivo) {
      return json(res, e.status, { error: e.message, tipo: e.tipo ?? 'erro' });
    }
    console.error(chave, e);
    return json(res, 500, { error: 'erro no servidor' });
  }
});

servidor.listen(PORT, () => {
  console.log(
    `Cantinho em http://0.0.0.0:${PORT} — ${db.prepare('SELECT count(*) c FROM servidores').get().c} servidor(es), `
    + `o de casa é "${verServidor(SERVIDOR.id).nome}" com ${salasDoServidor(SERVIDOR.id).length} salas`,
  );
  // Dito em voz alta de propósito: as fotos já sumiram uma vez indo parar dentro do
  // contêiner, e o silêncio foi metade do problema. "0 arquivos" depois de um deploy é
  // para saltar aos olhos de quem publicou.
  let quantos = 0;
  try { quantos = readdirSync(ARQUIVOS).length; } catch { quantos = 0; }
  console.log(`banco em ${BANCO} — arquivos em ${ARQUIVOS} (${quantos})`);
});
