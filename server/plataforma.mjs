// O que é da SAGA, e não de um servidor.
//
// Um servidor tem o cargo mais alto dele — que pode se chamar Dono, Lula ou o que o
// pessoal quiser — e esse cargo manda naquele servidor. Isto aqui é outra coisa: quem
// cuida do app inteiro. Mora na conta porque a conta é o que existe acima dos servidores,
// e porque o Berserk também é da conta: quem concede tem de estar no mesmo plano do que
// concede, senão o dono de um servidor qualquer distribuiria distinção que vale em todos.
import { ErroDeConta, emitirCodigoDeRecuperacao, codigosPendentes, senhaConfere } from './contas.mjs';
import { statusDeVerdade } from './presenca.mjs';
import { listarCargos } from './cargos.mjs';
import { listarCategorias } from './categorias.mjs';
import { listarSalas, acessosDoServidor } from './salas.mjs';
import * as usuarios from './repositorios/usuarios.mjs';
import * as tabelaDeServidores from './repositorios/servidores.mjs';
import * as tabelaDeMembros from './repositorios/membros.mjs';
import * as tabelaDeSalas from './repositorios/salas.mjs';
import * as tabelaDeMensagens from './repositorios/mensagens.mjs';
import * as tabelaDeConvites from './repositorios/convites.mjs';
import * as tabelaDeSons from './repositorios/sons.mjs';

export const ehDonoDaSaga = (db, usuarioId) => usuarios.ehDono(db, usuarioId);

/**
 * Exportada porque a rota da administração confere ANTES de ir ao LiveKit: quem não é
 * dono não pode pôr o servidor para perguntar nada lá, e o 403 não pode depender de o
 * LiveKit estar de pé.
 */
export const exigirDonoDaSaga = (db, usuarioId) => {
  if (!ehDonoDaSaga(db, usuarioId)) {
    throw new ErroDeConta('Isto é do dono da Saga.', 403);
  }
};

/**
 * Marca quem manda no app. Roda no arranque, a partir do apelido do `.env`.
 *
 * Só semeia se ainda não houver dono nenhum: rodar sempre faria um `.env` trocado
 * transferir o app em silêncio, e tirar o dono de alguém não pode ser efeito colateral
 * de reiniciar o servidor.
 */
export function garantirDonoDaSaga(db, apelido) {
  if (!apelido) return null;
  if (usuarios.quantosDonos(db)) return null;
  const alvo = usuarios.buscarPorApelidoChave(db, String(apelido).toLowerCase());
  if (!alvo) return null;
  usuarios.definirDono(db, alvo.id);
  return alvo.id;
}

/** Todas as contas da Saga, para o painel do dono. Sem hash de senha, obviamente. */
export function listarContas(db, quemId) {
  exigirDonoDaSaga(db, quemId);
  const pendentes = codigosPendentes(db);
  return usuarios.listarComContagem(db)
    .map((u) => ({
      id: u.id, apelido: u.apelido, foto: u.foto ?? null,
      berserk: !!u.turbo, dono: !!u.dono,
      criadoEm: u.criado_em, servidores: u.servidores,
      // Até quando vale o código de senha pendente: a hora, nunca o código nem o hash dele.
      // O código aparece uma vez só, na tela de quem gerou.
      recuperacaoAte: pendentes.get(u.id) ?? null,
    }));
}

/** Dá ou tira o Berserk. Vale na Saga inteira, que é o plano em que ele existe. */
export function definirBerserk(db, quemId, alvoId, ligado) {
  exigirDonoDaSaga(db, quemId);
  const alvo = usuarios.buscarPorId(db, alvoId);
  if (!alvo) throw new ErroDeConta('Essa conta não existe.', 404);
  usuarios.definirTurbo(db, alvo.id, ligado);
  return listarContas(db, quemId).find((c) => c.id === alvo.id);
}

