import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nada anima para sempre com a Saga parada. Uma animação sem fim — um ponto de 6 px, um nome em
 * arco-íris — faz o macOS recompor a janela inteira a cada quadro: medido na Saga do dono, era o
 * processo de desenho e o da GPU perto de 100% cada um. Animação infinita só vale sob o mouse
 * (`:hover`), ou na lista abaixo, com o motivo de não custar nada parada.
 */
const PERMITIDAS: Record<string, string> = {
  // só existe enquanto alguém está digitando, e some sozinho alguns segundos depois
  '.pontinhos i': 'digitando',
};

/** Todo .css do renderer: lido só o styles.css, uma animação num arquivo novo escaparia calada. */
function todoOCss(pasta = import.meta.dirname): string {
  let css = '';
  for (const e of readdirSync(pasta, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    if (e.isDirectory()) css += todoOCss(join(pasta, e.name));
    else if (e.name.endsWith('.css')) css += readFileSync(join(pasta, e.name), 'utf8') + '\n';
  }
  return css;
}

test('animação infinita só com o mouse em cima (ou na lista, com motivo)', () => {
  const css = todoOCss().replace(/\/\*[\s\S]*?\*\//g, '');
  const erradas: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, seletores, corpo] = m;
    if (!/animation[^;]*infinite/.test(corpo)) continue;
    for (const s of seletores.split(',').map((x) => x.trim())) {
      if (s.includes(':hover') || s in PERMITIDAS) continue;
      erradas.push(s);
    }
  }
  assert.deepEqual(erradas, [], `animação que nunca para, sem hover: ${erradas.join(' | ')}`);
});
