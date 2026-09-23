/**
 * A tabela `mensagens`: o chat que não some.
 *
 * A leitura junta a mensagem com quem escreveu — foto, nome exibido, identificador e
 * Berserk —, e o `JOIN` com `membros` é por SERVIDOR: o nome exibido é do vínculo, então
 * a mesma mensagem mostra nomes diferentes em servidores diferentes.
 *
 * Quem apagou a conta vira `usuario_id NULL` e continua com a mensagem no lugar; quem
 * traduz isso para "alguém" (ou "Saga", na sala de notas) é a camada de cima.
 *
 * Mensagem APAGADA fica como linha vazia, com `apagada_em`: some das leituras e da conta
 * de não lidas, e é pela hora que as outras telas ficam sabendo que ela sumiu.
 */

const SELECT = `
  SELECT m.id, m.texto, m.imagem, m.arquivo, m.arquivo_nome, m.arquivo_bytes, m.bot, m.criado_em, m.usuario_id,
         COALESCE(NULLIF(mem.nome_exibido, ''), u.apelido) AS nome,
         u.foto, u.enquadramento, u.turbo, mem.id_exibido
    FROM mensagens m
    LEFT JOIN usuarios u   ON u.id = m.usuario_id
    LEFT JOIN membros  mem ON mem.usuario_id = m.usuario_id AND mem.servidor_id = ?`;

/** Da mais antiga para a mais nova, que é a ordem em que se lê. */
export const depoisDe = (db, servidorId, salaId, id, quantas) =>
  db.prepare(`${SELECT} WHERE m.sala_id = ? AND m.id > ? AND m.apagada_em IS NULL ORDER BY m.id LIMIT ?`)
    .all(servidorId, salaId, Number(id), quantas);

/** As últimas — a primeira busca do app, que traz o histórico visível. */
export const ultimas = (db, servidorId, salaId, quantas) =>
  db.prepare(`${SELECT} WHERE m.sala_id = ? AND m.apagada_em IS NULL ORDER BY m.id DESC LIMIT ?`)
    .all(servidorId, salaId, quantas).reverse();

/**
 * Uma mensagem mora numa SALA ou numa CONVERSA, nunca nas duas e nunca em nenhuma — quem
 * garante isso é o `CHECK` do esquema, e não a boa vontade de quem chama.
 */
