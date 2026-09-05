// Cargos do servidor. As regras de quem pode o quê vivem em permissoes.mjs, sem banco;
// aqui é só guardar, ler e alterar.
import { ErroDeConta } from './contas.mjs';
import { limparPermissoes, podeMexerNoCargo, temPermissao } from './permissoes.mjs';

const NOME_VALIDO = /^[^\r\n]{1,24}$/;
const COR_VALIDA = /^#[0-9a-f]{6}$/i;

const paraFora = (c) => c && ({
  id: c.id,
  nome: c.nome,
  cor: c.cor ?? null,
  nivel: c.nivel,
  dono: !!c.dono,
  permissoes: JSON.parse(c.permissoes || '[]'),
});

export const listarCargos = (db, servidorId) =>
  db.prepare('SELECT * FROM cargos WHERE servidor_id = ? ORDER BY nivel DESC, id')
    .all(servidorId).map(paraFora);

export const buscarCargo = (db, servidorId, id) =>
  paraFora(db.prepare('SELECT * FROM cargos WHERE servidor_id = ? AND id = ?').get(servidorId, Number(id)));

export const cargoDoDono = (db, servidorId) =>
  paraFora(db.prepare('SELECT * FROM cargos WHERE servidor_id = ? AND dono = 1').get(servidorId));

function conferir(db, servidorId, { nome, cor, nivel }, exceto = null) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome do cargo precisa ter de 1 a 24 caracteres, numa linha só.');
  }
  if (cor != null && cor !== '' && !COR_VALIDA.test(cor)) {
    throw new ErroDeConta('A cor precisa ser um código como #a855f7.');
  }
  const n = Number(nivel);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new ErroDeConta('O nível precisa ser um número de 1 a 99. O 100 é do dono.');
  }
  const igual = db.prepare('SELECT id FROM cargos WHERE servidor_id = ? AND nome = ? COLLATE NOCASE')
    .get(servidorId, limpo);
  if (igual && igual.id !== exceto) throw new ErroDeConta('Já existe um cargo com esse nome.', 409);
  return { nome: limpo, cor: cor || null, nivel: n };
}

export function criarCargo(db, servidorId, quem, dados) {
  if (!temPermissao(quem?.cargo, 'gerirCargos')) {
    throw new ErroDeConta('Seu cargo não permite criar cargos.', 403);
  }
  const { nome, cor, nivel } = conferir(db, servidorId, dados);
  // Ninguém cria um cargo do próprio nível ou acima: seria dar a si mesmo um par capaz
  // de agir sobre quem o criou.
  if (!quem.cargo.dono && nivel >= quem.cargo.nivel) {
    throw new ErroDeConta('Não dá para criar um cargo do seu nível ou acima.', 403);
  }
  const permissoes = limparPermissoes(dados.permissoes);
  const info = db.prepare(
    'INSERT INTO cargos (servidor_id, nome, cor, nivel, dono, permissoes, criado_em) VALUES (?, ?, ?, ?, 0, ?, ?)',
  ).run(servidorId, nome, cor, nivel, JSON.stringify(permissoes), Date.now());
  return buscarCargo(db, servidorId, Number(info.lastInsertRowid));
}

export function editarCargo(db, servidorId, quem, id, dados) {
  const cargo = buscarCargo(db, servidorId, id);
  const r = podeMexerNoCargo(quem, cargo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);

  const { nome, cor, nivel } = conferir(db, servidorId, dados, cargo.id);
  if (!quem.cargo.dono && nivel >= quem.cargo.nivel) {
    throw new ErroDeConta('Não dá para pôr um cargo no seu nível ou acima.', 403);
  }
  // Ninguém dá a um cargo uma permissão que não tem: seria contornar o próprio limite
  // criando um cargo mais forte e vestindo-o depois.
  const pedidas = limparPermissoes(dados.permissoes);
  const permitidas = quem.cargo.dono ? pedidas : pedidas.filter((p) => temPermissao(quem.cargo, p));

  db.prepare('UPDATE cargos SET nome = ?, cor = ?, nivel = ?, permissoes = ? WHERE id = ?')
    .run(nome, cor, nivel, JSON.stringify(permitidas), cargo.id);
  return buscarCargo(db, servidorId, cargo.id);
}

export function apagarCargo(db, servidorId, quem, id) {
  const cargo = buscarCargo(db, servidorId, id);
  const r = podeMexerNoCargo(quem, cargo);
  if (!r.pode) throw new ErroDeConta(r.motivo, 403);

  // Quem estava nele desce para o cargo mais baixo, senão ficaria sem cargo nenhum e
  // sem poder entrar em lugar algum.
  const maisBaixo = db.prepare(
    'SELECT id FROM cargos WHERE servidor_id = ? AND id != ? ORDER BY nivel LIMIT 1',
  ).get(servidorId, cargo.id);
  if (!maisBaixo) throw new ErroDeConta('É o único cargo que sobrou.', 409);

  db.prepare('UPDATE membros SET cargo_id = ? WHERE servidor_id = ? AND cargo_id = ?')
    .run(maisBaixo.id, servidorId, cargo.id);
  db.prepare('DELETE FROM cargos WHERE id = ?').run(cargo.id);
  return { ok: true, movidosPara: maisBaixo.id };
}
