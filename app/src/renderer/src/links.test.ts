import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partirEmLinks } from './links.ts';

const so = (t: string) => partirEmLinks(t).map((p) => `${p.tipo}:${p.valor}`);

test('mensagem sem endereço nenhum sai inteira, num pedaço só', () => {
  assert.deepEqual(so('bom dia gente'), ['texto:bom dia gente']);
});

test('acha o endereço no meio da frase e devolve o resto como texto', () => {
  assert.deepEqual(so('olha isso https://exemplo.com/a legal né'),
    ['texto:olha isso ', 'link:https://exemplo.com/a', 'texto: legal né']);
});

test('www vira link com https, porque sem esquema o clique não abre nada', () => {
  const [p] = partirEmLinks('www.exemplo.com');
  assert.equal(p.tipo, 'link');
  assert.equal(p.tipo === 'link' && p.href, 'https://www.exemplo.com');
});

test('o ponto final da frase não entra no endereço', () => {
  assert.deepEqual(so('entra em https://exemplo.com/a.'),
    ['texto:entra em ', 'link:https://exemplo.com/a', 'texto:.']);
});

test('parêntese fechando a frase fica de fora; o do próprio endereço fica dentro', () => {
  assert.deepEqual(so('(veja https://exemplo.com/a)'),
    ['texto:(veja ', 'link:https://exemplo.com/a', 'texto:)']);
  assert.deepEqual(so('https://pt.wikipedia.org/wiki/Saga_(mitologia)'),
    ['link:https://pt.wikipedia.org/wiki/Saga_(mitologia)']);
});

test('javascript: e data: não viram link — não são endereço de página', () => {
  assert.deepEqual(so('javascript:alert(1)'), ['texto:javascript:alert(1)']);
  assert.deepEqual(so('data:text/html,<script>'), ['texto:data:text/html,<script>']);
});

test('vários endereços na mesma mensagem', () => {
  assert.deepEqual(so('a https://um.com b http://dois.com c'),
    ['texto:a ', 'link:https://um.com', 'texto: b ', 'link:http://dois.com', 'texto: c']);
});

test('o que parece código, mas não é endereço, continua texto', () => {
  assert.deepEqual(so('rodei npm run build e deu erro'), ['texto:rodei npm run build e deu erro']);
});
