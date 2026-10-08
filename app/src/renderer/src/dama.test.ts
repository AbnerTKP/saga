import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alvos, anotar, candidatos, capturaObrigatoria, clicar, tomadasNaDama, type LanceDaDama } from './dama.ts';
import { lerCasas } from './xadrez.ts';

const lance = (de: string, caminho: string[], capturadas: string[] = []): LanceDaDama => ({
  de, para: caminho.at(-1)!, caminho, capturadas,
  san: capturadas.length ? [de, ...caminho].join('x') : `${de}-${caminho[0]}`,
});

test('lance simples: um clique na chegada joga', () => {
  const legais = [lance('c3', ['d4']), lance('c3', ['b4']), lance('e3', ['d4'])];
  assert.deepEqual(alvos(legais, 'c3', []), { chegadas: ['d4', 'b4'], paradas: [] });
  assert.deepEqual(clicar(legais, 'c3', [], 'd4'), { jogar: legais[0] });
  assert.equal(clicar(legais, 'c3', [], 'f4'), null);
});

test('captura de várias, de um caminho só: o clique na chegada joga a sequência inteira', () => {
  const legais = [lance('d4', ['f6', 'h8'], ['e5', 'g7'])];
  assert.deepEqual(alvos(legais, 'd4', []), { chegadas: ['h8'], paradas: [] });
  assert.deepEqual(clicar(legais, 'd4', [], 'h8'), { jogar: legais[0] });
  // Clicar na parada do meio também resolve: só há um caminho por ali.
  assert.deepEqual(clicar(legais, 'd4', [], 'f6'), { jogar: legais[0] });
  assert.ok(capturaObrigatoria(legais));
});

test('dois caminhos para a mesma casa: a chegada sozinha não decide, a parada sim', () => {
  const porE3 = lance('c1', ['e3', 'c5', 'a3', 'c1'], ['d2', 'd4', 'b4', 'b2']);
  const porA3 = lance('c1', ['a3', 'c5', 'e3', 'c1'], ['b2', 'b4', 'd4', 'd2']);
  const legais = [porE3, porA3];
  assert.deepEqual(alvos(legais, 'c1', []), { chegadas: ['c1'], paradas: ['e3', 'a3'] });
  assert.deepEqual(clicar(legais, 'c1', [], 'c1'), null);
  assert.deepEqual(clicar(legais, 'c1', [], 'a3'), { jogar: porA3 });
  assert.deepEqual(candidatos(legais, 'c1', ['e3']), [porE3]);
});

test('o que cada lado tomou sai do tabuleiro', () => {
  const casas = lerCasas('1p1p1p1p/p1p1p1p1/1p1p1p1p/8/8/P1P1P1P1/1P1P1P1P/P1P1P1P1 w 0');
  assert.deepEqual(tomadasNaDama(casas), { pelasBrancas: 0, pelasPretas: 0 });
  assert.deepEqual(tomadasNaDama(lerCasas('3D4/8/8/8/8/8/8/p7 w 0')), { pelasBrancas: 11, pelasPretas: 11 });
});

test('a anotação usa o traço e o sinal de vezes', () => {
  assert.equal(anotar('c3-d4'), 'c3–d4');
  assert.equal(anotar('d4xf6xh8'), 'd4×f6×h8');
});
