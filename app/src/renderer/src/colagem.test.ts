import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoDaListaColada } from './colagem.ts';

// O que o Chromium da Saga pôs na área de transferência ao copiar uma lista de uma página
// (medido em 12/10/2026, Electron 39). O `style` é o de verdade, encurtado: ele tem `&quot;`
// dentro das aspas, e é o que toda página copiada traz.
const ESTILO = 'style="color: rgb(0, 0, 0); font-family: &quot;Times New Roman&quot;; font-size: medium;"';
const DA_PAGINA = `<p ${ESTILO}>Coisas para hoje:</p><ul ${ESTILO}><li>Comprar<span> </span><b>pão</b></li>`
  + '<li>Ligar para o João<ul><li>antes das 18h</li><li>sobre o carro</li></ul></li><li>Treino</li></ul>'
  + `<ol ${ESTILO}><li>primeiro</li><li>segundo</li></ol><p ${ESTILO}>Fim.</p>`;

test('sem lista no HTML, o colar normal do campo vale', () => {
  assert.equal(textoDaListaColada('<p>Oi</p><p>tudo bem?</p>'), null);
  assert.equal(textoDaListaColada(''), null);
  // "<link" e "<line" não são lista.
  assert.equal(textoDaListaColada('<link rel="x"><svg><line x1="0"/></svg>'), null);
});

test('a lista copiada de uma página volta com marcador, sublista e números', () => {
  assert.equal(textoDaListaColada(DA_PAGINA), [
    'Coisas para hoje:',
    '• Comprar pão',
    '• Ligar para o João',
    '  ◦ antes das 18h',
    '  ◦ sobre o carro',
    '• Treino',
    '1. primeiro',
    '2. segundo',
    'Fim.',
  ].join('\n'));
});

test('o envelope da área de transferência do Windows não vira texto', () => {
  const html = '<html><head><meta charset="utf-8"><title>Página</title><style>li { color: red }</style></head>'
    + '<body><!--StartFragment--><ul><li>um</li><li>dois</li></ul><!--EndFragment--></body></html>';
  assert.equal(textoDaListaColada(html), '• um\n• dois');
});

test('o item do Google Docs, com parágrafo dentro e nível no próprio item', () => {
  const html = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b">'
    + '<ul style="margin-top:0;"><li dir="ltr" aria-level="1" style="list-style-type:disc;">'
    + '<p dir="ltr" role="presentation"><span>Primeiro item</span></p></li>'
    + '<li dir="ltr" aria-level="2"><p dir="ltr" role="presentation"><span>dentro dele</span></p></li>'
    + '<li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span>Segundo</span></p></li></ul></b>';
  assert.equal(textoDaListaColada(html), '• Primeiro item\n  ◦ dentro dele\n• Segundo');
});

test('o item que ocupa duas linhas continua embaixo do texto dele, não da bolinha', () => {
  assert.equal(textoDaListaColada('<ul><li>linha um<br>linha dois</li></ul>'), '• linha um\n  linha dois');
  assert.equal(
    textoDaListaColada('<ol><li><p>primeiro parágrafo</p><p>segundo</p></li></ol>'),
    '1. primeiro parágrafo\n   segundo',
  );
});

test('a lista numerada respeita o "start"', () => {
  assert.equal(textoDaListaColada('<ol start="3"><li>três</li><li>quatro</li></ol>'), '3. três\n4. quatro');
});

test('acentos e símbolos escritos como entidade voltam a ser letra', () => {
  assert.equal(
    textoDaListaColada('<ul><li>P&atilde;o &amp; caf&eacute;&nbsp;com a&ccedil;&uacute;car</li><li>&#8220;aspas&#x201D; &lt;tag&gt;</li></ul>'),
    '• Pão & café com açúcar\n• “aspas” <tag>',
  );
});

test('a linha em branco de propósito fica; a que é só espaço entre tags, não', () => {
  assert.equal(
    textoDaListaColada('<p>Lista:</p><p><br></p>\n  <ul>\n    <li>\n      um\n    </li>\n  </ul>'),
    'Lista:\n\n• um',
  );
});

test('item vazio não deixa o marcador dele para a linha seguinte', () => {
  assert.equal(textoDaListaColada('<ul><li>um</li><li></li></ul><p>Fim</p>'), '• um\nFim');
});

test('o terceiro nível em diante usa o quadradinho', () => {
  assert.equal(
    textoDaListaColada('<ul><li>a<ul><li>b<ul><li>c<ul><li>d</li></ul></li></ul></li></ul></li></ul>'),
    '• a\n  ◦ b\n    ▪ c\n      ▪ d',
  );
});