/**
 * O código de senha de uma conta, para o dono mandar por fora.
 *
 * É do dono da Saga porque as contas não têm e-mail, e alguém precisa atestar que a pessoa
 * é a pessoa. É poder de verdade — com isto ele entra em qualquer conta —, e por isso a
 * rota anota no registro quem gerou e para quem.
 *
 * Pede a senha do dono, como "Sua conta" pede a atual: sessão aberta não prova quem está no
 * teclado. Sem ela, uma Saga do dono aberta num computador sem ninguém por perto — ou o
 * crachá copiado de lá — valia a conta de qualquer um, e o registro ainda acusaria o dono.
 * Errar é 403, e não 401, que o app lê como "a sessão caiu".
 *
 * E não serve para a PRÓPRIA conta. Quem sabe a senha troca em "Sua conta"; quem não sabe e
 * usa o código derruba todas as sessões do único dono da Saga — e sem sessão de dono ninguém
 * gera código para ele, então a volta seria só pela VPS.
 */
export function emitirRecuperacao(db, quemId, alvoId, senhaDoDono) {
  exigirDonoDaSaga(db, quemId);
  if (Number(alvoId) === Number(quemId)) {
    throw new ErroDeConta('A sua senha se troca em Sua conta, com a senha atual.', 403);
  }
  if (!senhaConfere(senhaDoDono, usuarios.buscarPorId(db, quemId)?.senha_hash)) {
    throw new ErroDeConta('A sua senha não confere.', 403);
  }
  const { codigo, expiraEm } = emitirCodigoDeRecuperacao(db, alvoId, quemId);
  const conta = listarContas(db, quemId).find((c) => c.id === Number(alvoId));
  return { codigo, expiraEm, conta };
}

// --- a administração: todos os servidores ------------------------------------
//
// Estrutura sim, conversa não. Sai quem está, que cargos há, que salas existem — as
// privadas também, com quem as vê —, quem está em call e QUANTAS mensagens; o texto, a
// imagem e o anexo não saem, e o código de convite também não: código é chave de porta,
// e a administração só precisa saber quantas portas estão abertas.

const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

const agrupadoPorServidor = (linhas) => {
  const grupos = new Map();
  for (const l of linhas) {
    if (!grupos.has(l.servidor_id)) grupos.set(l.servidor_id, []);
    grupos.get(l.servidor_id).push(l);
  }
  return grupos;
};

/** O que o resumo conta, lido da Saga inteira de uma vez — nunca servidor a servidor. */
const lerASaga = (db, agora) => ({
  vinculos: agrupadoPorServidor(tabelaDeMembros.vinculosComPresenca(db)),
  salas: agrupadoPorServidor(tabelaDeSalas.resumoDeTodas(db)),
  mensagens: new Map(tabelaDeMensagens.resumoPorServidor(db, agora - SETE_DIAS).map((m) => [m.servidor_id, m])),
});

/**
 * O resumo de UM servidor, e o único lugar em que ele é contado.
 *
 * A lista e o detalhe passam os dois por aqui: duas contas da mesma coisa divergem com o
 * tempo — é o que já aconteceu com o cartão de perfil —, e aí o servidor escolhido diria
 * "3 online" na lista e "2 online" ao lado.
 *
 * `emCallPorSala` é `Map<salaId, participantes>`, montado pela rota a partir do LiveKit;
 * aqui só se soma o que for sala de voz deste servidor.
 */
