// O que é da SAGA, e não de um servidor.
//
// Um servidor tem o cargo mais alto dele — que pode se chamar Dono, Lula ou o que o
// pessoal quiser — e esse cargo manda naquele servidor. Isto aqui é outra coisa: quem
// cuida do app inteiro. Mora na conta porque a conta é o que existe acima dos servidores,
// e porque o Berserk também é da conta: quem concede tem de estar no mesmo plano do que
// concede, senão o dono de um servidor qualquer distribuiria distinção que vale em todos.
import { ErroDeConta } from './contas.mjs';
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
  return usuarios.listarComContagem(db)
    .map((u) => ({
      id: u.id, apelido: u.apelido, foto: u.foto ?? null,
      berserk: !!u.turbo, dono: !!u.dono,
      criadoEm: u.criado_em, servidores: u.servidores,
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
