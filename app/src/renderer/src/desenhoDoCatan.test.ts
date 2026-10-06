import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defs, ladrao, terreno } from './desenhoDoCatan.ts';
import { iconeDeConstruir } from './iconesDoCatan.ts';

const ids = (svg: string) => new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const referencias = (svg: string) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);

test('todo url(#…) do tabuleiro aponta para algo que existe', () => {
  // Uma referência solta não dá erro: o desenho só some. O ladrão antigo tinha o gradiente dele nos
  // `defs`; o novo traz o filtro e o recorte consigo — e o que sair de um lado não pode ficar no outro.
  const tudo = defs() + ladrao(0, 0, 60) + (['floresta', 'pasto', 'campo', 'colina', 'montanha', 'deserto'] as const).map((t) => terreno(t, 3)).join('');
  const existem = ids(tudo);
  for (const r of referencias(tudo)) assert.ok(existem.has(r), `url(#${r}) não existe`);
});

test('o ladrão é o mascarado: o contorno claro, as listras e a escala do tabuleiro', () => {
  const svg = ladrao(10, 20, 58);
  assert.match(svg, /^<g transform="translate\(10(\.0+)? 20(\.0+)?\) scale\(1(\.0+)?\)">/);
  assert.ok(svg.includes('filter="url(#ladrao-contorno)"'));
  assert.ok(svg.includes('clip-path="url(#ladrao-listras)"'));
});

test('os ícones de construir: um svg inteiro na cor de quem joga, sem id para colidir', () => {
  for (const tipo of ['estrada', 'aldeia', 'cidade'] as const) {
    const vermelho = iconeDeConstruir(tipo, '#d8453b');
    assert.match(vermelho, /^<svg viewBox="[-\d. ]+" xmlns="http:\/\/www.w3.org\/2000\/svg">/);
    assert.ok(vermelho.includes('#d8453b'), `${tipo} sem a cor de quem joga`);
    // A mesma peça aparece no botão e na cola ao mesmo tempo: id repetido na página quebraria uma delas.
    assert.equal(ids(vermelho).size, 0);
    assert.notEqual(iconeDeConstruir(tipo, '#3f7fe0'), vermelho);
    assert.equal(iconeDeConstruir(tipo, '#d8453b'), vermelho);
  }
});
