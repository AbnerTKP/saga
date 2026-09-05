// Salas do servidor: de voz ou de texto. Criar, renomear, reordenar e apagar é do dono —
// quando os cargos configuráveis chegarem, isto vira uma permissão marcável.
import { ErroDeConta } from './contas.mjs';
import { podeConfigurarMembro } from './cargos.mjs';

export const TIPOS = ['voz', 'texto'];

const NOME_VALIDO = /^[^\r\n]{1,32}$/;

const exigirDono = (membro, oQue) => {
  if (!podeConfigurarMembro(membro)) throw new ErroDeConta(`Só o dono ${oQue}.`, 403);
};

export const listarSalas = (db, servidorId) =>
  db.prepare('SELECT id, nome, tipo, ordem FROM salas WHERE servidor_id = ? ORDER BY ordem, id')
    .all(servidorId);

export const buscarSala = (db, servidorId, id) =>
  db.prepare('SELECT id, nome, tipo, ordem FROM salas WHERE servidor_id = ? AND id = ?')
    .get(servidorId, Number(id)) ?? null;

function conferirNome(db, servidorId, nome, exceto = null) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome da sala precisa ter de 1 a 32 caracteres, numa linha só.');
  }
  const igual = db.prepare(
    'SELECT id FROM salas WHERE servidor_id = ? AND nome = ? COLLATE NOCASE',
  ).get(servidorId, limpo);
  if (igual && igual.id !== exceto) throw new ErroDeConta('Já existe uma sala com esse nome.', 409);
  return limpo;
}

export function criarSala(db, servidorId, quem, { nome, tipo }) {
  exigirDono(quem, 'cria salas');
  if (!TIPOS.includes(tipo)) throw new ErroDeConta('A sala precisa ser de voz ou de texto.');
  const limpo = conferirNome(db, servidorId, nome);

  const ultima = db.prepare('SELECT MAX(ordem) o FROM salas WHERE servidor_id = ?').get(servidorId).o;
  const info = db.prepare('INSERT INTO salas (servidor_id, nome, tipo, ordem) VALUES (?, ?, ?, ?)')
    .run(servidorId, limpo, tipo, (ultima ?? -1) + 1);
  return buscarSala(db, servidorId, Number(info.lastInsertRowid));
}

export function renomearSala(db, servidorId, quem, id, nome) {
  exigirDono(quem, 'renomeia salas');
  const sala = buscarSala(db, servidorId, id);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);
  const limpo = conferirNome(db, servidorId, nome, sala.id);
  db.prepare('UPDATE salas SET nome = ? WHERE id = ?').run(limpo, sala.id);
  return buscarSala(db, servidorId, sala.id);
}

export function apagarSala(db, servidorId, quem, id) {
  exigirDono(quem, 'apaga salas');
  const sala = buscarSala(db, servidorId, id);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);
  // Um servidor sem sala nenhuma não teria para onde entrar, e o dono ficaria preso numa
  // tela vazia sem entender o que fez.
  if (listarSalas(db, servidorId).length <= 1) {
    throw new ErroDeConta('Esta é a única sala: crie outra antes de apagar esta.', 409);
  }
  // As mensagens vão junto, pelo ON DELETE CASCADE.
  db.prepare('DELETE FROM salas WHERE id = ?').run(sala.id);
  return { ok: true };
}

export function reordenarSalas(db, servidorId, quem, idsNaOrdem) {
  exigirDono(quem, 'reordena salas');
  const atuais = new Set(listarSalas(db, servidorId).map((s) => s.id));
  const ids = (idsNaOrdem ?? []).map(Number);
  // Contar quantos vieram não basta: repetir a mesma sala daria o mesmo total e deixaria
  // outra de fora, com a ordem terminando incoerente.
  const distintos = new Set(ids.filter((id) => atuais.has(id)));
  if (ids.length !== atuais.size || distintos.size !== atuais.size) {
    throw new ErroDeConta('A ordem precisa citar todas as salas, uma vez cada.');
  }

  const mover = db.prepare('UPDATE salas SET ordem = ? WHERE id = ?');
  ids.forEach((id, i) => mover.run(i, id));
  return listarSalas(db, servidorId);
}
