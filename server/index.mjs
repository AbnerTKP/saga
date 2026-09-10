// Servidor da Saga: contas, cargos e emissão de tokens do LiveKit.
//
// A autenticação é por sessão, não mais pela senha do grupo em cada pedido: a senha do
// grupo virou só o convite, exigida uma vez, no cadastro. Sem isso não haveria como saber
// *quem* está pedindo, e sem saber quem, não há cargo, banimento nem moderação.
import http from 'node:http';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { createReadStream, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBanco, garantirServidor } from './banco.mjs';
import { salvarImagem, salvarSom, salvarArquivoEmFluxo, nomeDeArquivoLimpo, nomeValido, pastaDosArquivos, ErroDeArquivo, LIMITES } from './arquivos.mjs';
import * as sons from './sons.mjs';
import { buscarGifs, baixarGif } from './giphy.mjs';
import * as enquadramento from './enquadramento.mjs';
import * as salasM from './salas.mjs';
import * as categoriasM from './categorias.mjs';
import * as plataforma from './plataforma.mjs';
import * as notas from './notas.mjs';
import * as presenca from './presenca.mjs';
import * as mensagens from './mensagens.mjs';
import { criarRegistroDeDigitacao } from './digitando.mjs';
import * as servidoresM from './servidores.mjs';
import { verParticipante } from './participantes.mjs';
import * as tabelaDeServidores from './repositorios/servidores.mjs';
import * as tabelaDeUsuarios from './repositorios/usuarios.mjs';
import * as tabelaDeMembros from './repositorios/membros.mjs';
import { ErroDeConta, criarConta, entrar, usuarioDaSessao, buscarPorId, sair } from './contas.mjs';
import { temPermissao, PERMISSOES } from './permissoes.mjs';
import * as cargosM from './cargos.mjs';
import * as membros from './membros.mjs';

const PORT = Number(process.env.PORT ?? 3001);
const SALAS_INICIAIS = (process.env.ROOMS ?? 'Geral').split(',').map((s) => s.trim()).filter(Boolean);
const NOME_DO_SERVIDOR = process.env.SERVER_NAME ?? 'Saga';
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

if (!KEY || !SECRET) {
  console.error('Defina LIVEKIT_API_KEY e LIVEKIT_API_SECRET');
  process.exit(1);
}

const svc = new RoomServiceClient(HOST, KEY, SECRET);
const db = abrirBanco(BANCO);
// Quem está escrevendo agora. Mora na memória do processo de propósito — ver digitando.mjs.
const digitando = criarRegistroDeDigitacao();
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
  res.writeHead(status, {
    'content-type': 'application/json',
    // 413 responde SEM ter lido o corpo todo: o que sobrou no cano não interessa a
    // ninguém, e sem isto o Node ficaria esperando o resto de um envio já recusado.
    ...(status === 413 ? { connection: 'close' } : {}),
    ...CORS,
  });
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
/**
 * Lê o corpo cru, com teto — e RESPONDE quando estoura, em vez de matar a conexão.
 *
 * Isto fazia `req.destroy()`, e o amigo do dono perdeu um zip por causa disso: o servidor
 * derrubava o socket no meio do envio, o app não recebia resposta nenhuma, e a tela ficava
 * com o botão apagado e mais nada. No registro do servidor sobrava só `Error: aborted`.
 * Passar do tamanho é um NÃO com motivo, e um não precisa chegar.
 *
 * Parar de ler é o certo — ninguém vai receber 200 MB à toa —, mas parar de ler é
 * `pause()`, não `destroy()`: pausado, o socket continua vivo e a resposta 413 ainda sai.
 * Quem fecha é o `connection: close` da resposta, depois de ela ter sido escrita.
 */