function resumoDoServidor(s, saga, { quemId, emCallPorSala, agora }) {
  const vinculos = saga.vinculos.get(s.id) ?? [];
  const ficam = vinculos.filter((v) => !v.banido_em);
  const salas = saga.salas.get(s.id) ?? [];
  const deVoz = salas.filter((x) => x.tipo === 'voz');
  const mensagens = saga.mensagens.get(s.id);
  return {
    id: s.id,
    nome: s.nome,
    foto: s.foto ?? null,
    criadoEm: s.criado_em,
    criador: s.criado_por && s.criador_apelido != null
      ? { id: s.criado_por, apelido: s.criador_apelido, foto: s.criador_foto ?? null }
      : null,
    pessoas: ficam.length,
    banidos: vinculos.length - ficam.length,
    // A regra de presença é a de sempre, com o `agora` de quem pergunta: status guardado
    // sem sinal recente é lembrança, e banido não conta como gente do servidor.
    online: ficam.filter((v) => statusDeVerdade(v.status, v.visto_em, agora) !== 'offline').length,
    emCall: deVoz.reduce((n, x) => n + (emCallPorSala.get(x.id) ?? 0), 0),
    salas: {
      voz: deVoz.length,
      texto: salas.filter((x) => x.tipo === 'texto').length,
      privadas: salas.filter((x) => x.privada).length,
    },
    mensagens: {
      total: mensagens?.total ?? 0,
      ultimos7Dias: mensagens?.ultimos_7_dias ?? 0,
      ultimaEm: mensagens?.ultima_em ?? null,
    },
    souMembro: ficam.some((v) => v.usuario_id === quemId),
  };
}

/**
 * Todos os servidores da Saga, inclusive os de que o dono não faz parte. Por id: quem
 * ordena para ler é a tela.
 */
export function listarServidores(db, quemId, { emCallPorSala = new Map(), agora = Date.now() } = {}) {
  exigirDonoDaSaga(db, quemId);
  const saga = lerASaga(db, agora);
  return tabelaDeServidores.todos(db)
    .map((s) => resumoDoServidor(s, saga, { quemId, emCallPorSala, agora }));
}

/**
 * Um servidor por dentro: o resumo da lista e mais a estrutura.
 *
 * Sem `membros` e sem quem está em cada call: `verMembro` e a lista do LiveKit moram em
 * `index.mjs`, e quem acrescenta é a rota — com o MESMO `verMembro` de `GET /servidor`,
 * senão a pessoa sairia com um formato aqui e outro lá.
 *
 * O dono é conferido antes de procurar o servidor: um 404 para quem não é dono ensinaria
 * quais números de servidor existem.
 */
export function verServidorDaSaga(db, quemId, servidorId, { emCallPorSala = new Map(), agora = Date.now() } = {}) {
  exigirDonoDaSaga(db, quemId);
  const id = Number(servidorId);
  const s = Number.isInteger(id) && id > 0 ? tabelaDeServidores.buscarComCriador(db, id) : null;
  if (!s) throw new ErroDeConta('Esse servidor não existe.', 404);

  const saga = lerASaga(db, agora);
  const ficam = (saga.vinculos.get(s.id) ?? []).filter((v) => !v.banido_em);
  const acessos = acessosDoServidor(db, s.id);
  const porSala = new Map(tabelaDeMensagens.resumoPorSala(db, s.id).map((m) => [m.sala_id, m]));

  return {
    ...resumoDoServidor(s, saga, { quemId, emCallPorSala, agora }),
    banner: s.banner ?? null,
    categorias: listarCategorias(db, s.id).map((c) => ({ id: c.id, nome: c.nome, ordem: c.ordem })),
    // TODAS, inclusive as privadas: é a lista de quem administra, não a de quem as vê.
    salas: listarSalas(db, s.id).map((sala) => {
      const escritas = sala.tipo === 'texto' ? porSala.get(sala.id) : null;
      return {
        id: sala.id,
        nome: sala.nome,
        tipo: sala.tipo,
        papel: sala.papel ?? null,
        privada: !!sala.privada,
        categoriaId: sala.categoriaId ?? null,
        cargos: sala.privada ? (acessos.get(sala.id) ?? []) : [],
        mensagens: { total: escritas?.total ?? 0, ultimaEm: escritas?.ultima_em ?? null },
      };
    }),
    cargos: listarCargos(db, s.id).map((c) => ({
      ...c,
      pessoas: ficam.filter((v) => v.cargo_id === c.id).length,
    })),
    convitesAtivos: tabelaDeConvites.quantosAtivos(db, s.id, agora),
    sons: tabelaDeSons.quantos(db, s.id),
  };
}
