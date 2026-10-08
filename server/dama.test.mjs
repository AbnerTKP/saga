import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POSICAO_INICIAL, LANCES_DE_DAMA_PARA_EMPATE, ErroDeLance, lerFen, escreverFen, lancesLegais, jogar,
  chaveDeRepeticao, situacao,
} from './dama.mjs';

const ARQUIVOS = 'abcdefgh';
const indice = (nome) => (8 - Number(nome[1])) * 8 + ARQUIVOS.indexOf(nome[0]);

/** Uma posição montada à mão: `{ P: ['d4'], p: ['e5'] }`, com a vez. */
function posicao(pecas, vez = 'w', semCaptura = 0) {
  const casas = Array(64).fill(null);
  for (const [letra, lista] of Object.entries(pecas)) for (const c of lista) casas[indice(c)] = letra;
  // Passa pelo FEN de propósito: confere de quebra que a posição montada é uma posição válida.
  return lerFen(escreverFen({ casas, vez, semCaptura }));
}

const sans = (p) => lancesLegais(p).map((l) => l.san).sort();
const peca = (p, nome) => p.casas[indice(nome)];

test('o começo: doze de cada lado nas casas escuras, as brancas com sete lances', () => {
  const p = lerFen(POSICAO_INICIAL);
  assert.equal(p.casas.filter((c) => c === 'P').length, 12);
  assert.equal(p.casas.filter((c) => c === 'p').length, 12);
  assert.equal(p.vez, 'w');
  assert.deepEqual(sans(p), ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4']);
  assert.equal(escreverFen(p), POSICAO_INICIAL);
});

test('posição que não existe é recusada', () => {
  assert.throws(() => lerFen('8/8/8/8/8/8/8/8 x 0'), ErroDeLance);
  assert.throws(() => lerFen('P7/8/8/8/8/8/8/8 w 0'), /casa clara/);
  assert.throws(() => lerFen('k7/8/8/8/8/8/8/8 w 0'), /não é peça/);
});

test('a pedra anda para a frente, nunca para trás sem capturar', () => {
  assert.deepEqual(sans(posicao({ P: ['d4'] })), ['d4-c5', 'd4-e5']);
  assert.deepEqual(sans(posicao({ p: ['d4'] }, 'b')), ['d4-c3', 'd4-e3']);
});

test('a pedra captura para trás também', () => {
  assert.deepEqual(sans(posicao({ P: ['d4'], p: ['c3'] })), ['d4xb2']);
});

test('capturar é obrigatório: havendo captura, os lances simples somem', () => {
  const p = posicao({ P: ['c3', 'g1'], p: ['d4'] });
  assert.deepEqual(sans(p), ['c3xe5']);
  assert.throws(() => jogar(p, { de: 'g1', para: 'h2' }), /captura é obrigatória/);
});

test('lei da maioria: só vale a captura que toma mais peças', () => {
  // a3 toma uma (b4); e3 toma duas (f4 e f6, pousando em g5 e depois em e7).
  const p = posicao({ P: ['a3', 'e3'], p: ['b4', 'f4', 'f6'] });
  assert.deepEqual(sans(p), ['e3xg5xe7']);
});

test('empatadas no máximo, as duas valem e quem joga escolhe', () => {
  assert.deepEqual(sans(posicao({ P: ['a3', 'e3'], p: ['b4', 'f4'] })), ['a3xc5', 'e3xg5']);
});

test('não se salta a mesma peça duas vezes', () => {
  // De d4 tomando e5 a pedra pousa em f6; voltar por cima de e5 tomaria a mesma peça de novo.
  assert.deepEqual(sans(posicao({ P: ['d4'], p: ['e5', 'e3'] })), ['d4xf2', 'd4xf6']);
});

test('a captura em sequência pousa casa a casa, e a tomada só sai no fim', () => {
  const p = posicao({ P: ['d4'], p: ['e5', 'g7'] });
  const [l] = lancesLegais(p);
  assert.equal(l.san, 'd4xf6xh8');
  assert.deepEqual(l.caminho, ['f6', 'h8']);
  assert.deepEqual(l.capturadas, ['e5', 'g7']);
  const { posicao: depois } = jogar(p, { de: 'd4', para: 'h8' });
  assert.equal(peca(depois, 'e5'), null);
  assert.equal(peca(depois, 'g7'), null);
  // Terminou na última fileira: virou dama.
  assert.equal(peca(depois, 'h8'), 'D');
});

test('a pedra que chega à última fileira no meio da captura segue como pedra', () => {
  // d6 toma e7 e pousa em f8; dali ainda toma g7 e termina em h6. Como pedra, só h6 — uma dama
  // poderia pousar mais longe —, e no fim ela continua pedra.
  const p = posicao({ P: ['d6'], p: ['e7', 'g7'] });
  assert.deepEqual(sans(p), ['d6xf8xh6']);
  const { posicao: depois } = jogar(p, { de: 'd6', para: 'h6' });
  assert.equal(peca(depois, 'h6'), 'P');
});

test('a pedra vira dama ao terminar o lance na última fileira', () => {
  const { posicao: depois } = jogar(posicao({ P: ['c7'] }), { de: 'c7', para: 'b8' });
  assert.equal(peca(depois, 'b8'), 'D');
  const { posicao: preta } = jogar(posicao({ p: ['f2'] }, 'b'), { de: 'f2', para: 'g1' });
  assert.equal(peca(preta, 'g1'), 'd');
});

test('a dama anda quantas casas quiser na diagonal livre', () => {
  assert.deepEqual(sans(posicao({ D: ['a1'] })), ['a1-b2', 'a1-c3', 'a1-d4', 'a1-e5', 'a1-f6', 'a1-g7', 'a1-h8']);
  // Peça no caminho para a dama.
  assert.deepEqual(sans(posicao({ D: ['a1'], P: ['d4'] })).filter((s) => s.startsWith('a1')), ['a1-b2', 'a1-c3']);
});

test('a dama captura de longe e pousa em qualquer casa livre depois da peça', () => {
  assert.deepEqual(sans(posicao({ D: ['a1'], p: ['d4'] })), ['a1xe5', 'a1xf6', 'a1xg7', 'a1xh8']);
});

test('a dama não salta duas peças juntas', () => {
  assert.deepEqual(sans(posicao({ D: ['a1'], p: ['d4', 'e5'] })).filter((s) => s.includes('x')), []);
});

test('a peça tomada continua no caminho até o fim do lance', () => {
  // Pela diagonal de volta, e5 (já tomada) bloqueia a dama: não dá para pousar nela nem passar.
  const p = posicao({ D: ['b2'], p: ['d4', 'f4'] });
  // b2 toma d4 e pousa em e5; de e5 toma f4 e pousa em g3 ou h2.
  assert.deepEqual(sans(p), ['b2xe5xg3', 'b2xe5xh2']);
});

test('dois caminhos para a mesma casa: o lance tem de dizer qual', () => {
  // A dama em c1 dá a volta no losango tomando as quatro e volta a c1, por um lado ou pelo outro.
  const p = posicao({ D: ['c1'], p: ['d2', 'd4', 'b4', 'b2'] });
  const lances = lancesLegais(p);
  assert.deepEqual(lances.map((l) => l.caminho.join(' ')).sort(), ['a3 c5 e3 c1', 'e3 c5 a3 c1']);
  assert.throws(() => jogar(p, { de: 'c1', para: 'c1' }), /mais de um caminho/);
  const { posicao: depois, lance } = jogar(p, { de: 'c1', para: 'c1', caminho: ['e3', 'c5', 'a3', 'c1'] });
  assert.equal(lance.capturadas.length, 4);
  assert.equal(depois.casas.filter(Boolean).join(''), 'D');
});

test('lance que não vale é recusado com motivo', () => {
  const p = lerFen(POSICAO_INICIAL);
  assert.throws(() => jogar(p, { de: 'c3', para: 'c4' }), /não vale/);
  assert.throws(() => jogar(p, { de: 'x', para: 'c4' }), /saída e de chegada/);
});

test('perde quem fica sem peças', () => {
  const { posicao: depois } = jogar(posicao({ P: ['c3'], p: ['d4'] }), { de: 'c3', para: 'e5' });
  assert.deepEqual(situacao(depois).fim, { motivo: 'semPecas', vencedor: 'w' });
});

test('perde quem fica sem lance', () => {
  // A pedra em a3 está presa: b4 ocupada, e c5 atrás dela também.
  assert.deepEqual(situacao(posicao({ P: ['a3'], p: ['b4', 'c5'] })).fim, { motivo: 'semLances', vencedor: 'b' });
});

test('vinte lances de cada lado só de damas empatam; pedra ou captura zeram a conta', () => {
  const p = posicao({ D: ['a1'], d: ['h2'] }, 'w', LANCES_DE_DAMA_PARA_EMPATE - 1);
  const { posicao: depois } = jogar(p, { de: 'a1', para: 'b2' });
  assert.equal(depois.semCaptura, LANCES_DE_DAMA_PARA_EMPATE);
  assert.deepEqual(situacao(depois).fim, { motivo: 'vinteLances', vencedor: null });
  const comPedra = jogar(posicao({ D: ['a1'], P: ['g1'], d: ['h8'] }, 'w', 30), { de: 'g1', para: 'h2' });
  assert.equal(comPedra.posicao.semCaptura, 0);
});

test('a mesma posição três vezes empata', () => {
  let p = posicao({ D: ['a1'], d: ['h2'] });
  const chaves = [chaveDeRepeticao(p)];
  const ida = [['a1', 'b2'], ['h2', 'g1'], ['b2', 'a1'], ['g1', 'h2']];
  for (let volta = 0; volta < 2; volta++) {
    for (const [de, para] of ida) {
      p = jogar(p, { de, para }).posicao;
      chaves.push(chaveDeRepeticao(p));
    }
  }
  assert.deepEqual(situacao(p, chaves).fim, { motivo: 'repeticao', vencedor: null });
});

test('partidas inteiras ao acaso: nada que a regra oferece é recusado, e as peças se conservam', () => {
  let sorte = 7;
  const sortear = (n) => { sorte = (sorte * 1103515245 + 12345) % 2147483648; return sorte % n; };
  for (let partida = 0; partida < 120; partida++) {
    let p = lerFen(POSICAO_INICIAL);
    const chaves = [chaveDeRepeticao(p)];
    for (let meio = 0; meio < 400; meio++) {
      if (situacao(p, chaves).fim) break;
      const lances = lancesLegais(p);
      // Havendo captura, todas as oferecidas tomam o mesmo número de peças.
      const tomam = new Set(lances.map((l) => l.capturadas.length));
      assert.equal(tomam.size, 1);
      const l = lances[sortear(lances.length)];
      const doOutro = (q) => q.casas.filter((c) => c && (q.vez === 'w' ? c === c.toLowerCase() : c === c.toUpperCase())).length;
      const antes = doOutro(p);
      const feito = jogar(p, { de: l.de, para: l.para, caminho: l.caminho });
      const depois = feito.posicao.casas.filter((c) => c && (p.vez === 'w' ? c === c.toLowerCase() : c === c.toUpperCase())).length;
      assert.equal(antes - depois, l.capturadas.length, `${escreverFen(p)} ${l.san}`);
      // A pedra que não capturou andou para a frente.
      const era = p.casas[indice(l.de)];
      if ((era === 'P' || era === 'p') && !l.capturadas.length) {
        const sobe = Number(l.para[1]) - Number(l.de[1]);
        assert.equal(sobe, era === 'P' ? 1 : -1);
      }
      p = feito.posicao;
      chaves.push(chaveDeRepeticao(p));
    }
  }
});