function lerBinario(req, limite, oQue = 'O arquivo') {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    let total = 0;
    let estourou = false;
    req.on('data', (c) => {
      if (estourou) return;
      total += c.length;
      if (total > limite) {
        estourou = true;
        req.pause();
        const mb = Math.round(limite / 1024 / 1024);
        reject(new ErroDeArquivo(`${oQue} passa de ${mb} MB.`, 413));
        return;
      }
      pedacos.push(c);
    });
    req.on('end', () => { if (!estourou) resolve(Buffer.concat(pedacos)); });
    req.on('error', (e) => { if (!estourou) reject(e); });
  });
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
  // Dono da SAGA. É outra coisa de `cargo.dono`, que é o cargo mais alto de um servidor.
  donoDaSaga: !!m.dono,
  // O que vale AGORA: status guardado sem sinal recente é lembrança, não presença.
  status: presenca.statusDeVerdade(m.status, m.visto_em),
  idExibido: m.id_exibido ?? null,
  banido: !!m.banido_em,
  banidoPor: m.banido_por ?? null,
  castigoAte: m.silenciado_ate ?? null,
  entrouEm: m.entrou_em ?? null,
});

const verServidor = (sid) => {
  const s = tabelaDeServidores.buscar(db, sid);
  return { id: s.id, nome: s.nome, foto: s.foto ?? null, banner: s.banner ?? null };
};

/**
 * As salas que ESTA pessoa vê. Sala privada é invisível para quem não pode — por isso
 * toda lista que vai para a tela passa por aqui, e nunca por `listarSalas`, que é a lista
 * crua de quem administra.
 */
const salasDoServidor = (sid, quem) => salasM.salasDe(db, sid, quem);
/** Mandou: some da lista de quem está escrevendo, sem esperar o aviso vencer. */
const pararDeDigitar = (sid, usuarioId, sala) =>
  digitando.parou(salasM.buscarSala(db, sid, sala)?.id, usuarioId);
const salasDeVoz = (sid, quem) => salasDoServidor(sid, quem).filter((s) => s.tipo === 'voz');

/**
 * A pessoa vista sem servidor nenhum: só a conta.
 *
 * Existe porque agora dá para estar na Saga sem estar em servidor algum — quem acaba de
 * se cadastrar cai numa tela vazia, e essa tela precisa saber quem é você para mostrar
 * sua foto, seu nome e o caminho de sair. Cargo, nome exibido e identificador ficam
 * nulos, e é honesto: eles pertencem ao vínculo com um servidor, que ainda não existe.
 */
const verConta = (u) => u && ({
  id: u.id,
  apelido: u.apelido,
  nome: u.apelido,
  cargo: null,
  cargoNome: 'Sem cargo',
  foto: u.foto ?? null,
  banner: u.banner ?? null,
  enquadramento: enquadramento.ler(u.enquadramento),
  turbo: !!u.turbo,
  donoDaSaga: !!u.dono,
  status: presenca.statusDeVerdade(u.status, u.visto_em),
  idExibido: null,
  banido: false,
  banidoPor: null,
  castigoAte: null,
  entrouEm: null,
});

/**
 * O servidor de casa é do dono, e de mais ninguém automaticamente.
 *
 * Antes, QUEM se cadastrasse caía nele: era o único servidor que existia e a senha do
 * grupo era a porta. Hoje a conta nova nasce sem servidor nenhum — como no Discord — e
 * quem abre a porta é o convite. O que sobra aqui é uma instalação NOVA: o servidor
 * semeado pelo `.env` sobe sem dono, e sem esta linha ficaria de pé sem ninguém capaz de
 * entrar nele. Vale uma vez só, para o apelido que o `.env` chama de DONO.
 */
function garantirCasaDoDono(usuario) {
  if (!DONO || DONO.trim().toLowerCase() !== usuario.apelido_chave) return;
  if (tabelaDeServidores.quemCriou(db, SERVIDOR.id)) return;
  membros.garantirMembro(db, SERVIDOR.id, usuario, { dono: DONO });
}

/**
 * O que o app recebe quando a conta não está em servidor nenhum.
 *
 * São dois casos e uma tela só: quem acabou de se cadastrar e ainda não entrou em lugar
 * nenhum, e quem foi banido de todos. O segundo entra na conta do mesmo jeito, porque
 * precisa ver o motivo em vez de bater numa tela que não explica nada.
 */
function semServidor(usuario) {
  const ondeQuerQueSeja = tabelaDeMembros.qualquerServidor(db, usuario.id);
  const membro = ondeQuerQueSeja ? membros.buscarMembro(db, ondeQuerQueSeja, usuario.id) : null;
  return {
    eu: membro ? verMembro(membro) : verConta(usuario),
    servidor: null,
    servidores: [],
    salas: [],
    // Só quem TEM vínculo em algum lugar tem impedimento a explicar. Quem acabou de se
    // cadastrar não está impedido de nada — ele só ainda não entrou em lugar nenhum, e
    // dizer "você não faz parte deste servidor" na primeira tela é responder a uma
    // pergunta que ninguém fez.
    impedimento: membro ? membros.impedimento(membro) : null,
  };
}

