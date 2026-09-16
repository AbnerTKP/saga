import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeAnimar } from './imagemParada.ts';

test('só GIF e WebP ganham quadro parado; foto comum vai como veio', () => {
  assert.equal(podeAnimar('http://76.13.225.79:3001/arquivos/e77680df3a5cc99029cdf4b96e018a52.gif'), true);
  assert.equal(podeAnimar('http://x/arquivos/65cf2af357f76635d04bcb4d931702d5.WEBP'), true);
  assert.equal(podeAnimar('http://x/arquivos/36da3900791a1bc703336061b392b1f9.jpg'), false);
  assert.equal(podeAnimar('http://x/arquivos/a.png'), false);
  assert.equal(podeAnimar('http://x/gif/a.png'), false);
  assert.equal(podeAnimar(null), false);
});
