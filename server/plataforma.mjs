// O que é da SAGA, e não de um servidor.
//
// Um servidor tem o cargo mais alto dele — que pode se chamar Dono, Lula ou o que o
// pessoal quiser — e esse cargo manda naquele servidor. Isto aqui é outra coisa: quem
// cuida do app inteiro. Mora na conta porque a conta é o que existe acima dos servidores,
// e porque o Berserk também é da conta: quem concede tem de estar no mesmo plano do que
// concede, senão o dono de um servidor qualquer distribuiria distinção que vale em todos.
import { ErroDeConta, emitirCodigoDeRecuperacao, codigosPendentes, senhaConfere } from './contas.mjs';
import * as usuarios from './repositorios/usuarios.mjs';

export const ehDonoDaSaga = (db, usuarioId) => usuarios.ehDono(db, usuarioId);

const exigirDonoDaSaga = (db, usuarioId) => {
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
