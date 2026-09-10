/**
 * A tabela `membros`: o VÍNCULO entre uma pessoa e um servidor.
 *
 * Cargo, nome exibido, identificador, banimento e castigo pertencem ao vínculo, não à
 * conta — é o que permite a mesma pessoa ser moderadora num servidor e membro no vizinho.
 * O Berserk é a exceção e mora em `usuarios`: cargo é de cada servidor, Berserk é da Saga
 * inteira.
 *
 * A leitura junta conta + vínculo + cargo numa linha só, que é como o app quer ver a
 * pessoa. Quem transforma isso no cargo efetivo — inclusive o "quem criou o servidor está
 * acima de todos" — é `membros.mjs`, uma camada acima: isto aqui devolve a linha crua.
 */

/**
 * `criou_o_servidor` sai daqui e não de um cargo, porque mandar é ter criado: editar o
 * cargo de alguém no banco não pode deixar um servidor sem quem o conserte.
 */
const SELECT = `
  SELECT u.id, u.apelido, u.foto, u.banner, u.enquadramento, u.dono, u.status, u.visto_em,
         m.servidor_id, m.entrou_em, m.banido_em, m.banido_por, m.silenciado_ate,
         u.turbo, m.id_exibido, m.cargo_id,
         c.nome AS cargo_nome, c.cor AS cargo_cor, c.nivel AS cargo_nivel,
         c.permissoes AS cargo_permissoes, (s.criado_por = m.usuario_id) AS criou_o_servidor,
         COALESCE(NULLIF(m.nome_exibido, ''), u.apelido) AS nome
    FROM membros m
    JOIN usuarios u ON u.id = m.usuario_id
    JOIN servidores s ON s.id = m.servidor_id
    LEFT JOIN cargos c ON c.id = m.cargo_id`;

export const buscar = (db, servidorId, usuarioId) =>
  db.prepare(`${SELECT} WHERE m.servidor_id = ? AND m.usuario_id = ?`).get(servidorId, usuarioId) ?? null;

/** Por cargo (do mais alto para o mais baixo) e depois por nome, que é a ordem da tela. */
export const listar = (db, servidorId) =>
  db.prepare(`${SELECT} WHERE m.servidor_id = ? ORDER BY c.nivel DESC, nome COLLATE NOCASE`).all(servidorId);

export const inserir = (db, { servidorId, usuarioId, cargoId, nivel, entrouEm }) =>
  db.prepare('INSERT INTO membros (servidor_id, usuario_id, cargo, cargo_id, entrou_em) VALUES (?, ?, ?, ?, ?)')
    .run(servidorId, usuarioId, nivel, cargoId, entrouEm);

export const apagar = (db, servidorId, usuarioId) =>
  db.prepare('DELETE FROM membros WHERE servidor_id = ? AND usuario_id = ?').run(servidorId, usuarioId);

export const temAlgumVinculo = (db, usuarioId) =>
  db.prepare('SELECT count(*) c FROM membros WHERE usuario_id = ?').get(usuarioId).c > 0;

/** Um servidor qualquer em que a pessoa esteja — inclusive um de que ela foi banida. */
export const qualquerServidor = (db, usuarioId) =>
  db.prepare('SELECT servidor_id FROM membros WHERE usuario_id = ? LIMIT 1').get(usuarioId)?.servidor_id ?? null;

/** Se a pessoa já tem vínculo aqui, e se ele está banido. Para o convite decidir. */
export const situacao = (db, servidorId, usuarioId) =>
  db.prepare('SELECT banido_em FROM membros WHERE servidor_id = ? AND usuario_id = ?')
    .get(servidorId, usuarioId) ?? null;

export const mudarNomeExibido = (db, servidorId, usuarioId, nome) =>
  db.prepare('UPDATE membros SET nome_exibido = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(nome, servidorId, usuarioId);

export const definirIdExibido = (db, servidorId, usuarioId, id) =>
  db.prepare('UPDATE membros SET id_exibido = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(id, servidorId, usuarioId);

/** A coluna `cargo` acompanha o nível: ela ainda é a fonte da migração de bancos velhos. */
export const definirCargo = (db, servidorId, usuarioId, { cargoId, nivel }) =>
  db.prepare('UPDATE membros SET cargo_id = ?, cargo = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(cargoId, nivel, servidorId, usuarioId);

export const banir = (db, servidorId, usuarioId, { quando, porQuem }) =>
  db.prepare('UPDATE membros SET banido_em = ?, banido_por = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(quando, porQuem, servidorId, usuarioId);

export const desbanir = (db, servidorId, usuarioId) =>
  db.prepare('UPDATE membros SET banido_em = NULL, banido_por = NULL WHERE servidor_id = ? AND usuario_id = ?')
    .run(servidorId, usuarioId);

export const silenciarAte = (db, servidorId, usuarioId, quando) =>
  db.prepare('UPDATE membros SET silenciado_ate = ? WHERE servidor_id = ? AND usuario_id = ?')
    .run(quando, servidorId, usuarioId);

export const tirarSilencio = (db, servidorId, usuarioId) =>
  db.prepare('UPDATE membros SET silenciado_ate = NULL WHERE servidor_id = ? AND usuario_id = ?')
    .run(servidorId, usuarioId);

/** Quem estava num cargo que acabou de ser apagado volta para o mais baixo. */
export const trocarCargoDeTodos = (db, servidorId, cargoAntigo, { cargoId, nivel }) =>
  db.prepare('UPDATE membros SET cargo_id = ?, cargo = ? WHERE servidor_id = ? AND cargo_id = ?')
    .run(cargoId, nivel, servidorId, cargoAntigo);
