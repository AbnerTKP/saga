// O que é da SAGA, e não de um servidor.
//
// Um servidor tem o cargo mais alto dele — que pode se chamar Dono, Lula ou o que o
// pessoal quiser — e esse cargo manda naquele servidor. Isto aqui é outra coisa: quem
// cuida do app inteiro. Mora na conta porque a conta é o que existe acima dos servidores,
// e porque o Berserk também é da conta: quem concede tem de estar no mesmo plano do que
// concede, senão o dono de um servidor qualquer distribuiria distinção que vale em todos.
import { ErroDeConta } from './contas.mjs';

export const ehDonoDaSaga = (db, usuarioId) =>
  !!db.prepare('SELECT dono FROM usuarios WHERE id = ?').get(Number(usuarioId))?.dono;

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
  const jaTem = db.prepare('SELECT count(*) c FROM usuarios WHERE dono = 1').get().c;
  if (jaTem) return null;
  const alvo = db.prepare('SELECT id FROM usuarios WHERE apelido_chave = ?').get(String(apelido).toLowerCase());
  if (!alvo) return null;
  db.prepare('UPDATE usuarios SET dono = 1 WHERE id = ?').run(alvo.id);
  return alvo.id;
}

/** Todas as contas da Saga, para o painel do dono. Sem hash de senha, obviamente. */
export function listarContas(db, quemId) {
  exigirDonoDaSaga(db, quemId);
  return db.prepare(`
    SELECT u.id, u.apelido, u.foto, u.turbo, u.dono, u.criado_em,
           (SELECT count(*) FROM membros m WHERE m.usuario_id = u.id) AS servidores
      FROM usuarios u ORDER BY u.apelido COLLATE NOCASE`).all()
    .map((u) => ({
      id: u.id, apelido: u.apelido, foto: u.foto ?? null,
      berserk: !!u.turbo, dono: !!u.dono,
      criadoEm: u.criado_em, servidores: u.servidores,
    }));
}

/** Dá ou tira o Berserk. Vale na Saga inteira, que é o plano em que ele existe. */
export function definirBerserk(db, quemId, alvoId, ligado) {
  exigirDonoDaSaga(db, quemId);
  const alvo = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(Number(alvoId));
  if (!alvo) throw new ErroDeConta('Essa conta não existe.', 404);
  db.prepare('UPDATE usuarios SET turbo = ? WHERE id = ?').run(ligado ? 1 : 0, alvo.id);
  return listarContas(db, quemId).find((c) => c.id === alvo.id);
}
