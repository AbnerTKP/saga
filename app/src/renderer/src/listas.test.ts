import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhasComLista } from './listas.ts';

test('mensagem sem item de lista é desenhada como sempre foi', () => {
  assert.equal(linhasComLista('oi'), null);
  assert.equal(linhasComLista('primeira linha\nsegunda linha'), null);
});

test('o que não é item: negrito, número negativo, ano, marcador sem texto', () => {
  assert.equal(linhasComLista('**importante**'), null);
  assert.equal(linhasComLista('-5 graus lá fora'), null);
  assert.equal(linhasComLista('2026. Foi um ano'), null);
  assert.equal(linhasComLista('- '), null);
  assert.equal(linhasComLista('•'), null);
});

test('a lista colada vira itens com nível, e o resto continua texto', () => {
  assert.deepEqual(linhasComLista('Coisas para hoje:\n• Comprar pão\n  ◦ antes das 18h\n\n1. primeiro\nFim.'), [
    { tipo: 'texto', texto: 'Coisas para hoje:' },
    { tipo: 'item', nivel: 0, marcador: '•', texto: 'Comprar pão' },
    { tipo: 'item', nivel: 1, marcador: '◦', texto: 'antes das 18h' },
    { tipo: 'texto', texto: '' },
    { tipo: 'item', nivel: 0, marcador: '1.', texto: 'primeiro' },
    { tipo: 'texto', texto: 'Fim.' },
  ]);
});

test('"-" e "*" do markdown aparecem como a bolinha do nível; número fica como foi escrito', () => {
  assert.deepEqual(linhasComLista('- um\n  * dois\n    - três\n3) quatro'), [
    { tipo: 'item', nivel: 0, marcador: '•', texto: 'um' },
    { tipo: 'item', nivel: 1, marcador: '◦', texto: 'dois' },
    { tipo: 'item', nivel: 2, marcador: '▪', texto: 'três' },
    { tipo: 'item', nivel: 0, marcador: '3)', texto: 'quatro' },
  ]);
});

test('tabulação conta como um nível, e o recuo para no quarto', () => {
  const linhas = linhasComLista('\t- dentro\n\t\t\t\t\t- muito dentro');
  assert.equal(linhas?.[0].tipo === 'item' && linhas[0].nivel, 1);
  assert.equal(linhas?.[1].tipo === 'item' && linhas[1].nivel, 3);
});

test('o texto do item vai inteiro, com os espaços de dentro', () => {
  assert.deepEqual(linhasComLista('•\tsegue   com espaços'), [
    { tipo: 'item', nivel: 0, marcador: '•', texto: 'segue   com espaços' },
  ]);
});
