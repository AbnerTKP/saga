import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AO_INICIAR, abriuComOSistema, anotarDecisao, deveLigarSozinho, jaDecidiu } from './inicio.ts';

const pastaDeTeste = () => mkdtempSync(join(tmpdir(), 'saga-inicio-'));

test('quem foi aberto pelo arranque do Windows chega com o argumento', () => {
  assert.equal(abriuComOSistema(['C:\\Saga.exe', AO_INICIAR]), true);
  assert.equal(abriuComOSistema(['C:\\Saga.exe']), false);
});

test('no Mac não há argumento: quem responde é o login', () => {
  assert.equal(abriuComOSistema(['/Applications/Saga.app'], true), true);
  assert.equal(abriuComOSistema(['/Applications/Saga.app'], false), false);
});

test('liga sozinho no Windows instalado, uma vez só', () => {
  const base = { plataforma: 'win32', empacotado: true, jaDecidiu: false };
  assert.equal(deveLigarSozinho(base), true);
  assert.equal(deveLigarSozinho({ ...base, jaDecidiu: true }), false, 'já decidiu: não mexe mais');
});

test('não liga sozinho em desenvolvimento nem fora do Windows', () => {
  assert.equal(deveLigarSozinho({ plataforma: 'win32', empacotado: false, jaDecidiu: false }), false);
  assert.equal(deveLigarSozinho({ plataforma: 'darwin', empacotado: true, jaDecidiu: false }), false);
  assert.equal(deveLigarSozinho({ plataforma: 'linux', empacotado: true, jaDecidiu: false }), false);
});

test('a decisão fica anotada, e anotada só se pergunta uma vez', () => {
  const pasta = pastaDeTeste();
  try {
    assert.equal(jaDecidiu(pasta), false);
    assert.equal(anotarDecisao(pasta, true), true);
    assert.equal(jaDecidiu(pasta), true);
    assert.equal(deveLigarSozinho({ plataforma: 'win32', empacotado: true, jaDecidiu: jaDecidiu(pasta) }), false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('sem conseguir anotar, não se liga nada', () => {
  const pasta = pastaDeTeste();
  try {
    // Um ARQUIVO no lugar da pasta: escrever lá dentro falha como falharia um disco cheio.
    const impossivel = join(pasta, 'arquivo');
    writeFileSync(impossivel, 'não sou pasta');
    assert.equal(anotarDecisao(impossivel, true), false);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
