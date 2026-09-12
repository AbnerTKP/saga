// Banco do servidor: SQLite embutido do Node, sem dependência nativa (o que mantém a
// imagem Docker sem compilador). O arquivo mora num volume, senão as contas somem a
// cada atualização.
//
// A modelagem já é de vários servidores, mesmo existindo um só hoje: a conta é global
// (apelido e senha valem em qualquer lugar) e tudo que é "aqui dentro" — nome exibido,
// cargo, banimento, castigo — vive na tabela de membros, que liga pessoa e servidor.
// Fazer isso depois significaria migrar dados de gente já cadastrada.
import { DatabaseSync } from 'node:sqlite';

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
     cargo          INTEGER NOT NULL DEFAULT 10,
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

  // Berserk: distinção que o dono concede. Destrava nome em arco-íris e imagem
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

  // Cargos de verdade, no lugar dos três níveis fixos. `nivel` mantém a hierarquia
  // (ninguém alcança um igual ou superior) e `permissoes` diz o que cada um faz.
  // O cargo de dono é marcado: ele tem tudo sempre, e não se edita nem se apaga.
  `CREATE TABLE cargos (
     id          INTEGER PRIMARY KEY,
     servidor_id INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
     nome        TEXT    NOT NULL,
     cor         TEXT,
     nivel       INTEGER NOT NULL,
     dono        INTEGER NOT NULL DEFAULT 0,
     permissoes  TEXT    NOT NULL DEFAULT '[]',
     criado_em   INTEGER NOT NULL
   )`,
  `CREATE INDEX cargos_servidor ON cargos(servidor_id, nivel DESC)`,
  // A coluna antiga `membros.cargo` fica: ela é a fonte da migração para cargo_id, e
  // apagar coluna em SQLite reescreve a tabela inteira sem ganho nenhum aqui.
  `ALTER TABLE membros ADD COLUMN cargo_id INTEGER REFERENCES cargos(id)`,

  // Convites para entrar num servidor. Sem eles, um servidor novo nasceria fechado e
  // sem jeito de chamar ninguém.
  `CREATE TABLE convites (
     codigo      TEXT    PRIMARY KEY,
     servidor_id INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
     criado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
     criado_em   INTEGER NOT NULL,
     expira_em   INTEGER,
     usos        INTEGER NOT NULL DEFAULT 0,
     max_usos    INTEGER
   )`,
  `CREATE INDEX convites_servidor ON convites(servidor_id)`,
  // Quem criou o servidor. Serve para não deixar o último dono sair e trancar todo mundo.
  `ALTER TABLE servidores ADD COLUMN criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`,

  // GIF no chat. A imagem é guardada como qualquer outra (nome = hash do conteúdo), e a
  // mensagem aponta para ela. Mensagem com imagem pode vir sem texto nenhum.
  `ALTER TABLE mensagens ADD COLUMN imagem TEXT`,

  // Enquadramento da foto e do banner: onde a imagem foi arrastada e o quanto foi
  // aproximada. O arquivo enviado não é tocado — recortar mataria a animação do GIF.
  `ALTER TABLE usuarios ADD COLUMN enquadramento TEXT`,

  // O Berserk é da CONTA, não do vínculo com um servidor. Ele nasceu em `membros`, e
  // isso fazia a mesma pessoa ser Berserk num servidor e não ser no vizinho — o que não
  // é o que ele significa: quem tem, tem na Saga. A coluna antiga fica onde está, morta:
  // migração publicada não se edita nem se remove, só se acrescenta.
  `ALTER TABLE usuarios ADD COLUMN turbo INTEGER NOT NULL DEFAULT 0`,
  // Ninguém perde o que já tinha: quem era Berserk em qualquer servidor passa a ser na conta.
  `UPDATE usuarios SET turbo = 1 WHERE id IN (SELECT usuario_id FROM membros WHERE turbo = 1)`,

  // Gavetas para as salas. A ordem é dentro da gaveta; as sem gaveta ficam no topo, que
  // é onde a pessoa espera achar o que não guardou em lugar nenhum.
  `CREATE TABLE categorias (
     id          INTEGER PRIMARY KEY,
     servidor_id INTEGER NOT NULL REFERENCES servidores(id) ON DELETE CASCADE,
     nome        TEXT    NOT NULL,
     ordem       INTEGER NOT NULL DEFAULT 0,
     criado_em   INTEGER NOT NULL
   )`,
  `CREATE INDEX categorias_servidor ON categorias(servidor_id)`,
  // Apagar a gaveta não leva as salas junto: some a categoria, a conversa fica.
  `ALTER TABLE salas ADD COLUMN categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL`,

  // Dono da SAGA, não de um servidor. É outra coisa do cargo chamado "Dono" que cada
  // servidor tem: aquele manda no servidor dele; este manda no app. Fica na conta porque
  // a conta é o que existe acima dos servidores.
  `ALTER TABLE usuarios ADD COLUMN dono INTEGER NOT NULL DEFAULT 0`,

  // Presença. `status` é o que a pessoa escolheu ou o que o app deduziu (ausente);
  // `visto_em` é o último sinal de vida, e é ele que separa "ausente" de "offline" —
  // status guardado sem sinal recente é lembrança, não presença.
  `ALTER TABLE usuarios ADD COLUMN status TEXT NOT NULL DEFAULT 'online'`,
  `ALTER TABLE usuarios ADD COLUMN visto_em INTEGER`,

  // O cargo "Dono" chumbado sai de cena. Mandar num servidor passa a vir de TER CRIADO
  // ele, e não de vestir um cargo — cargo é do pessoal de lá, e um cargo que o app
  // impõe aparece na lista como se alguém o tivesse feito.
  //
  // Antes de apagar, duas contas: quem estava nele é quem criou o servidor (é a única
  // pista que existe nos que foram semeados, onde `criado_por` ficou nulo), e essa
  // pessoa passa para o cargo mais alto que sobra, para não ficar sem nenhum.
  `UPDATE servidores SET criado_por = (SELECT m.usuario_id FROM membros m JOIN cargos c ON c.id = m.cargo_id WHERE m.servidor_id = servidores.id AND c.dono = 1 LIMIT 1) WHERE criado_por IS NULL`,
  `UPDATE membros SET cargo_id = (SELECT c2.id FROM cargos c2 WHERE c2.servidor_id = membros.servidor_id AND c2.dono = 0 ORDER BY c2.nivel DESC, c2.id LIMIT 1), cargo = (SELECT c2.nivel FROM cargos c2 WHERE c2.servidor_id = membros.servidor_id AND c2.dono = 0 ORDER BY c2.nivel DESC, c2.id LIMIT 1) WHERE cargo_id IN (SELECT id FROM cargos WHERE dono = 1)`,
  `DELETE FROM cargos WHERE dono = 1`,

  // Uma sala pode ter um PAPEL: hoje só 'notas', a das novidades de cada versão. Ela é
  // do app e não do servidor — por isso não se renomeia, não se apaga e fica no topo.
  `ALTER TABLE salas ADD COLUMN papel TEXT`,

  // Arquivo no chat. Três colunas porque são três coisas diferentes: o nome NO DISCO (o
  // hash, que é o que se serve), o nome que a pessoa escolheu (que é o que se mostra e o
  // que se sugere ao salvar) e o tamanho (para dizer o peso sem abrir o arquivo).
  `ALTER TABLE mensagens ADD COLUMN arquivo TEXT`,
  `ALTER TABLE mensagens ADD COLUMN arquivo_nome TEXT`,
  `ALTER TABLE mensagens ADD COLUMN arquivo_bytes INTEGER`,

  // Sala privada: quem vê é decidido por CARGO, e não por pessoa.
  //
  // Privada aqui quer dizer INVISÍVEL para quem não pode: uma sala trancada que aparece
  // na lista é um convite a perguntar "por que eu não entro aí?", e o assunto que fez
  // alguém criar a sala é justamente o que não se quer anunciar. Quem criou o servidor
  // enxerga todas — é a saída para uma sala que ficou sem nenhum cargo por engano.
  //
  // Por cargo e não por pessoa porque é assim que o resto do servidor pensa: cargo novo,
  // pessoa que muda de cargo e pessoa que chega herdam o acesso sem ninguém refazer lista.
  `ALTER TABLE salas ADD COLUMN privada INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE sala_cargos (
     sala_id INTEGER NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
     cargo_id INTEGER NOT NULL REFERENCES cargos(id) ON DELETE CASCADE,
     PRIMARY KEY (sala_id, cargo_id)
   )`,
  `CREATE INDEX sala_cargos_sala ON sala_cargos(sala_id)`,

  // Apagar mensagem. A linha fica, vazia, com a hora e quem apagou: é por essa hora que as
  // outras telas ficam sabendo que ela sumiu — ver `apagarMensagem`.
  `ALTER TABLE mensagens ADD COLUMN apagada_em INTEGER`,
  `ALTER TABLE mensagens ADD COLUMN apagada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`,
  `CREATE INDEX mensagens_apagadas ON mensagens(sala_id, apagada_em) WHERE apagada_em IS NOT NULL`,

  // `convidar` nasceu depois dos cargos que o pessoal já criou, e cargo que existe não
  // ganha permissão nova sozinho. Mexer só no padrão do cargo NOVO seria repetir o erro do
  // BEN 10: conserto que depende de cada dono ir marcar a caixinha à mão não é conserto —
  // o Druidax continuaria sem convidar. Então todo cargo que existe hoje ganha, que é o
  // padrão do Discord (@everyone convida); quem não quiser, desmarca no editor de cargos.
  `UPDATE cargos
      SET permissoes = json_insert(CASE WHEN json_valid(permissoes) THEN permissoes ELSE '[]' END,
                                   '$[#]', 'convidar')
    WHERE permissoes NOT LIKE '%"convidar"%'`,

  // Amizade. A conversa privada só existe entre amigos, e amigo só com pedido aceito —
  // saber o apelido de alguém dá o direito de BATER na porta, não o de entrar.
  //
  // A linha é UMA por par, com os ids ordenados (`a` é sempre o menor): uma amizade é de
  // duas pessoas, não de uma para a outra. Guardando uma linha por direção, A→B e B→A
  // podiam existir ao mesmo tempo — dois pedidos cruzados que nunca viravam amizade, e
  // duas verdades sobre o mesmo par. Quem pediu fica na COLUNA `pedido_de`, que é a única
  // coisa que tem direção aqui.
  `CREATE TABLE amizades (
     a          INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     b          INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     pedido_de  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     estado     TEXT    NOT NULL DEFAULT 'pedido',
     criada_em  INTEGER NOT NULL,
     aceita_em  INTEGER,
     PRIMARY KEY (a, b)
   )`,
  // A chave primária já indexa quem procura por `a`; quem procura por `b` — "quem me
  // chamou?" — precisaria varrer a tabela inteira sem isto.
  `CREATE INDEX amizades_b ON amizades(b)`,

  // A conversa privada. Ela é da CONTA e não de servidor nenhum: sair do servidor onde
  // vocês se conheceram não apaga o que foi dito. Por isso não mora em `salas`, que
  // pertencem a um servidor.
  //
  // A tabela de pessoas é separada, com uma linha por participante, e não duas colunas:
  // é o que permitirá conversa de três sem migrar o que já existe.
  `CREATE TABLE conversas (id INTEGER PRIMARY KEY, criada_em INTEGER NOT NULL)`,
  `CREATE TABLE conversa_pessoas (
     conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
     usuario_id  INTEGER NOT NULL REFERENCES usuarios(id)  ON DELETE CASCADE,
     PRIMARY KEY (conversa_id, usuario_id)
   )`,
  `CREATE INDEX conversa_pessoas_usuario ON conversa_pessoas(usuario_id)`,

  // Uma mensagem passa a ser de uma SALA ou de uma CONVERSA.
  //
  // Duas tabelas de mensagem seriam escrever duas vezes tudo o que uma mensagem sabe
  // fazer — anexo, GIF, apagar com hora, contagem de não lidas — e a segunda
  // envelheceria em silêncio, que foi o que o SQL espalhado por treze arquivos ensinou.
  // Então a coluna nova entra aqui, e `sala_id` passa a aceitar nulo.
  //
  // Relaxar um NOT NULL no SQLite é RECONSTRUIR a tabela: não há ALTER COLUMN. O `CHECK`
  // é o que impede a linha sem dono e a linha com dois donos — a regra de que uma
  // mensagem mora num lugar só passa a ser do banco, e não da boa vontade de quem
  // escreve o INSERT. Medido antes de escrever isto, com dados dentro: 4 mensagens entram
  // e saem idênticas campo a campo, `foreign_key_check` vazio, os índices refeitos, a
  // cascata de apagar a sala intacta, e as duas buscas usando índice.
  `CREATE TABLE mensagens_nova (
     id            INTEGER PRIMARY KEY,
     sala_id       INTEGER REFERENCES salas(id)     ON DELETE CASCADE,
     conversa_id   INTEGER REFERENCES conversas(id) ON DELETE CASCADE,
     usuario_id    INTEGER REFERENCES usuarios(id)  ON DELETE SET NULL,
     texto         TEXT    NOT NULL,
     criado_em     INTEGER NOT NULL,
     imagem        TEXT,
     arquivo       TEXT,
     arquivo_nome  TEXT,
     arquivo_bytes INTEGER,
     apagada_em    INTEGER,
     apagada_por   INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
     CHECK ((sala_id IS NULL) <> (conversa_id IS NULL))
   );
   INSERT INTO mensagens_nova (id, sala_id, conversa_id, usuario_id, texto, criado_em,
                               imagem, arquivo, arquivo_nome, arquivo_bytes, apagada_em, apagada_por)
        SELECT id, sala_id, NULL, usuario_id, texto, criado_em,
               imagem, arquivo, arquivo_nome, arquivo_bytes, apagada_em, apagada_por
          FROM mensagens;
   DROP TABLE mensagens;
   ALTER TABLE mensagens_nova RENAME TO mensagens;
   CREATE INDEX mensagens_sala ON mensagens(sala_id, id);
   CREATE INDEX mensagens_conversa ON mensagens(conversa_id, id);
   CREATE INDEX mensagens_apagadas ON mensagens(sala_id, apagada_em) WHERE apagada_em IS NOT NULL;
   CREATE INDEX mensagens_apagadas_conversa ON mensagens(conversa_id, apagada_em) WHERE apagada_em IS NOT NULL`,
];

