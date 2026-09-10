/**
 * A tabela `sala_cargos`: quais CARGOS enxergam uma sala privada.
 *
 * É uma tabela de ligação, e por isso quase não tem código — mas tem arquivo próprio pela
 * mesma razão que as outras: quem quiser saber quem vê uma sala olha aqui, e quem trocar
 * o motor do banco troca aqui. Ela morre junto com a sala e junto com o cargo, pelo
 * `ON DELETE CASCADE`: cargo apagado não deixa acesso órfão para trás.
 */

export const daSala = (db, salaId) =>
  db.prepare('SELECT cargo_id FROM sala_cargos WHERE sala_id = ?').all(salaId).map((r) => r.cargo_id);

/** Todos os pares do servidor de uma vez: a lista de salas não pode perguntar sala a sala. */
export const doServidor = (db, servidorId) =>
  db.prepare(`
    SELECT sc.sala_id, sc.cargo_id FROM sala_cargos sc
      JOIN salas s ON s.id = sc.sala_id
     WHERE s.servidor_id = ?`).all(servidorId);

export const limpar = (db, salaId) =>
  db.prepare('DELETE FROM sala_cargos WHERE sala_id = ?').run(salaId);

/** `OR IGNORE`: mandar o mesmo cargo duas vezes não é erro, é a tela repetindo o estado. */
export const dar = (db, salaId, cargoId) =>
  db.prepare('INSERT OR IGNORE INTO sala_cargos (sala_id, cargo_id) VALUES (?, ?)').run(salaId, cargoId);
