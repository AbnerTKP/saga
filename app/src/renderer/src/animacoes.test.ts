import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

test('animação infinita só com o mouse em cima (ou na lista, com motivo)', () => {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
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
