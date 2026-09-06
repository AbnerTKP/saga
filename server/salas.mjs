// Salas do servidor: de voz ou de texto. Criar, renomear, reordenar e apagar é do dono —
// quando os cargos configuráveis chegarem, isto vira uma permissão marcável.
import { ErroDeConta } from './contas.mjs';
import { temPermissao } from './permissoes.mjs';

export const TIPOS = ['voz', 'texto'];

const NOME_VALIDO = /^[^\r\n]{1,32}$/;

const exigirGestaoDeSalas = (membro) => {
  if (!temPermissao(membro?.cargo, 'gerirSalas')) {
    throw new ErroDeConta('Seu cargo não permite mexer nas salas.', 403);
  }
};

/**
 * As salas na ordem em que se lê a barra lateral: primeiro as que não estão em gaveta
 * nenhuma, depois cada categoria na ordem dela, com as suas dentro.
 *
 * `categoria_id IS NULL` primeiro é de propósito: sala fora de gaveta é a que a pessoa
 * ainda não guardou, e ela precisa estar à vista, não no fim da lista.
 */
export const listarSalas = (db, servidorId) =>
  db.prepare(`
    SELECT s.id, s.nome, s.tipo, s.ordem, s.categoria_id AS categoriaId
      FROM salas s
      LEFT JOIN categorias c ON c.id = s.categoria_id
     WHERE s.servidor_id = ?
     ORDER BY (s.categoria_id IS NOT NULL), c.ordem, c.id, s.ordem, s.id`)
    .all(servidorId);

export const buscarSala = (db, servidorId, id) =>
  db.prepare('SELECT id, nome, tipo, ordem, categoria_id AS categoriaId FROM salas WHERE servidor_id = ? AND id = ?')
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
  exigirGestaoDeSalas(quem);
  if (!TIPOS.includes(tipo)) throw new ErroDeConta('A sala precisa ser de voz ou de texto.');
  const limpo = conferirNome(db, servidorId, nome);

  const ultima = db.prepare('SELECT MAX(ordem) o FROM salas WHERE servidor_id = ?').get(servidorId).o;
  const info = db.prepare('INSERT INTO salas (servidor_id, nome, tipo, ordem) VALUES (?, ?, ?, ?)')
    .run(servidorId, limpo, tipo, (ultima ?? -1) + 1);
  return buscarSala(db, servidorId, Number(info.lastInsertRowid));
}

export function renomearSala(db, servidorId, quem, id, nome) {
  exigirGestaoDeSalas(quem);
  const sala = buscarSala(db, servidorId, id);
  if (!sala) throw new ErroDeConta('Essa sala não existe.', 404);
  const limpo = conferirNome(db, servidorId, nome, sala.id);
  db.prepare('UPDATE salas SET nome = ? WHERE id = ?').run(limpo, sala.id);
  return buscarSala(db, servidorId, sala.id);
}

export function apagarSala(db, servidorId, quem, id) {
  exigirGestaoDeSalas(quem);
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

/**
 * Recoloca as salas na ordem pedida — e, de quebra, na gaveta pedida.
 *
 * Aceita as duas formas: uma lista de ids (o que o app fazia antes de existir categoria)
 * e uma lista de `{id, categoriaId}`. App e servidor sobem separados, então a versão
 * velha do app precisa continuar reordenando sem saber de gaveta nenhuma.
 *
 * A `ordem` é DENTRO do grupo, e não uma numeração corrida: assim mover uma sala de
 * gaveta não obriga a renumerar a lista inteira, e duas gavetas podem ter uma sala 0 cada.
 */
export function reordenarSalas(db, servidorId, quem, itens) {
  exigirGestaoDeSalas(quem);
  const atuais = new Set(listarSalas(db, servidorId).map((s) => s.id));
  const pedidos = (itens ?? []).map((x) => (
    typeof x === 'object' && x !== null
      ? { id: Number(x.id), categoriaId: x.categoriaId == null ? null : Number(x.categoriaId) }
      : { id: Number(x), categoriaId: undefined }   // forma antiga: não mexe na gaveta
  ));

  // Contar quantos vieram não basta: repetir a mesma sala daria o mesmo total e deixaria
  // outra de fora, com a ordem terminando incoerente.
  const distintos = new Set(pedidos.map((p) => p.id).filter((id) => atuais.has(id)));
  if (pedidos.length !== atuais.size || distintos.size !== atuais.size) {
    throw new ErroDeConta('A ordem precisa citar todas as salas, uma vez cada.');
  }

  const gavetas = new Set(db.prepare('SELECT id FROM categorias WHERE servidor_id = ?').all(servidorId).map((c) => c.id));
  for (const p of pedidos) {
    if (p.categoriaId != null && !gavetas.has(p.categoriaId)) {
      throw new ErroDeConta('Essa categoria não existe.', 404);
    }
  }

  const daGaveta = (p) => (p.categoriaId === undefined ? 'igual' : String(p.categoriaId));
  const contador = new Map();
  const mover = db.prepare('UPDATE salas SET ordem = ?, categoria_id = COALESCE(?, categoria_id) WHERE id = ?');
  const moverESoltar = db.prepare('UPDATE salas SET ordem = ?, categoria_id = NULL WHERE id = ?');
  for (const p of pedidos) {
    const chave = daGaveta(p);
    const i = contador.get(chave) ?? 0;
    contador.set(chave, i + 1);
    if (p.categoriaId === null) moverESoltar.run(i, p.id);
    else mover.run(i, p.categoriaId ?? null, p.id);
  }
  return listarSalas(db, servidorId);
}
