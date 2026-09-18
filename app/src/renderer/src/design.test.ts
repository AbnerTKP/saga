import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { podeEmbutir } from './embutir.ts';

/**
 * As travas do design system. Regra escrita num comentário dura até o primeiro dia corrido;
 * regra que quebra o `pnpm test` dura. O CSS de antes tinha 279 cores escritas à mão, 131
 * valores diferentes, e metade delas nas telas de configuração — cada tela nova copiava a
 * vizinha e trazia um cinza a mais.
 */

const AQUI = import.meta.dirname;
const semComentario = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const COR_CRUA = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;

/** Todo .css do renderer, por glob: lista à mão falha em silêncio quando nasce um arquivo novo. */
function todosOsCss(pasta = AQUI): string[] {
  const achados: string[] = [];
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) achados.push(...todosOsCss(caminho));
    else if (e.name.endsWith('.css')) achados.push(caminho);
  }
  return achados;
}

const TOKENS = join(AQUI, 'tokens.css');
/** O CSS de antes, que ainda está sendo migrado. Não pode ganhar cor crua; só perder. */
const LEGADO = join(AQUI, 'styles.css');
/** Quantas cores cruas o styles.css ainda tem. Baixe este número ao migrar; nunca suba. */
const CORES_CRUAS_NO_LEGADO = 240;

test('cor escrita à mão só no tokens.css (e o styles.css não ganha nenhuma)', () => {
  for (const arquivo of todosOsCss()) {
    if (arquivo === TOKENS) continue;
    const cores = semComentario(readFileSync(arquivo, 'utf8')).match(COR_CRUA) ?? [];
    if (arquivo === LEGADO) {
      assert.ok(cores.length <= CORES_CRUAS_NO_LEGADO,
        `o styles.css passou de ${CORES_CRUAS_NO_LEGADO} para ${cores.length} cores cruas: use um token do tokens.css`);
    } else {
      assert.deepEqual(cores, [], `${arquivo} tem cor crua; use um token do tokens.css`);
    }
  }
});

/** Variáveis que o código escreve na hora (style={{ '--x': … }}), e não o CSS. */
const DA_HORA = new Set(['--cheio', '--nivel', '--corte', '--avisos-fundo', '--topo-da-janela', '--cor-do-cargo', '--fundo-da-presenca']);

test('toda var() sem reserva aponta para uma variável que existe', () => {
  const tudo = todosOsCss().map((a) => semComentario(readFileSync(a, 'utf8'))).join('\n');
  const definidas = new Set([...tudo.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const faltando = new Set<string>();
  for (const [, nome, reserva] of tudo.matchAll(/var\((--[\w-]+)\s*(,)?/g)) {
    if (!reserva && !definidas.has(nome) && !DA_HORA.has(nome)) faltando.add(nome);
  }
  assert.deepEqual([...faltando], [], `var() de variável que não existe (erro de digitação some sem aviso): ${[...faltando].join(', ')}`);
});

test('a escada de camadas está em ordem', () => {
  const t = readFileSync(TOKENS, 'utf8');
  const valor = (nome: string) => Number(t.match(new RegExp(`${nome}:\\s*(\\d+)`))?.[1]);
  const escada = ['--z-flutuante', '--z-versao-nova', '--z-painel', '--z-ver-imagem', '--z-menu', '--z-avisos', '--z-barra-da-janela', '--z-marca-da-versao'];
  const valores = escada.map(valor);
  assert.ok(valores.every(Number.isFinite), `degrau sem valor: ${escada.filter((_, i) => !Number.isFinite(valores[i])).join(', ')}`);
  for (let i = 1; i < valores.length; i++) {
    assert.ok(valores[i] > valores[i - 1], `${escada[i]} (${valores[i]}) tem de ficar acima de ${escada[i - 1]} (${valores[i - 1]})`);
  }
});

test('a fonte vai como arquivo do pacote, e existe', () => {
  const t = readFileSync(TOKENS, 'utf8');
  const url = t.match(/url\('\.\/(fontes\/[^']+)'\)/)?.[1];
  assert.ok(url, 'o @font-face do tokens.css aponta para um arquivo em fontes/');
  assert.ok(existsSync(join(AQUI, url)), `${url} não existe`);
  assert.equal(podeEmbutir(join(AQUI, url)), false, 'fonte embutida como data: o CSP recusa');
});
