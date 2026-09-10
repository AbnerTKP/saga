/**
 * A tabela `usuarios`: a CONTA, que é o que existe acima dos servidores.
 *
 * Aqui mora foto, banner, enquadramento, Berserk (`turbo`), dono da Saga (`dono`) e o
 * sinal de vida. Cargo, nome exibido e banimento NÃO moram aqui — são do vínculo com um
 * servidor, e vivem em `membros`.
 *
 * Só SQL: quem decide se pode, quem traduz para o que o app vê e quem escolhe a senha
 * está uma camada acima.
 */

export const buscarPorId = (db, id) =>
  db.prepare('SELECT * FROM usuarios WHERE id = ?').get(Number(id)) ?? null;

export const buscarPorApelidoChave = (db, chave) =>
  db.prepare('SELECT * FROM usuarios WHERE apelido_chave = ?').get(chave) ?? null;

export const apelidoExiste = (db, chave) =>
  !!db.prepare('SELECT 1 FROM usuarios WHERE apelido_chave = ?').get(chave);

/** Devolve o id novo. O hash já vem pronto: escolher como se guarda senha é de contas.mjs. */
export function inserir(db, { apelido, chave, senhaHash, criadoEm }) {
  const info = db.prepare(
    'INSERT INTO usuarios (apelido, apelido_chave, senha_hash, criado_em) VALUES (?, ?, ?, ?)',
  ).run(apelido, chave, senhaHash, criadoEm);
  return Number(info.lastInsertRowid);
}

/** Quantas linhas mudaram — 0 quer dizer "essa conta não existe". */
export const trocarSenha = (db, usuarioId, senhaHash) =>
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(senhaHash, Number(usuarioId)).changes;

// --- imagens da conta -------------------------------------------------------
//
// `papel` é 'foto' ou 'banner' e entra no SQL por interpolação; quem chama é o servidor,
// com valor conferido antes (a rota recusa qualquer outra coisa). Nada que venha da rede
// chega aqui como nome de coluna.

export const trocarImagem = (db, usuarioId, papel, nome) =>
  db.prepare(`UPDATE usuarios SET ${papel} = ? WHERE id = ?`).run(nome, Number(usuarioId));

/** Troca a imagem e o enquadramento na mesma ida: trocar a imagem zera o enquadramento dela. */
export const trocarImagemEEnquadramento = (db, usuarioId, papel, nome, enquadramento) =>
  db.prepare(`UPDATE usuarios SET ${papel} = ?, enquadramento = ? WHERE id = ?`)
    .run(nome, enquadramento, Number(usuarioId));

export const lerEnquadramento = (db, usuarioId) =>
  db.prepare('SELECT enquadramento FROM usuarios WHERE id = ?').get(Number(usuarioId))?.enquadramento ?? null;

export const guardarEnquadramento = (db, usuarioId, enquadramento) =>
  db.prepare('UPDATE usuarios SET enquadramento = ? WHERE id = ?').run(enquadramento, Number(usuarioId));

// --- presença ---------------------------------------------------------------

export const anotarSinal = (db, usuarioId, agora) =>
  db.prepare('UPDATE usuarios SET visto_em = ? WHERE id = ?').run(agora, usuarioId);

export const anotarStatus = (db, usuarioId, status, agora) =>
  db.prepare('UPDATE usuarios SET status = ?, visto_em = ? WHERE id = ?').run(status, agora, usuarioId);

export const lerPresenca = (db, usuarioId) =>
  db.prepare('SELECT status, visto_em FROM usuarios WHERE id = ?').get(usuarioId) ?? null;

/** Fechar o app apaga o sinal: sem isto a pessoa fica online até o silêncio vencer. */
export const apagarSinal = (db, usuarioId) =>
  db.prepare('UPDATE usuarios SET visto_em = NULL WHERE id = ?').run(usuarioId);

// --- o que é da Saga inteira ------------------------------------------------

export const ehDono = (db, usuarioId) =>
  !!db.prepare('SELECT dono FROM usuarios WHERE id = ?').get(Number(usuarioId))?.dono;

export const quantosDonos = (db) =>
  db.prepare('SELECT count(*) c FROM usuarios WHERE dono = 1').get().c;

export const definirDono = (db, usuarioId) =>
  db.prepare('UPDATE usuarios SET dono = 1 WHERE id = ?').run(usuarioId);

export const definirTurbo = (db, usuarioId, ligado) =>
  db.prepare('UPDATE usuarios SET turbo = ? WHERE id = ?').run(ligado ? 1 : 0, Number(usuarioId));

/** Todas as contas, com em quantos servidores cada uma está. Para o painel do dono. */
export const listarComContagem = (db) =>
  db.prepare(`
    SELECT u.id, u.apelido, u.foto, u.turbo, u.dono, u.criado_em,
           (SELECT count(*) FROM membros m WHERE m.usuario_id = u.id) AS servidores
      FROM usuarios u ORDER BY u.apelido COLLATE NOCASE`).all();