/** Entra na conta e já a vincula ao servidor, devolvendo o que o app precisa para desenhar tudo. */
function sessaoCompleta(usuario, token) {
  // Também aqui, e não só no arranque: num servidor novo o `.env` já traz o apelido do
  // dono, mas a conta dele ainda não existe quando o processo sobe. Semear só lá deixava
  // a Saga sem dono para sempre. É idempotente — ver garantirDonoDaSaga.
  plataforma.garantirDonoDaSaga(db, DONO);
  garantirCasaDoDono(usuario);

  const meus = servidoresM.meusServidores(db, usuario.id);
  if (meus.length === 0) return { token, ...semServidor(usuario) };

  const sid = meus[0].id;
  return {
    token,
    eu: verMembro(membros.buscarMembro(db, sid, usuario.id)),
    servidor: verServidor(sid),
    servidores: meus,
    salas: salasDoServidor(sid, membros.buscarMembro(db, sid, usuario.id)),
    categorias: categoriasM.listarCategorias(db, sid),
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

/**
 * A lista de salas do LiveKit, lembrada por um segundo.
 *
 * Toda pesquisa do app pedia esta lista UMA VEZ POR SALA, dentro de um `for` com `await`:
 * com 6 salas de voz, seis idas ao LiveKit, uma depois da outra, a cada pesquisa. E cada
 * pessoa pesquisa de 4 em 4 segundos. Medido na produção, com isso: `/health` — que não
 * faz nada — levava 77 ms de mediana e picos de 857 ms, contra 29 ms de ICMP; o servidor
 * de token comia 34% do ÚNICO núcleo da VPS. A conta bate: 8 pessoas × 158 ms ÷ 4 s.
 *
 * Um segundo de memória resolve as duas coisas de uma vez: seis buscas viram uma por
 * pedido, e as de várias pessoas ao mesmo tempo viram uma só. `indo` existe para que
 * duas chegando juntas não disparem duas buscas — a segunda espera a primeira.
 */
const LEMBRAR = 1000;
const memoria = { salas: { em: 0, valor: [], indo: null }, gente: new Map() };

function lembrado(caixa, buscar) {
  const agora = Date.now();
  if (agora - caixa.em < LEMBRAR) return Promise.resolve(caixa.valor);
  if (caixa.indo) return caixa.indo;
  caixa.indo = buscar()
    .catch(() => [])
    .then((v) => { caixa.valor = v; caixa.em = Date.now(); caixa.indo = null; return v; });
  return caixa.indo;
}

const salasVivas = () => lembrado(memoria.salas, () => svc.listRooms());

function genteDaSala(nome) {
  let caixa = memoria.gente.get(nome);
  if (!caixa) { caixa = { em: 0, valor: [], indo: null }; memoria.gente.set(nome, caixa); }
  return lembrado(caixa, () => svc.listParticipants(nome));
}

/** Esquece o que foi lembrado: usado quando NÓS mudamos a sala e não dá para esperar. */
function esquecerSalas() {
  memoria.salas.em = 0;
  for (const c of memoria.gente.values()) c.em = 0;
}

async function participantesDaSala(sid, sala, vivas) {
  const nome = salaNoLiveKit(sala);
  const r = (vivas ?? await salasVivas()).find((x) => x.name === nome);
  if (!r || r.numParticipants === 0) return [];
  const ps = await genteDaSala(nome);
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
  // Sem isto, a pesquisa seguinte ainda mostraria a pessoa na sala por até um segundo —
  // e expulsar que não parece funcionar é pior que expulsar devagar.
  esquecerSalas();
}

/** Encontra em que sala a pessoa está agora, para poder mutá-la ou desconectá-la. */
async function ondeEsta(sid, usuarioId) {
  const alvo = identidadeDe(usuarioId);
  // TODAS as salas de voz, inclusive as privadas que quem modera não enxerga: expulsar,
  // mutar e desconectar precisam achar a pessoa onde ela estiver. Aqui não se está
  // mostrando sala nenhuma a ninguém — se está procurando alguém.
  for (const sala of salasM.listarSalas(db, sid).filter((s) => s.tipo === 'voz')) {
    const nome = salaNoLiveKit(sala);
    const ps = await svc.listParticipants(nome).catch(() => []);
    const p = ps.find((x) => x.identity === alvo);
    if (p) return { sala: nome, participante: p };
  }
  return null;
}

/**
 * Imagem animada é privilégio do Berserk. O servidor confere, e não a tela: do
 * contrário bastaria alterar o app para contornar.
 */
function guardarComRegraDoTurbo(eu, bruto, papel, de) {
  const nome = salvarImagem(ARQUIVOS, bruto, papel);
  const animada = nome.endsWith('.gif');
  // O servidor é do dono, então a imagem dele não passa por essa régua.
  if (animada && de === 'usuario' && !eu.turbo) {
    throw new ErroDeConta(
      'Imagem animada é do Berserk. Peça ao dono, ou use PNG, JPG ou WEBP.', 403, 'turbo');
  }
  return nome;
}

/**
 * Sobe (ou remove, se vier vazio) a foto/banner de quem pediu ou do servidor.
 *
 * A imagem da PESSOA é da conta, não do vínculo: mora em `usuarios` e vai com ela para
 * todo servidor. Por isso só exige servidor quem está mexendo na imagem do servidor —
 * senão quem ainda não entrou em nenhum não conseguiria nem pôr uma foto.
 */
async function trocarImagem(req, de, papel) {
  const usuario = exigirConta(req);
  const sid = de === 'servidor' || servidoresM.meusServidores(db, usuario.id).length
    ? exigirMembro(req).sid : null;
  const eu = sid ? membros.buscarMembro(db, sid, usuario.id) : verConta(usuario);
  if (de === 'servidor' && !temPermissao(eu.cargo, 'gerirServidor')) {
    throw new ErroDeConta('Seu cargo não permite mudar a imagem do servidor.', 403);
  }
  const bruto = await lerBinario(req, LIMITES[papel], 'A imagem');
  // Corpo vazio significa "tirar a imagem": é como o app pede a remoção.
  const nome = bruto.length ? guardarComRegraDoTurbo(eu, bruto, papel, de) : null;

  if (de === 'servidor') {
    tabelaDeServidores.trocarImagem(db, sid, papel, nome);
    return { servidor: verServidor(sid) };
  }
  /*
   * Trocar a imagem zera o enquadramento DELA.
   *
   * O enquadramento é "onde esta imagem foi arrastada e o quanto foi aproximada" — é da
   * imagem, não da pessoa. Mantendo-o, a foto nova entrava com a aproximação da antiga:
   * quem tinha dado zoom num banner largo e subiu outro, mais estreito, via um pedaço
   * gigante e branco no lugar do desenho. Foi assim que apareceu.
   *
   * O do outro papel não é tocado: trocar o banner não mexe em como a foto está posta.
   */
  const atual = tabelaDeUsuarios.lerEnquadramento(db, eu.id);
  const semOEnquadramentoAntigo = enquadramento.guardar(atual, papel, null);
  tabelaDeUsuarios.trocarImagemEEnquadramento(db, eu.id, papel, nome, semOEnquadramentoAntigo);
  return { eu: euDepois(usuario, sid) };
}

/** A pessoa como ela é agora: pelo vínculo, se houver servidor; pela conta, se não. */
const euDepois = (usuario, sid) =>
  (sid ? verMembro(membros.buscarMembro(db, sid, usuario.id)) : verConta(buscarPorId(db, usuario.id)));

const ROTAS = {
  'POST /cadastrar': async (req) => {
    // A senha do grupo saiu por pedido do dono. Ela era o convite: sem ela, quem souber
    // o endereço do servidor cria conta. O que continua barrando é o convite por servidor
    // (`/servidores/entrar`) — a conta nova cai no servidor de casa e mais nada.
    const c = await lerCorpo(req);
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

  'POST /sair': async (req) => {
    // Apaga o sinal de vida junto: sem isto, quem sai fica "online" até o silêncio vencer.
    const usuario = usuarioDaSessao(db, req.headers['x-sessao']);
    if (usuario) presenca.saiu(db, usuario.id);
    sair(db, req.headers['x-sessao']);
    return { ok: true };
  },

  'GET /eu': async (req) => {
    const usuario = exigirConta(req);
    // Sem servidor nenhum não é erro: é a tela inicial vazia. Respondendo 404 aqui, o app
    // entendia "essa sessão não vale mais" e deslogava quem tinha acabado de se cadastrar.
    const meus = servidoresM.meusServidores(db, usuario.id);
    if (meus.length === 0) return semServidor(usuario);

    const { sid, membro: eu } = exigirMembro(req);
    return {
      eu: verMembro(eu),
      servidor: verServidor(sid),
      // A lista vai junto porque a barra de servidores se desenha com ela, e este é o
      // pedido que o app faz ao abrir e a cada troca de servidor.
      servidores: meus,
      salas: salasDoServidor(sid, eu),
      impedimento: membros.impedimento(eu),
    };
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
      salas: salasM.listarSalas(db, sid).map((s) => salasM.verSala(db, sid, s.id)),
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
    tabelaDeServidores.renomear(db, sid, limpo);
    return { servidor: verServidor(sid) };
  },

  'GET /rooms': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    // O app manda até onde já leu cada sala, e recebe de volta quanto falta. Assim o
    // aviso de mensagem nova sai na mesma busca que já acontece, sem uma segunda.
    const lidas = mensagens.lerMarcadores(new URL(req.url, 'http://x').searchParams.get('lidas'));
    // A lista do LiveKit vem UMA vez e serve todas as salas; antes cada sala pedia a sua,
    // em fila. E o que sobra — a gente de cada sala ocupada — vai em paralelo, porque uma
    // não depende da outra.
    const vivas = await salasVivas();
    const acessos = salasM.acessosDoServidor(db, sid);
    const salas = await Promise.all(salasDoServidor(sid, eu).map(async (s) => ({
      id: s.id,
      name: s.nome,
      tipo: s.tipo,
      papel: s.papel ?? null,
      categoriaId: s.categoriaId ?? null,
      privada: !!s.privada,
      // Quais cargos veem, só nas privadas: quem recebeu a sala é alguém que já a vê, e
      // é isso que faz a tela de "quem pode ver" abrir com o que está valendo em vez de
      // com a lista vazia — que, salva sem querer, trancaria a sala para todo mundo.
      ...(s.privada ? { cargos: acessos.get(s.id) ?? [] } : {}),
      // Sala de texto não tem gente "dentro": ninguém entra nela, se lê e se escreve.
      participants: s.tipo === 'voz' ? await participantesDaSala(sid, s, vivas) : [],
      naoLidas: s.tipo === 'texto'
        ? mensagens.contarNaoLidas(db, s.id, lidas.get(s.id) ?? 0, eu.id)
        : 0,
    })));
    // As gavetas vão junto: a barra lateral desenha as duas coisas na mesma passada, e
    // uma segunda busca só para elas piscaria a lista a cada atualização.
    return { rooms: salas, categorias: categoriasM.listarCategorias(db, sid) };
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

  /**
   * Edita a sala: nome, privacidade e quem vê, numa decisão só.
   *
   * `renomear` continua existindo porque o app antigo a chama — app e servidor sobem
   * separados, e tirar uma rota que a versão de ontem usa quebra quem ainda não atualizou.
   */
  'POST /salas/editar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const c = await lerCorpo(req);
    return { sala: salasM.editarSala(db, sid, eu, c) };
  },

  'POST /salas/apagar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { id } = await lerCorpo(req);
    return salasM.apagarSala(db, sid, eu, id);
  },

  'POST /salas/ordem': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    // `salas` é a forma nova ({id, categoriaId}); `ids`, a que o app antigo manda.
    const { ids, salas } = await lerCorpo(req);
    return { salas: salasM.reordenarSalas(db, sid, eu, salas ?? ids) };
  },

  'POST /categorias/criar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { nome } = await lerCorpo(req);
    return { categoria: categoriasM.criarCategoria(db, sid, eu, nome) };
  },

  'POST /categorias/renomear': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { id, nome } = await lerCorpo(req);
    return { categoria: categoriasM.renomearCategoria(db, sid, eu, id, nome) };
  },

  'POST /categorias/apagar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { id } = await lerCorpo(req);
    return categoriasM.apagarCategoria(db, sid, eu, id);
  },

  // --- o que é da Saga, e não de um servidor ---------------------------------
  'POST /eu/presenca': async (req) => {
    const eu = exigirConta(req);
    const { status } = await lerCorpo(req);
    return { status: presenca.bater(db, eu.id, status) };
  },

  'GET /saga/contas': async (req) => {
    const eu = exigirConta(req);
    return { contas: plataforma.listarContas(db, eu.id) };
  },

  'POST /saga/berserk': async (req) => {
    const eu = exigirConta(req);
    const { alvo, berserk } = await lerCorpo(req);
    return { conta: plataforma.definirBerserk(db, eu.id, alvo, berserk) };
  },

  'POST /categorias/ordem': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { ids } = await lerCorpo(req);
    return { categorias: categoriasM.reordenarCategorias(db, sid, eu, ids) };
  },

  'GET /mensagens': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const q = new URL(req.url, 'http://x').searchParams;
    const depoisDe = q.get('depoisDe');
    const sala = salasM.buscarSala(db, sid, q.get('sala'));
    return {
      mensagens: mensagens.listarMensagens(db, sid, eu, q.get('sala'), {
        depoisDe: depoisDe ? Number(depoisDe) : undefined,
      }),
      // Quem está escrevendo vai de carona na busca que já acontece de 2 em 2 segundos.
      // Não há empurrão no servidor, e uma segunda pergunta só para isto seria dobrar o
      // trânsito da rota mais chamada do app.
      digitando: sala ? digitando.quemEsta(sala.id, { exceto: eu.id }) : [],
    };
  },

  /**
   * "Estou escrevendo." O app avisa a cada 3 s enquanto alguém digita — nunca a cada
   * tecla, que é o que faria disto o novo `vista_em`. Nada é gravado: ver digitando.mjs.
   */
  'POST /digitando': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { sala } = await lerCorpo(req);
    const daqui = salasM.salaVisivel(db, sid, eu, sala);
    if (!daqui || daqui.tipo !== 'texto') throw new ErroDeConta('Essa sala não existe, ou é de voz.', 400);
    // Quem está de castigo não vai conseguir mandar: anunciar que está escrevendo
    // prometeria uma mensagem que não vem.
    if (!membros.impedimento(eu)) digitando.avisar(daqui.id, { id: eu.id, nome: eu.nome });
    return { ok: true };
  },

  'POST /mensagens': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const { sala, texto } = await lerCorpo(req);
    const mensagem = mensagens.enviarMensagem(db, sid, eu, sala, texto);
    // A frase sai na hora: "Fulano está digitando" logo abaixo da mensagem que o Fulano
    // acabou de mandar é o pior momento possível para ela ainda estar na tela.
    pararDeDigitar(sid, eu.id, sala);
    return { mensagem };
  },

  // O GIF do chat também é baixado e guardado aqui, pelo mesmo motivo do GIF de perfil:
  // continua funcionando se sumir do Giphy, e passa pela conferência de bytes de sempre.
  // Não é do Turbo: o que o Turbo destrava é a imagem animada NO PERFIL.
  // Enquadrar não muda o arquivo: grava só onde a imagem ficou e o quanto foi aproximada.
  'PATCH /eu/enquadramento': async (req) => {
    // Como a foto: é da conta, então não depende de estar em servidor nenhum.
    const usuario = exigirConta(req);
    const sid = servidoresM.meusServidores(db, usuario.id).length ? exigirMembro(req).sid : null;
    const { papel, valor } = await lerCorpo(req);
    if (!['foto', 'banner'].includes(papel)) {
      throw new ErroDeConta('Só dá para enquadrar a foto ou o banner.', 400);
    }
    const atual = tabelaDeUsuarios.lerEnquadramento(db, usuario.id);
    const novo = enquadramento.guardar(atual, papel, valor);
    tabelaDeUsuarios.guardarEnquadramento(db, usuario.id, novo);
    return { eu: euDepois(usuario, sid) };
  },

  'POST /mensagens/gif': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const { sala, url } = await lerCorpo(req);
    const bruto = await baixarGif(url, LIMITES.chat);
    const nome = salvarImagem(ARQUIVOS, bruto, 'chat');
    const mensagem = mensagens.enviarMensagem(db, sid, eu, sala, '', nome);
    pararDeDigitar(sid, eu.id, sala);
    return { mensagem };
  },

  // O nome vem na URL porque o corpo é o arquivo cru, sem espaço para campos — igual ao
  // som. E o nome que a pessoa escolheu NÃO vai para o disco: lá ele é o hash com `.bin`,
  // e é por isso que nada aqui pode ser servido como página nem como script.
  'POST /mensagens/arquivo': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const q = new URL(req.url, 'http://x').searchParams;
    // Em FLUXO, direto para o disco: um arquivo de 200 MB juntado na memória estouraria o
    // teto do contêiner, e falta de memória já derrubou a máquina inteira uma vez.
    const guardado = await salvarArquivoEmFluxo(ARQUIVOS, req, LIMITES.arquivo, 'O arquivo');
    const mensagem = mensagens.enviarMensagem(db, sid, eu, q.get('sala'), q.get('texto') ?? '', null, {
      nomeNoDisco: guardado.nome,
      nome: nomeDeArquivoLimpo(q.get('nome')),
      bytes: guardado.bytes,
    });
    pararDeDigitar(sid, eu.id, q.get('sala'));
    return { mensagem };
  },

  'POST /token': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const barrado = membros.impedimento(eu);
    if (barrado) throw new ErroDeConta(barrado, 403);
    const { room, sala: salaId } = await lerCorpo(req);
    // Aceita o id (novo) ou o nome (como o app antigo pedia).
    const sala = salasDeVoz(sid, eu).find((s) => (salaId ? s.id === Number(salaId) : s.nome === room));
    if (!sala) throw new ErroDeConta('Essa sala não existe, ou é de texto.', 400);

    const nome = salaNoLiveKit(sala);
    const at = new AccessToken(KEY, SECRET, { identity: identidadeDe(eu.id), name: eu.nome, ttl: '12h' });
    // `canUpdateOwnMetadata` é o que deixa o app CONTAR à sala qual transmissão ele está
    // assistindo (o atributo `assistindo`, em espectadores.ts). Sem isso quem transmite não
    // teria como saber quem está vendo: o LiveKit não conta a ninguém quem se inscreveu na
    // faixa dele. É permissão de mexer nos PRÓPRIOS atributos, não nos de outra pessoa.
    at.addGrant({ room: nome, roomJoin: true, roomCreate: true, canPublish: true, canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: true });
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
    const bruto = await lerBinario(req, LIMITES.som, 'O som');
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
    exigirConta(req);
    const q = new URL(req.url, 'http://x').searchParams;
    return { gifs: await buscarGifs({ chave: GIPHY, termo: q.get('q'), limite: q.get('limite') }) };
  },

  // O GIF escolhido é baixado e guardado aqui: assim continua funcionando se sumir do
  // Giphy, e passa pelas mesmas conferências de qualquer imagem enviada.
  'POST /giphy/usar': async (req) => {
    const usuario = exigirConta(req);
    const { onde, url } = await lerCorpo(req);
    const [de, papel] = String(onde ?? '').split('.');
    if (!['usuario', 'servidor'].includes(de) || !['foto', 'banner'].includes(papel)) {
      throw new ErroDeConta('Não sei onde pôr essa imagem.', 400);
    }
    const sid = de === 'servidor' || servidoresM.meusServidores(db, usuario.id).length
      ? exigirMembro(req).sid : null;
    const eu = sid ? membros.buscarMembro(db, sid, usuario.id) : verConta(usuario);
    if (de === 'servidor' && !temPermissao(eu.cargo, 'gerirServidor')) {
      throw new ErroDeConta('Seu cargo não permite mudar a imagem do servidor.', 403);
    }
    const bruto = await baixarGif(url, LIMITES[papel]);
    const nome = guardarComRegraDoTurbo(eu, bruto, papel, de);

    if (de === 'servidor') {
      tabelaDeServidores.trocarImagem(db, sid, papel, nome);
      return { servidor: verServidor(sid) };
    }
    tabelaDeUsuarios.trocarImagem(db, usuario.id, papel, nome);
    return { eu: euDepois(usuario, sid) };
  },

  'POST /moderar': async (req) => {
    const { sid, membro: eu } = exigirMembro(req);
    const { acao, alvo, minutos, cargo, idExibido } = await lerCorpo(req);

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
      // Cinto e suspensório no arquivo qualquer: além de ir como octet-stream, ele vai
      // marcado como anexo. Nem que um dia alguém afrouxe o tipo, o navegador não passa
      // a renderizar o que veio de fora.
      ...(arquivo.tipo === 'application/octet-stream' ? { 'content-disposition': 'attachment' } : {}),
      ...CORS,
    });
    return createReadStream(join(ARQUIVOS, arquivo.nome))
      .on('error', () => { res.destroy(); })
      .pipe(res);
  }

  const chave = `${req.method} ${url.pathname}`;
  const rota = ROTAS[chave];
  if (!rota) return json(res, 404, { error: 'não encontrado' });

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

