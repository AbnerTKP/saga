// Tudo que é da pessoa *dentro de um servidor*: nome exibido, cargo, banimento e castigo.
// Separado da conta porque a mesma conta poderá estar em vários servidores com cargos
// diferentes — hoje só existe um, mas o formato já é esse.
import { podeAgir, podeDarCargo, temPermissao } from './permissoes.mjs';
import { buscarCargo } from './cargos.mjs';
import { ErroDeConta, derrubarSessoes } from './contas.mjs';
import { ehDonoDaSaga } from './plataforma.mjs';
import * as tabela from './repositorios/membros.mjs';
import * as tabelaDeCargos from './repositorios/cargos.mjs';
import * as tabelaDeServidores from './repositorios/servidores.mjs';

/**
 * Vincula a pessoa ao servidor, se ainda não estiver.
 *
 * Quem manda no servidor semeado é quem `criado_por` disser — e quando ninguém disse
 * ainda, é o primeiro a entrar, ou o apelido do `DONO` do `.env` se ele existir. Isso
 * não é um cargo: mandar vem de ter criado, e o cargo que a pessoa veste é o mesmo que
 * qualquer outra veste. O de todo mundo é o mais baixo; quem cria o servidor pela rota
 * entra com o mais alto, em `servidores.mjs`.
 */
export function garantirMembro(db, servidorId, usuario, { dono } = {}) {
  const jaEsta = buscarMembro(db, servidorId, usuario.id);
  if (jaEsta) return jaEsta;

  const cargos = tabelaDeCargos.niveis(db, servidorId);
  const oMaisBaixo = cargos.slice().sort((a, b) => a.nivel - b.nivel)[0];
  const oMaisAlto = cargos.slice().sort((a, b) => b.nivel - a.nivel)[0];

  const semDono = !tabelaDeServidores.quemCriou(db, servidorId);
  const ehODono = semDono && (dono ? dono.trim().toLowerCase() === usuario.apelido_chave : true);
  if (ehODono) tabelaDeServidores.definirQuemCriou(db, servidorId, usuario.id);

  const escolhido = ehODono ? oMaisAlto : oMaisBaixo;
  tabela.inserir(db, {
    servidorId, usuarioId: usuario.id, cargoId: escolhido?.id ?? null,
    nivel: escolhido?.nivel ?? 10, entrouEm: Date.now(),
  });
  return buscarMembro(db, servidorId, usuario.id);
}

/**
 * Junta o cargo à pessoa: as regras de permissão trabalham com o par, não com um número.
 *
 * `dono` NÃO vem mais do cargo — vem de a pessoa ter criado o servidor. Quem criou tem
 * tudo e fica acima de todo mundo, mesmo sem cargo nenhum e mesmo que alguém edite o
 * cargo dele no banco; sem isso, um servidor poderia ficar sem quem o consertasse. O
 * nome e a cor que aparecem continuam sendo os do cargo de verdade, porque "dono" deixou
 * de ser algo que se veste.
 */
const ACIMA_DE_TODOS = 1000;

const comCargo = (m) => {
  if (!m) return m;
  const criou = !!m.criou_o_servidor;
  const doCargo = m.cargo_id ? {
    id: m.cargo_id,
    nome: m.cargo_nome,
    cor: m.cargo_cor ?? null,
    nivel: m.cargo_nivel,
    permissoes: JSON.parse(m.cargo_permissoes || '[]'),
  } : null;
  if (!criou) return { ...m, cargo: doCargo && { ...doCargo, dono: false } };
  return {
    ...m,
    cargo: {
      id: doCargo?.id ?? null,
      // Sem cargo nenhum, fica sem nome — e não "Dono". Escrever "Dono" aqui devolveria
      // pela porta dos fundos o cargo que acabou de sair: mandar é de quem criou, e isso
      // não é um cargo que se vista, se perca ou apareça na lista do servidor.
      nome: doCargo?.nome ?? null,
      cor: doCargo?.cor ?? null,
      nivel: ACIMA_DE_TODOS,
      dono: true,
      permissoes: doCargo?.permissoes ?? [],
    },
  };
};

export const buscarMembro = (db, servidorId, usuarioId) =>
  comCargo(tabela.buscar(db, servidorId, usuarioId)) ?? null;

export const listarMembros = (db, servidorId) =>
  tabela.listar(db, servidorId).map(comCargo);

/** Motivo pelo qual esta pessoa não pode entrar numa sala agora, ou null se pode. */
export function impedimento(membro, agora = Date.now()) {
  if (!membro) return 'Você não faz parte deste servidor.';
  if (membro.banido_em) return 'Você foi banido deste servidor.';
  if (membro.silenciado_ate && membro.silenciado_ate > agora) {
    const minutos = Math.ceil((membro.silenciado_ate - agora) / 60_000);
    return `Você está de castigo por mais ${minutos} minuto${minutos > 1 ? 's' : ''}.`;
  }
  return null;
}

