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
  };
  const escrevendoFora = [];
  for (const arquivo of readdirSync(join(AQUI, 'repositorios')).filter((f) => f.endsWith('.mjs'))) {
    const minha = arquivo.replace('.mjs', '');
    const texto = readFileSync(join(AQUI, 'repositorios', arquivo), 'utf8');
    for (const m of texto.matchAll(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/g)) {
      const tabela = m[1];
      if (tabela === minha || (excecoes[arquivo] ?? []).includes(tabela)) continue;
      escrevendoFora.push(`${arquivo} escreve em ${tabela}`);
    }
  }
  assert.deepEqual(escrevendoFora, [], 'repositório escrevendo na tabela de outro');
});