// Quem manda no app. Só semeia se ainda não houver dono: ver garantirDonoDaSaga.
plataforma.garantirDonoDaSaga(db, DONO);

// O app pesquisa de 4 em 4 segundos e o Node fecha a conexão ociosa aos 5 — um segundo
// de margem, e o registro do dono tem centenas de `→ 0` (a conexão morrendo na mão do
// cliente). Sessenta segundos tiram a corrida do caminho; o `headersTimeout` tem de ficar
// acima disso, senão ele é quem fecha.
/**
 * As notas de versão se mantêm sozinhas.
 *
 * O servidor vai buscar os Releases no GitHub e publica na sala o que faltar — em vez de
 * o processo de publicação ter de empurrar para cá, o que pediria um segredo no CI e
 * daria um jeito novo de a coisa parar sem ninguém perceber. Falhar aqui não é motivo
 * para nada: na próxima volta tenta de novo.
 */
/**
 * De hora em hora era tarde demais na única hora que importa.
 *
 * O servidor sobe ANTES de o Release existir — é essa a ordem certa, senão o app novo
 * chega antes do servidor que o atende. Só que a busca de notas acontece no arranque, e
 * no arranque ainda não há release nenhum: a nota da versão que acabou de sair só caía na
 * sala na volta seguinte, até uma hora depois. Aconteceu com a v0.41.0, e o dono teve de
 * cobrar. Dez minutos são seis idas ao GitHub por hora — a cota é de sessenta — e limitam
 * o atraso a dez minutos sem ninguém precisar lembrar de nada.
 */
