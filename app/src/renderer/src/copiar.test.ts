import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { copiarTexto } from './copiar.ts';

test('copiou só quando a ponte respondeu', async () => {
  let recebido = '';
  assert.equal(await copiarTexto('ABCD-1234', async (t) => { recebido = t; }), true);
  assert.equal(recebido, 'ABCD-1234');
});

test('a ponte que falha vira "não copiei", e não "Copiado"', async () => {
  assert.equal(await copiarTexto('x', () => Promise.reject(new Error('negado'))), false);
});

test('a ponte que não responde vira falha no prazo, e não um botão esperando', async () => {
  assert.equal(await copiarTexto('x', () => new Promise(() => {}), 20), false);
});

/**
 * O caminho que não funciona não volta. O `writeText` do `navigator.clipboard` é negado pelo
 * porteiro de permissões do processo principal (ver copiar.ts) — e negado sem que a tela
 * perceba, porque quem chamava não esperava a resposta. Um "Copiar" novo escrito do jeito
 * óbvio passaria em todo teste e não copiaria nada.
 */
test('nenhuma tela copia pelo navigator.clipboard', () => {
  const achados: string[] = [];
  const varrer = (pasta: string) => {
    for (const e of readdirSync(pasta, { withFileTypes: true })) {
      const caminho = join(pasta, e.name);
      if (e.isDirectory()) varrer(caminho);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name)
        && /navigator\.clipboard\??\.write/.test(readFileSync(caminho, 'utf8'))) achados.push(caminho);
    }
  };
  varrer(import.meta.dirname);
  assert.deepEqual(achados, [], 'use copiarTexto (copiar.ts): o navigator.clipboard é negado na Saga');
});