const NOME_VALIDO = /^.{2,32}$/u;   // aqui pode ter espaço: é nome de exibição, não login

export function mudarNomeExibido(db, servidorId, usuarioId, nome) {
  const limpo = String(nome ?? '').trim();
  // Vazio volta a usar o apelido da conta.
  if (limpo && !NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome precisa ter de 2 a 32 caracteres.');
  }
  tabela.mudarNomeExibido(db, servidorId, usuarioId, limpo || null);
  return buscarMembro(db, servidorId, usuarioId);
}

const ID_VALIDO = /^[\p{L}\p{N}._#-]{1,8}$/u;   // curto: fica antes do nome, não pode roubar a linha

/** Identificador curto que aparece antes do nome. Vazio remove. */
/**
 * O identificador é do DONO DA SAGA, e de mais ninguém.
 *
 * `definirId` continua existindo como permissão de servidor e continua sendo o dono de lá
 * quem a desenha — mas ela sozinha não basta. O identificador aparece junto do nome em
 * todo servidor: quem o define está mexendo em como a pessoa é vista na Saga inteira, e
 * isso não pode caber ao cargo mais alto de UM servidor. É a mesma regra do Berserk, e
 * pelo mesmo motivo: quem concede tem de estar no plano do que concede.
 *
 * É regra do app, não mexida nos cargos de ninguém — os cargos ficam como o pessoal
 * desenhou, e a permissão que eles têm simplesmente não alcança isto.
 */
export function definirIdExibido(db, servidorId, quemId, alvoId, id) {
  if (!ehDonoDaSaga(db, quemId)) {
    throw new ErroDeConta('O identificador é do dono da Saga.', 403);
  }
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  if (!alvo) throw new ErroDeConta('Essa pessoa não faz parte do servidor.', 404);

  const limpo = String(id ?? '').trim();
  if (limpo && !ID_VALIDO.test(limpo)) {
    throw new ErroDeConta('O identificador precisa ter de 1 a 8 caracteres, sem espaços.');
  }
  tabela.definirIdExibido(db, servidorId, alvo.id, limpo || null);
  return buscarMembro(db, servidorId, alvo.id);
}

// --- moderação --------------------------------------------------------------

/** Confere a permissão e devolve os dois lados, ou estoura com o motivo da recusa. */
export function exigirPermissao(db, servidorId, quemId, acao, alvoId) {
  const quem = buscarMembro(db, servidorId, quemId);
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  const r = podeAgir(quem, acao, alvo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);
  return { quem, alvo };
}

export function banir(db, servidorId, quemId, alvoId) {
  const { quem, alvo } = exigirPermissao(db, servidorId, quemId, 'banir', alvoId);
  tabela.banir(db, servidorId, alvo.id, { quando: Date.now(), porQuem: quem.apelido });
  derrubarSessoes(db, alvo.id);   // não continua dentro com o app já aberto
  return buscarMembro(db, servidorId, alvo.id);
}

export function desbanir(db, servidorId, quemId, alvoId) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'banir', alvoId);
  tabela.desbanir(db, servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

export function darTimeout(db, servidorId, quemId, alvoId, minutos) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'timeout', alvoId);
  const m = Math.min(Math.max(1, Number(minutos) || 0), 60 * 24);   // de 1 minuto a 1 dia
  tabela.silenciarAte(db, servidorId, alvo.id, Date.now() + m * 60_000);
  return buscarMembro(db, servidorId, alvo.id);
}

export function tirarTimeout(db, servidorId, quemId, alvoId) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'timeout', alvoId);
  tabela.tirarSilencio(db, servidorId, alvo.id);
  return buscarMembro(db, servidorId, alvo.id);
}

export function expulsar(db, servidorId, quemId, alvoId) {
  const { alvo } = exigirPermissao(db, servidorId, quemId, 'expulsar', alvoId);
  derrubarSessoes(db, alvo.id);   // precisa entrar de novo; pode voltar, ao contrário do ban
  return alvo;
}

export function definirCargo(db, servidorId, quemId, alvoId, cargoId) {
  const quem = buscarMembro(db, servidorId, quemId);
  const alvo = buscarMembro(db, servidorId, Number(alvoId));
  const novo = buscarCargo(db, servidorId, cargoId);
  const r = podeDarCargo(quem, alvo, novo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);

  tabela.definirCargo(db, servidorId, alvo.id, { cargoId: novo.id, nivel: novo.nivel });
  return buscarMembro(db, servidorId, alvo.id);
}