export function abrirBanco(caminho) {
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA journal_mode = WAL');   // leitura e escrita ao mesmo tempo
  db.exec('PRAGMA foreign_keys = ON');    // ON DELETE CASCADE só vale com isto ligado
  // Com WAL, `NORMAL` é a recomendação da própria SQLite: o fsync deixa de acontecer a
  // cada transação e passa a acontecer no checkpoint. O que se arrisca é perder as
  // últimas transações numa queda de energia — nunca o banco corrompido, que é o que
  // `FULL` protege a mais. Perder os últimos segundos de conversa numa queda de luz é
  // aceitável; esperar o disco a cada pedido, numa VPS de um núcleo, não era.
  db.exec('PRAGMA synchronous = NORMAL');
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

  garantirCargos(db, servidor.id);

  const jaTem = db.prepare('SELECT count(*) c FROM salas WHERE servidor_id = ?').get(servidor.id).c;
  if (jaTem === 0) {
    const inserir = db.prepare('INSERT INTO salas (servidor_id, nome, ordem, tipo) VALUES (?, ?, ?, ?)');
    salas.forEach((nomeDaSala, i) => inserir.run(servidor.id, nomeDaSala, i, 'voz'));
  }
  return servidor;
}

/**
 * Os cargos com que um servidor começa.
 *
 * Não há "Dono" aqui, e é de propósito: quem manda é quem CRIOU o servidor, e isso está
 * em `servidores.criado_por`. Um cargo de dono imposto pelo app aparecia na lista de
 * cargos como se o pessoal de lá o tivesse feito — e ninguém podia apagá-lo nem
 * renomeá-lo. Os dois abaixo são só um ponto de partida, e dá para mexer em tudo.
 */