export function inserir(db, { salaId = null, conversaId = null, usuarioId, texto, imagem, arquivo, bot = null, criadoEm }) {
  const info = db.prepare(
    `INSERT INTO mensagens (sala_id, conversa_id, usuario_id, texto, imagem, arquivo, arquivo_nome, arquivo_bytes, bot, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(salaId, conversaId, usuarioId, texto, imagem ?? null,
        arquivo?.nomeNoDisco ?? null, arquivo?.nome ?? null, arquivo?.bytes ?? null,
        bot ? JSON.stringify(bot) : null, criadoEm);
  return Number(info.lastInsertRowid);
}

/** As da própria pessoa não contam: "1 nova" pelo que você mesmo escreveu é ruído. */
export const contarDepoisDe = (db, salaId, desdeId, exceto) =>
  db.prepare('SELECT count(*) c FROM mensagens WHERE sala_id = ? AND id > ? AND usuario_id IS NOT ? AND apagada_em IS NULL')
    .get(Number(salaId), Number(desdeId) || 0, exceto ?? null).c;

/** Só os textos de uma sala. A sala de notas usa para saber o que já publicou. */
export const textosDaSala = (db, salaId) =>
  db.prepare('SELECT texto FROM mensagens WHERE sala_id = ?').all(salaId).map((m) => m.texto);

/** Sem autor: é a Saga falando na sala de notas, e não uma pessoa. */
export const inserirDaSaga = (db, { salaId, texto, criadoEm }) =>
  db.prepare('INSERT INTO mensagens (sala_id, usuario_id, texto, criado_em) VALUES (?, NULL, ?, ?)')
    .run(salaId, texto, criadoEm);

/** A mensagem crua, para decidir quem pode apagá-la: de onde é, e quem escreveu. */
export const buscar = (db, id) =>
  db.prepare('SELECT id, sala_id, conversa_id, usuario_id, apagada_em FROM mensagens WHERE id = ?')
    .get(Number(id)) ?? null;

/** Tira o conteúdo e anota quando e por quem. A linha fica, vazia — ver o cabeçalho. */
export const apagar = (db, id, { porQuem, quando }) =>
  db.prepare(`UPDATE mensagens
                 SET texto = '', imagem = NULL, arquivo = NULL, arquivo_nome = NULL, arquivo_bytes = NULL, bot = NULL,
                     apagada_em = ?, apagada_por = ?
               WHERE id = ? AND apagada_em IS NULL`)
    .run(quando, porQuem, Number(id));

// --- números, para a administração da Saga --------------------------------------
//
// Só contagem e hora: nenhuma destas leituras toca `texto`, `imagem` ou `arquivo`. A
// administração mostra como o servidor está montado, não a conversa — e o jeito de isso
// não vazar por descuido lá em cima é a coluna nem sair daqui.

/**
 * Por servidor: quantas, quantas desde `desde`, e a hora da última.
 *
 * Fora as apagadas e as de sala com PAPEL: a sala de notas é a Saga falando, e uma nota de
 * versão faria o servidor de casa parecer ativo sem ninguém ter escrito nada.
 */
export const resumoPorServidor = (db, desde) =>
  db.prepare(`
    SELECT s.servidor_id,
           count(*) AS total,
           count(CASE WHEN m.criado_em >= ? THEN 1 END) AS ultimos_7_dias,
           max(m.criado_em) AS ultima_em
      FROM mensagens m
      JOIN salas s ON s.id = m.sala_id
     WHERE m.apagada_em IS NULL AND s.papel IS NULL
     GROUP BY s.servidor_id`).all(Number(desde));

/** Por sala de um servidor: quantas e a hora da última, sem as apagadas. */
export const resumoPorSala = (db, servidorId) =>
  db.prepare(`
    SELECT m.sala_id, count(*) AS total, max(m.criado_em) AS ultima_em
      FROM mensagens m
      JOIN salas s ON s.id = m.sala_id
     WHERE s.servidor_id = ? AND m.apagada_em IS NULL
     GROUP BY m.sala_id`).all(servidorId);

/** As apagadas a partir de um instante — `>=`, porque repetir um id não custa nada e perder custa. */
export const apagadasDesde = (db, salaId, desde) =>
  db.prepare('SELECT id FROM mensagens WHERE sala_id = ? AND apagada_em >= ?')
    .all(Number(salaId), Number(desde)).map((m) => m.id);

// --- conversa privada --------------------------------------------------------
//
// O MESMO `SELECT`, com o servidor nulo. Isso não é economia de linhas: é o que faz a
// conversa privada mostrar a CONTA — sem servidor, o `JOIN` com `membros` não casa com
// vínculo nenhum, o nome cai no apelido e o identificador vem nulo. Que é exatamente o
// certo: cargo, nome exibido e identificador pertencem a um servidor, e aqui não há um.

export const daConversaDepoisDe = (db, conversaId, id, quantas) =>
  db.prepare(`${SELECT} WHERE m.conversa_id = ? AND m.id > ? AND m.apagada_em IS NULL ORDER BY m.id LIMIT ?`)
    .all(null, Number(conversaId), Number(id), quantas);

export const ultimasDaConversa = (db, conversaId, quantas) =>
  db.prepare(`${SELECT} WHERE m.conversa_id = ? AND m.apagada_em IS NULL ORDER BY m.id DESC LIMIT ?`)
    .all(null, Number(conversaId), quantas).reverse();

export const contarDaConversaDepoisDe = (db, conversaId, desdeId, exceto) =>
  db.prepare('SELECT count(*) c FROM mensagens WHERE conversa_id = ? AND id > ? AND usuario_id IS NOT ? AND apagada_em IS NULL')
    .get(Number(conversaId), Number(desdeId) || 0, exceto ?? null).c;

export const apagadasDaConversaDesde = (db, conversaId, desde) =>
  db.prepare('SELECT id FROM mensagens WHERE conversa_id = ? AND apagada_em >= ?')
    .all(Number(conversaId), Number(desde)).map((m) => m.id);
