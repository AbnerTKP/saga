// Banco do servidor: SQLite embutido do Node, sem dependência nativa (o que mantém a
// imagem Docker sem compilador). O arquivo mora num volume, senão as contas somem a
// cada atualização.
//
// A modelagem já é de vários servidores, mesmo existindo um só hoje: a conta é global
// (apelido e senha valem em qualquer lugar) e tudo que é "aqui dentro" — nome exibido,
// cargo, banimento, castigo — vive na tabela de membros, que liga pessoa e servidor.
// Fazer isso depois significaria migrar dados de gente já cadastrada.
import { DatabaseSync } from 'node:sqlite';
import { CARGO } from './cargos.mjs';

// Cada migração roda uma vez, em ordem, e fica registrada. Nunca edite uma que já subiu
// para produção: acrescente outra abaixo.
const MIGRACOES = [
  // Conta global: o apelido é a identidade de login e não muda.
  `CREATE TABLE usuarios (
     id            INTEGER PRIMARY KEY,
     apelido       TEXT    NOT NULL,
     apelido_chave TEXT    NOT NULL UNIQUE,   -- minúsculas: impede "Ana" e "ana" coexistirem
     senha_hash    TEXT    NOT NULL,
     email         TEXT,                      -- reservado: ainda não é pedido nem usado
     foto          TEXT,                      -- caminho do arquivo, quando houver
     banner        TEXT,
     criado_em     INTEGER NOT NULL
   )`,
  `CREATE UNIQUE INDEX usuarios_email ON usuarios(email) WHERE email IS NOT NULL`,

  `CREATE TABLE sessoes (
     token_hash TEXT PRIMARY KEY,             -- guarda-se o hash, nunca o token
     usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     criada_em  INTEGER NOT NULL,
     vista_em   INTEGER NOT NULL
   )`,
  `CREATE INDEX sessoes_usuario ON sessoes(usuario_id)`,

  `CREATE TABLE servidores (
     id        INTEGER PRIMARY KEY,
     nome      TEXT    NOT NULL,
     foto      TEXT,
     banner    TEXT,
     criado_em INTEGER NOT NULL
   )`,

  // O que é da pessoa *neste* servidor. Nome exibido vazio significa "usa o apelido".
  `CREATE TABLE membros (
     servidor_id    INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
     usuario_id     INTEGER NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
     nome_exibido   TEXT,
     cargo          INTEGER NOT NULL DEFAULT ${CARGO.MEMBRO},
     entrou_em      INTEGER NOT NULL,
     banido_em      INTEGER,
     banido_por     TEXT,
     silenciado_ate INTEGER,
     PRIMARY KEY (servidor_id, usuario_id)
   )`,

  // Salas deixam de vir do .env: assim o dono pode renomear e reordenar sem redeploy.
  `CREATE TABLE salas (
     id          INTEGER PRIMARY KEY,
     servidor_id INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
     nome        TEXT    NOT NULL,
     ordem       INTEGER NOT NULL DEFAULT 0,
     UNIQUE (servidor_id, nome)
   )`,
];

export function abrirBanco(caminho) {
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA journal_mode = WAL');   // leitura e escrita ao mesmo tempo
  db.exec('PRAGMA foreign_keys = ON');    // ON DELETE CASCADE só vale com isto ligado
  migrar(db);
  return db;
}

function migrar(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migracoes (n INTEGER PRIMARY KEY, aplicada_em INTEGER NOT NULL)');
  const feitas = new Set(db.prepare('SELECT n FROM migracoes').all().map((r) => r.n));
  for (const [i, sql] of MIGRACOES.entries()) {
    if (feitas.has(i)) continue;
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO migracoes (n, aplicada_em) VALUES (?, ?)').run(i, Date.now());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migração ${i} falhou: ${e.message}`);
    }
  }
}

/**
 * Garante que existe o servidor único de hoje, com as salas dadas. Idempotente:
 * não renomeia o servidor nem apaga salas, para não desfazer o que o dono ajustou.
 */
export function garantirServidor(db, { nome, salas }) {
  let servidor = db.prepare('SELECT * FROM servidores ORDER BY id LIMIT 1').get();
  if (!servidor) {
    const info = db.prepare('INSERT INTO servidores (nome, criado_em) VALUES (?, ?)').run(nome, Date.now());
    servidor = db.prepare('SELECT * FROM servidores WHERE id = ?').get(Number(info.lastInsertRowid));
  }
  const inserir = db.prepare('INSERT OR IGNORE INTO salas (servidor_id, nome, ordem) VALUES (?, ?, ?)');
  salas.forEach((nomeDaSala, i) => inserir.run(servidor.id, nomeDaSala, i));
  return servidor;
}
