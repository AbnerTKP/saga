import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ATALHO_PADRAO, atalhoAceito, encaixarNaTela, gravar, ler, TAMANHO_PADRAO, validar,
} from './overlay.ts';

const principal = { x: 0, y: 0, width: 1920, height: 1080 };

test('sem nada guardado, nasce no canto de cima à direita da tela principal', () => {
  const r = encaixarNaTela(null, [principal], principal);
  assert.deepEqual(r, { x: 1920 - TAMANHO_PADRAO.width - 24, y: 24, ...TAMANHO_PADRAO });
});

test('a posição guardada volta como estava', () => {
  const pedido = { x: 300, y: 200, width: 480, height: 270 };
  assert.deepEqual(encaixarNaTela(pedido, [principal], principal), pedido);
});

test('meio para fora da borda continua valendo — isso se faz de propósito', () => {
  const pedido = { x: 1920 - 200, y: 40, width: 480, height: 270 };
  assert.deepEqual(encaixarNaTela(pedido, [principal], principal), pedido);
});

test('num monitor que não existe mais, ele volta para o canto da tela principal', () => {
  // Estava na segunda tela, à direita; hoje só existe a principal.
  const pedido = { x: 2600, y: 300, width: 480, height: 270 };
  const r = encaixarNaTela(pedido, [principal], principal);
  assert.equal(r.x, 1920 - TAMANHO_PADRAO.width - 24);
  // E com a segunda tela de volta, ele fica onde estava.
  const duas = [principal, { x: 1920, y: 0, width: 1920, height: 1080 }];
  assert.deepEqual(encaixarNaTela(pedido, duas, principal), pedido);
});

test('tamanho absurdo é aparado, não descartado', () => {
  const r = encaixarNaTela({ x: 100, y: 100, width: 12, height: 9000 }, [principal], principal);
  assert.equal(r.width, 192);
  assert.equal(r.height, 1080);
});

test('atalho: aceita o que o Electron entende e recusa o resto', () => {
  assert.equal(atalhoAceito('Control+Shift+O'), 'Control+Shift+O');
  assert.equal(atalhoAceito('CommandOrControl+Shift+o'), 'CommandOrControl+Shift+O');
  assert.equal(atalhoAceito(' Alt + F9 '), 'Alt+F9');
  assert.equal(atalhoAceito('O'), null);              // tecla solta viraria atalho por acidente
  assert.equal(atalhoAceito('Contrl+Shift+O'), null); // modificador escrito errado
  assert.equal(atalhoAceito('Control+Shift+Çedilha'), null);
  assert.equal(atalhoAceito(''), null);
  assert.equal(atalhoAceito(42), null);
});

test('arquivo estragado não impede o overlay de abrir', () => {
  assert.deepEqual(validar('{'), { bounds: null, atalho: ATALHO_PADRAO });
  assert.deepEqual(validar({ bounds: { x: 1, y: 2 }, atalho: 'Control+Shift+O' }),
    { bounds: null, atalho: 'Control+Shift+O' });
  assert.deepEqual(validar({ bounds: null, atalho: 'lixo' }), { bounds: null, atalho: ATALHO_PADRAO });
});

test('grava e lê de volta', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'saga-overlay-'));
  assert.deepEqual(ler(pasta), { bounds: null, atalho: ATALHO_PADRAO });
  const g = { bounds: { x: 10, y: 20, width: 480, height: 270 }, atalho: 'Alt+F9' };
  assert.equal(gravar(pasta, g), true);
  assert.deepEqual(ler(pasta), g);
  writeFileSync(join(pasta, 'overlay.json'), 'nem json isto é');
  assert.deepEqual(ler(pasta), { bounds: null, atalho: ATALHO_PADRAO });
});
