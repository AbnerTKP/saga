import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alvosDaVoz, lerEnergia, nomeDaPrioridade, scriptDaEnergia } from './prioridadeDaVoz.ts';

// Tipos e nomes de serviço como o `app.getAppMetrics()` os devolve no Windows (medido em
// 24/11/2026, no Electron do projeto e na Saga instalada).
const METRICAS = [
  { pid: 3444, type: 'Browser' },
  { pid: 17136, type: 'GPU', serviceName: 'GPU' },
  { pid: 5200, type: 'Utility', serviceName: 'network.mojom.NetworkService' },
  { pid: 11444, type: 'Utility', serviceName: 'audio.mojom.AudioService' },
  { pid: 12784, type: 'Tab' },
];

test('a voz passa pela tela e pelo serviço de rede, e só por eles', () => {
  assert.deepEqual(alvosDaVoz(METRICAS, 12784), [
    { pid: 12784, nome: 'tela' },
    { pid: 5200, nome: 'rede' },
  ]);
});

test('sem o serviço de rede na lista, fica só a tela; sem tela, só a rede', () => {
  assert.deepEqual(alvosDaVoz(METRICAS.filter((m) => m.type !== 'Utility'), 12784), [{ pid: 12784, nome: 'tela' }]);
  // `getOSProcessId` devolve 0 enquanto a tela não tem processo.
  assert.deepEqual(alvosDaVoz(METRICAS, 0), [{ pid: 5200, nome: 'rede' }]);
});

test('o mesmo processo não entra duas vezes', () => {
  assert.deepEqual(alvosDaVoz(METRICAS, 5200), [{ pid: 5200, nome: 'tela' }]);
});

test('as prioridades do Windows saem em palavras no registro', () => {
  assert.equal(nomeDaPrioridade(-7), 'acima do normal');
  assert.equal(nomeDaPrioridade(0), 'normal');
  assert.equal(nomeDaPrioridade(19), 'ociosa');
  assert.equal(nomeDaPrioridade(3), '3');
});

test('o script da energia leva só números inteiros positivos', () => {
  assert.equal(scriptDaEnergia([]), null);
  assert.equal(scriptDaEnergia([0, -1, 1.5, Number.NaN]), null);
  const script = scriptDaEnergia([12784, 0, 5200]) ?? '';
  assert.match(script, /foreach\(\$id in @\(12784,5200\)\)/);
});

test('o script da energia é uma linha só, sem aspas duplas', () => {
  // Vai como argumento do `-Command`: quebra de linha e aspas duplas são onde o Windows
  // muda as regras de escape entre um programa e outro.
  const script = scriptDaEnergia([12784]) ?? '';
  assert.doesNotMatch(script, /["\r\n]/);
});

test('a resposta do script diz quem saiu da economia, pelo que foi LIDO de volta', () => {
  // A saída de verdade, medida no Electron do projeto.
  assert.deepEqual([...lerEnergia('12784 True 5 0\r\n5200 True 5 0\r\n')], [[12784, true], [5200, true]]);
  assert.deepEqual([...lerEnergia('5200 abrir')], [[5200, false]]);
  // Disse que mudou, mas o sistema continua decidindo, ou continua estrangulando.
  assert.deepEqual([...lerEnergia('1 True 0 0')], [[1, false]]);
  assert.deepEqual([...lerEnergia('1 True 5 1')], [[1, false]]);
  assert.deepEqual([...lerEnergia('1 False 5 0')], [[1, false]]);
  assert.deepEqual([...lerEnergia('')], []);
});
