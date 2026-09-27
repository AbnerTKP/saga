import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centroDoHex, pontoDoCruzamento, pontasDaAresta, textoDoEvento, textoDoMonte, oQueTocarNoCatan, minhaMesaDoCatan,
  temTudo, CUSTOS, monteVazio, type ResumoDaMesaDoCatan,
} from './catan.ts';

const perto = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('o nome do cruzamento é a posição: os seis cantos de um hexágono ficam a 1 do centro', () => {
  // Os cantos do hexágono (q, r) na grade do servidor: (2q + r + dx, 3r + dy).
  const CANTOS = [[1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2]];
  for (const [q, r] of [[0, 0], [2, -1], [-2, 2], [1, 1]]) {
    const c = centroDoHex(q, r);
    for (const [dx, dy] of CANTOS) {
      const p = pontoDoCruzamento(`${2 * q + r + dx},${3 * r + dy}`);
      assert.ok(perto(Math.hypot(p.x - c.x, p.y - c.y), 1), `${q},${r}`);
    }
  }
  const [a, b] = pontasDaAresta('1,-1|1,1');
  assert.ok(perto(Math.hypot(a.x - b.x, a.y - b.y), 1));
});

test('o que aconteceu, em português, com "você" no lugar do seu nome', () => {
  const nome = (j: number) => ['TKP', 'Tava1', 'Gustavo'][j];
  assert.equal(textoDoEvento({ t: 'rolou', j: 1, dados: [3, 5], rodada: 2 }, nome, 0), 'Tava1 tirou 8.');
  assert.equal(textoDoEvento({ t: 'rolou', j: 0, dados: [3, 5], rodada: 2 }, nome, 0), 'Você tirou 8.');
  assert.equal(
    textoDoEvento({ t: 'produziu', numero: 8, ganhos: { 0: { madeira: 1 }, 2: { trigo: 2, la: 1 } }, faltou: [], rodada: 2 }, nome, 0),
    'Renderam: você 1 madeira; Gustavo 1 lã e 2 trigo.',
  );
  assert.equal(textoDoEvento({ t: 'roubou', j: 1, de: 0, recurso: 'minerio', rodada: 3 }, nome, 0), 'Tava1 roubou 1 minério de você.');
  assert.equal(textoDoEvento({ t: 'roubou', j: 1, de: 2, rodada: 3 }, nome, 0), 'Tava1 roubou uma carta de Gustavo.');
  assert.equal(textoDoEvento({ t: 'maiorEstrada', j: 2, de: 1, rodada: 3 }, nome, 0), 'Gustavo tomou a maior estrada.');
  assert.equal(textoDoEvento({ t: 'maiorEstrada', j: null, de: 1, rodada: 3 }, nome, 0), 'Tava1 perdeu a maior estrada, e ninguém ficou com ela.');
  assert.equal(textoDoMonte({ trigo: 2, la: 1, madeira: 0 }), '1 lã e 2 trigo');
  assert.equal(textoDoMonte({}), 'nada');
});

test('temTudo confere repetidos: cidade pede 2 trigo e 3 minério', () => {
  const mao = { ...monteVazio(), trigo: 2, minerio: 2 };
  assert.equal(temTudo(mao, CUSTOS.cidade), false);
  assert.equal(temTudo({ ...mao, minerio: 3 }, CUSTOS.cidade), true);
  assert.equal(temTudo(null, CUSTOS.estrada), false);
});

test('o som: a vez que chega, o descarte que te pede, e o fim — nunca na primeira leitura', () => {
  const m = (o: Partial<ResumoDaMesaDoCatan>): ResumoDaMesaDoCatan => ({ id: 1, estado: 'jogando', anfitriao: 1, jogadores: [1, 2], vez: 2, fase: 'acoes', devem: [], ...o });
  assert.equal(oQueTocarNoCatan(null, m({ vez: 1 }), 1), null);
  assert.equal(oQueTocarNoCatan(m({ vez: 2 }), m({ vez: 1 }), 1), 'vez');
  assert.equal(oQueTocarNoCatan(m({ vez: 1 }), m({ vez: 1, fase: 'acoes' }), 1), null);
  assert.equal(oQueTocarNoCatan(m({ vez: 2 }), m({ vez: 2, fase: 'descartar', devem: [1] }), 1), 'vez');
  assert.equal(oQueTocarNoCatan(m({}), m({ estado: 'fim', vez: null }), 1), 'fim');
  assert.equal(oQueTocarNoCatan(m({ id: 1 }), m({ id: 2, vez: 1 }), 1), null);
});

test('a sua mesa: a partida antes da mesa esperando, e ela antes da que acabou', () => {
  const m = (id: number, estado: ResumoDaMesaDoCatan['estado'], jogadores: number[]): ResumoDaMesaDoCatan => ({ id, estado, anfitriao: jogadores[0], jogadores, vez: null, fase: null, devem: [] });
  assert.equal(minhaMesaDoCatan([m(1, 'fim', [1, 2]), m(2, 'lobby', [3, 1]), m(3, 'jogando', [1, 4])], 1)?.id, 3);
  assert.equal(minhaMesaDoCatan([m(1, 'fim', [1, 2]), m(2, 'lobby', [3, 1])], 1)?.id, 2);
  assert.equal(minhaMesaDoCatan([m(1, 'jogando', [5, 2])], 1), null);
});