const DE_QUANTO_EM_QUANTO = 10 * 60_000;

// A sala existe sempre, mesmo sem internet: ela faz parte do formato do servidor, e o
// teste não pode depender de o GitHub estar de pé para ela aparecer.
notas.garantirSalaDeNotas(db, SERVIDOR.id);

async function cuidarDasNotas() {
  try {
    const quantas = await notas.publicarNotas(db, SERVIDOR.id);
    if (quantas) console.log(`notas de versão: ${quantas} publicada(s) na sala "${notas.NOME_DA_SALA}"`);
  } catch (e) {
    console.warn('notas de versão:', e.message);
  }
}
// `SEM_NOTAS` existe para o teste: ir à internet num teste o torna lento e instável, e
// faz falhar por motivo que não é do código.
if (!process.env.SEM_NOTAS) {
  cuidarDasNotas();
  setInterval(cuidarDasNotas, DE_QUANTO_EM_QUANTO).unref();
}

servidor.keepAliveTimeout = 60_000;
servidor.headersTimeout = 65_000;

servidor.listen(PORT, () => {
  console.log(
    `Saga em http://0.0.0.0:${PORT} — ${tabelaDeServidores.quantos(db)} servidor(es), `
    + `o de casa é "${verServidor(SERVIDOR.id).nome}" com ${salasM.listarSalas(db, SERVIDOR.id).length} salas`,
  );
  // Dito em voz alta de propósito: as fotos já sumiram uma vez indo parar dentro do
  // contêiner, e o silêncio foi metade do problema. "0 arquivos" depois de um deploy é
  // para saltar aos olhos de quem publicou.
  let quantos = 0;
  try { quantos = readdirSync(ARQUIVOS).length; } catch { quantos = 0; }
  console.log(`banco em ${BANCO} — arquivos em ${ARQUIVOS} (${quantos})`);
});
