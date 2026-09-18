import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaiComoImagem, arquivoColado, LIMITE_DA_IMAGEM } from './anexos.ts';

const arquivo = (name: string, type: string, size = 100) => ({ name, type, size }) as unknown as File;

test('PNG, JPG, GIF e WEBP aparecem na conversa', () => {
  for (const tipo of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    assert.equal(vaiComoImagem({ type: tipo, size: 1000 }), true, tipo);
  }
});

test('o resto continua cartão de baixar — o servidor recusaria como imagem', () => {
  assert.equal(vaiComoImagem({ type: 'image/heic', size: 1000 }), false);
  assert.equal(vaiComoImagem({ type: 'image/svg+xml', size: 1000 }), false, 'svg tem script dentro');
  assert.equal(vaiComoImagem({ type: 'application/zip', size: 1000 }), false);
  assert.equal(vaiComoImagem({ type: '', size: 1000 }), false);
});

test('imagem acima do teto vai como arquivo, em vez de ser recusada', () => {
  assert.equal(vaiComoImagem({ type: 'image/png', size: LIMITE_DA_IMAGEM }), true);
  assert.equal(vaiComoImagem({ type: 'image/png', size: LIMITE_DA_IMAGEM + 1 }), false);
  assert.equal(vaiComoImagem({ type: 'image/png', size: 0 }), false);
});

test('colar um print traz o arquivo', () => {
  const print = arquivo('image.png', 'image/png');
  assert.equal(arquivoColado({ files: [print] }), print);
});

test('colar só texto não traz nada, e o campo recebe o texto', () => {
  assert.equal(arquivoColado({ files: [], items: [{ kind: 'string', getAsFile: () => null }] }), null);
  assert.equal(arquivoColado(null), null);
});

test('com vários arquivos, a imagem vem primeiro', () => {
  const doc = arquivo('a.pdf', 'application/pdf');
  const img = arquivo('b.jpg', 'image/jpeg');
  assert.equal(arquivoColado({ files: [doc, img] }), img);
});

test('sem `files`, o arquivo sai dos itens', () => {
  const img = arquivo('image.png', 'image/png');
  assert.equal(arquivoColado({ items: [{ kind: 'string', getAsFile: () => null }, { kind: 'file', getAsFile: () => img }] }), img);
});
