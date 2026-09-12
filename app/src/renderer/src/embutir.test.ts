import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { podeEmbutir } from './embutir.ts';

test('nenhum som dos avisos é embutido como data: — o CSP recusaria tocá-lo', () => {
  const pasta = join(import.meta.dirname, 'sons');
  const sons = readdirSync(pasta).filter((f) => !f.endsWith('.ts'));
  assert.ok(sons.length > 0);
  for (const som of sons) assert.equal(podeEmbutir(join(pasta, som)), false, som);
});

test('os três que caíam abaixo dos 4 KB, pelo nome', () => {
  for (const som of ['mic-ligou.ogg', 'mic-mutou.ogg', 'lance.ogg']) {
    assert.equal(podeEmbutir(`/x/sons/${som}`), false, som);
  }
});

test('o resto continua com a regra de sempre do Vite', () => {
  assert.equal(podeEmbutir('/x/marca.png'), undefined);
  assert.equal(podeEmbutir('/x/fontes/pecas.woff2'), undefined);
});
