import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Todo .tsx do renderer: lida só uma pasta, um componente novo noutra escaparia calado. */
function todosOsTsx(pasta = import.meta.dirname): string[] {
  const achados: string[] = [];
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    if (e.isDirectory()) achados.push(...todosOsTsx(join(pasta, e.name)));
    else if (e.name.endsWith('.tsx')) achados.push(join(pasta, e.name));
  }
  return achados;
}

/**
 * No React 19, `dangerouslySetInnerHTML={{ __html: x }}` escrito no JSX refaz o innerHTML a CADA
 * desenho, mesmo com o texto igual — a comparação é pelo objeto. Na mesa do Catan isso refazia o
 * tabuleiro inteiro a cada leitura da partida. O objeto vem de `useHtml` ou `htmlFixo` (html.ts).
 */
test('nenhum dangerouslySetInnerHTML com o objeto escrito no JSX', () => {
  const erradas = todosOsTsx()
    .filter((a) => /dangerouslySetInnerHTML=\{\{/.test(readFileSync(a, 'utf8')))
    .map((a) => relative(import.meta.dirname, a));
  assert.deepEqual(erradas, [], `use useHtml/htmlFixo (html.ts) em: ${erradas.join(', ')}`);
});