const CARGOS_INICIAIS = [
  {
    nome: 'Moderador', nivel: 50, dono: 0, cor: '#3f7fe0',
    permissoes: ['mutar', 'desconectar', 'timeout', 'expulsar', 'gerirSons', 'apagarMensagens', 'convidar'],
  },
  // O Membro nasce podendo convidar, como o @everyone do Discord: trazer um amigo é o que
  // mais se faz num servidor de amigos, e quem não quiser desmarca no cargo. A alternativa
  // — só o topo convida — é o que fazia o Druidax, moderador, depender do Blankito.
  { nome: 'Membro', nivel: 10, dono: 0, cor: null, permissoes: ['convidar'] },
];

/**
 * Cria os cargos do servidor na primeira vez e liga cada membro ao seu, a partir do
 * nível numérico antigo. Idempotente: rodar de novo não mexe no que o dono ajustou.
 *
 * Fica aqui, e não numa migração, porque migração roda uma vez por banco — e um servidor
 * criado depois precisaria dos cargos do mesmo jeito.
 */
export function garantirCargos(db, servidorId) {
  const quantos = db.prepare('SELECT count(*) c FROM cargos WHERE servidor_id = ?').get(servidorId).c;
  if (quantos === 0) {
    const inserir = db.prepare(
      'INSERT INTO cargos (servidor_id, nome, cor, nivel, dono, permissoes, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const c of CARGOS_INICIAIS) {
      inserir.run(servidorId, c.nome, c.cor, c.nivel, c.dono, JSON.stringify(c.permissoes), Date.now());
    }
  }

  // Liga quem ainda não tem cargo, casando pelo nível antigo. Quem já tem fica como está.
  const porNivel = db.prepare('SELECT id, nivel FROM cargos WHERE servidor_id = ?').all(servidorId);
  const maisAlto = (nivel) =>
    porNivel.filter((c) => c.nivel <= nivel).sort((a, b) => b.nivel - a.nivel)[0]
    ?? porNivel.sort((a, b) => a.nivel - b.nivel)[0];

  const semCargo = db.prepare(
    'SELECT usuario_id, cargo FROM membros WHERE servidor_id = ? AND cargo_id IS NULL',
  ).all(servidorId);
  const ligar = db.prepare('UPDATE membros SET cargo_id = ? WHERE servidor_id = ? AND usuario_id = ?');
  for (const m of semCargo) ligar.run(maisAlto(m.cargo).id, servidorId, m.usuario_id);
}
