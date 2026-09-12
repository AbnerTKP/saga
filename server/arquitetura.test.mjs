/**
 * A arrumação do servidor, conferida por teste.
 *
 * Regra escrita num LEIA-ME dura até o primeiro dia corrido; regra que falha no `pnpm test`
 * dura. Estas duas são o que torna a troca por um ORM uma mudança local em vez de uma
 * reescrita: se o SQL voltar a vazar para as rotas e para as regras, a promessa acaba —
 * e acaba em silêncio, que é como essas coisas acabam.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Quem pode escrever SQL fora dos repositórios, e por quê:
 *
 * - `banco.mjs` é dono do ESQUEMA e das migrações. Migração é SQL por definição, e a
 *   lista posicional dela não pode nem ser reordenada — muito menos escondida atrás de
 *   uma camada.
 * - os próprios testes, que montam cenário e conferem o banco por fora.
 */
const PODEM = new Set(['banco.mjs']);

const arquivosDoServidor = () =>
  readdirSync(AQUI).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));

test('SQL só mora nos repositórios', () => {
  const vazaram = [];
  for (const arquivo of arquivosDoServidor()) {
    if (PODEM.has(arquivo)) continue;
    const texto = readFileSync(join(AQUI, arquivo), 'utf8');
    const quantas = (texto.match(/\.prepare\(/g) ?? []).length;
    if (quantas > 0) vazaram.push(`${arquivo} (${quantas})`);
  }
  assert.deepEqual(
    vazaram, [],
    'consulta fora de repositorios/ — o SQL de uma tabela mora no arquivo dela, senão a '
    + 'mesma consulta nasce duas vezes e a troca por um ORM volta a ser uma reescrita',
  );
});

test('repositório não conhece regra de negócio', () => {
  // Repositório não pergunta "pode?": ele lê e escreve. Quem pergunta é `permissoes.mjs`,
  // e quem decide o que a tela vê é a camada de cima. Sem isto, a regra volta a se
  // misturar com o banco — que é exatamente o que esta pasta desfez.
  const proibidos = ['permissoes.mjs', 'contas.mjs', 'membros.mjs', 'cargos.mjs', 'salas.mjs'];
  const errados = [];
  for (const arquivo of readdirSync(join(AQUI, 'repositorios')).filter((f) => f.endsWith('.mjs'))) {
    const texto = readFileSync(join(AQUI, 'repositorios', arquivo), 'utf8');
    for (const proibido of proibidos) {
      if (texto.includes(`from '../${proibido}'`)) errados.push(`${arquivo} → ${proibido}`);
    }
  }
  assert.deepEqual(errados, [], 'repositório importando regra: a regra é de quem chama, não da tabela');
});

/**
 * As formas de ESCREVER numa tabela, e o nome dela logo depois.
 *
 * Era `INSERT INTO|UPDATE|DELETE FROM`, e `INSERT OR REPLACE INTO` — que a recuperação de
 * senha usa — passava sem ser lido: a conferência abaixo ficava verde para um repositório
 * escrevendo na tabela de outro, desde que escrevesse desse jeito. Continua sensível a
 * maiúsculas, para não pescar "update" de comentário.
 */
const ESCRITA = /(?:INSERT(?:\s+OR\s+[A-Z]+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+[A-Z]+)?|DELETE\s+FROM)\s+(\w+)/g;
const tabelasEscritas = (texto) => [...texto.matchAll(ESCRITA)].map((m) => m[1]);

test('a conferência de escrita enxerga toda forma de escrever do SQLite', () => {
  assert.deepEqual(tabelasEscritas('INSERT INTO membros (x)'), ['membros']);
  assert.deepEqual(tabelasEscritas('INSERT OR REPLACE INTO membros (x)'), ['membros']);
  assert.deepEqual(tabelasEscritas('INSERT OR IGNORE INTO membros (x)'), ['membros']);
  assert.deepEqual(tabelasEscritas('REPLACE INTO membros (x)'), ['membros']);
  assert.deepEqual(tabelasEscritas('UPDATE OR IGNORE membros SET x = 1'), ['membros']);
  assert.deepEqual(tabelasEscritas(`DELETE
     FROM membros`), ['membros']);
  assert.deepEqual(tabelasEscritas('// update do cargo, sem SQL nenhum'), []);
});

test('cada repositório é de UMA tabela', () => {
  // O nome do arquivo é a tabela. Um repositório que escreve em duas tabelas esconde
  // dependência — foi assim que apagar um cargo mexia em `membros` sem dizer.
  const excecoes = {
    // A leitura de membros junta conta, servidor e cargo numa linha só: é o que o app
    // quer ver, e um JOIN não é escrever noutra tabela.
    'membros.mjs': ['usuarios', 'servidores', 'cargos'],
    'mensagens.mjs': ['usuarios', 'membros'],
    'sons.mjs': ['usuarios', 'membros'],
    'salas.mjs': ['categorias'],
    'servidores.mjs': ['membros'],
    // Conversa e participantes nascem juntos: uma conversa sem ninguém dentro é uma linha
    // quebrada, e criar as duas coisas em lugares diferentes é abrir essa porta.
    'conversas.mjs': ['conversa_pessoas'],
  };
  const escrevendoFora = [];
  for (const arquivo of readdirSync(join(AQUI, 'repositorios')).filter((f) => f.endsWith('.mjs'))) {
    const minha = arquivo.replace('.mjs', '');
    const texto = readFileSync(join(AQUI, 'repositorios', arquivo), 'utf8');
    for (const tabela of tabelasEscritas(texto)) {
      if (tabela === minha || (excecoes[arquivo] ?? []).includes(tabela)) continue;
      escrevendoFora.push(`${arquivo} escreve em ${tabela}`);
    }
  }
  assert.deepEqual(escrevendoFora, [], 'repositório escrevendo na tabela de outro');
});
