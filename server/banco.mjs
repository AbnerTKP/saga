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

// Cada migração roda uma vez, em ordem, e fica registrada pela POSIÇÃO na lista. Por isso
// nunca se edita, remove ou insere no meio: acrescenta-se no fim, sempre. Inserir no meio
// faz a produção considerar aplicada uma migração que nunca rodou, e a seguinte quebra
// contra um banco pela metade — foi o que aconteceu ao acrescentar a tabela de sons.
// O teste em banco.test.mjs trava essa ordem justamente para isso não se repetir.
export const MIGRACOES = [
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

  // Sons do soundboard. O arquivo é content-addressed como as imagens; aqui fica só o
  // nome que as pessoas veem e quem subiu.
  `CREATE TABLE sons (
     id          INTEGER PRIMARY KEY,
     servidor_id INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
     nome        TEXT    NOT NULL,
     arquivo     TEXT    NOT NULL,
     enviado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
     criado_em   INTEGER NOT NULL
   )`,
  `CREATE INDEX sons_servidor ON sons(servidor_id)`,

  // Vorcaro Turbo: distinção que o dono concede. Destrava nome em arco-íris e imagem
  // animada no perfil.
  `ALTER TABLE membros ADD COLUMN turbo INTEGER NOT NULL DEFAULT 0`,
  // Identificador curto que aparece antes do nome, no gosto da casa. Texto, não número:
  // "007" precisa continuar "007", e o dono pode querer letra.
  `ALTER TABLE membros ADD COLUMN id_exibido TEXT`,

  // Salas passam a ter tipo. As que existiam são de voz, que era o único tipo.
  `ALTER TABLE salas ADD COLUMN tipo TEXT NOT NULL DEFAULT 'voz'`,

  // Mensagens deixam de morrer com a sala vazia. Antes viviam só na memória de quem
  // estava dentro, porque não havia banco; agora há.
  `CREATE TABLE mensagens (
     id         INTEGER PRIMARY KEY,
     sala_id    INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
     usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
     texto      TEXT    NOT NULL,
     criado_em  INTEGER NOT NULL
   )`,
  `CREATE INDEX mensagens_sala ON mensagens(sala_id, id)`,
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
 * Garante que o servidor existe. As salas do .env servem só para semear o primeiro
 * arranque: depois disso quem manda é o dono, pela tela.
 *
 * Semear a cada reinício faria uma sala apagada voltar sozinha — e ninguém entenderia
 * por quê, porque a reinicialização acontece longe do clique que a apagou.
 */
export function garantirServidor(db, { nome, salas }) {
  let servidor = db.prepare('SELECT * FROM servidores ORDER BY id LIMIT 1').get();
  if (!servidor) {
    const info = db.prepare('INSERT INTO servidores (nome, criado_em) VALUES (?, ?)').run(nome, Date.now());
    servidor = db.prepare('SELECT * FROM servidores WHERE id = ?').get(Number(info.lastInsertRowid));
  }

  const jaTem = db.prepare('SELECT count(*) c FROM salas WHERE servidor_id = ?').get(servidor.id).c;
  if (jaTem === 0) {
    const inserir = db.prepare('INSERT INTO salas (servidor_id, nome, ordem, tipo) VALUES (?, ?, ?, ?)');
    salas.forEach((nomeDaSala, i) => inserir.run(servidor.id, nomeDaSala, i, 'voz'));
  }
  return servidor;
}
