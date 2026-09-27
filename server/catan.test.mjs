import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEOMETRIA, POSICOES, RECURSOS, CUSTOS, ErroDeJogo, novaPartida, sortearTabuleiro, agir, sair, vista,
  tamanhoDaEstrada, taxas, pontos, chaveDoHex,
} from './catan.mjs';

const G = GEOMETRIA;

/** Um sorteio de número fixo, para o teste escolher os dados: cada dado d vira (d − 0,5) / 6. */
const dados = (...lista) => {
  const fila = lista.flatMap((n) => (Array.isArray(n) ? n : [n])).map((d) => (d - 0.5) / 6);
  return () => { if (!fila.length) throw new Error('acabaram os dados do teste'); return fila.shift(); };
};
/** Sorteio com semente, para as partidas inteiras. */
function semente(s) {
  let a = s >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// O tabuleiro do manual (primeira partida), linha a linha — conhecido, para o teste saber o que sai.
const MANUAL = [
  ['montanha', 10], ['pasto', 2], ['floresta', 9],
  ['campo', 12], ['colina', 6], ['pasto', 4], ['colina', 10],
  ['campo', 9], ['floresta', 11], ['deserto', null], ['floresta', 3], ['montanha', 8],
  ['floresta', 8], ['montanha', 3], ['campo', 4], ['pasto', 5],
  ['colina', 5], ['campo', 6], ['pasto', 11],
];
const tabuleiroDoManual = () => ({
  hexes: POSICOES.map(([q, r], i) => ({ q, r, terreno: MANUAL[i][0], numero: MANUAL[i][1] })),
  portos: G.portos.map((vs, i) => ({ tipo: ['3:1', 'la', '3:1', '3:1', 'tijolo', 'madeira', '3:1', 'trigo', 'minerio'][i], cruzamentos: vs })),
});
const hexDe = (p, terreno, numero) => p.hexes.find((h) => h.terreno === terreno && h.numero === numero);
const chave = (h) => chaveDoHex(h.q, h.r);

const recusa = (texto) => (e) => { assert.ok(e instanceof ErroDeJogo, `veio outra coisa: ${e?.stack ?? e}`); if (texto) assert.match(e.message, texto); return true; };

/** A partida já depois do começo, com as peças postas à mão e a vez do jogador 0 antes de rolar. */
function montada(n = 3) {
  const p = novaPartida(n, { tabuleiro: tabuleiroDoManual(), sorteio: semente(1) });
  p.fase = 'rolar'; p.vez = 0; p.turno = 1; p.rodada = 1; p.inicio = null;
  return p;
}
const por = (p, j, v, tipo = 'aldeia') => { p.construcoes[v] = { j, tipo }; p.jogadores[j].pecas[tipo]--; };
const dar = (p, j, m) => { for (const [r, n] of Object.entries(m)) { p.jogadores[j].mao[r] += n; p.banco[r] -= n; } };
/** As arestas de um caminho que passa pelos cruzamentos dados. */
const caminho = (...vs) => vs.slice(1).map((v, i) => { const a = [vs[i], v].sort().join('|'); assert.ok(G.arestas.has(a), `não há aresta ${a}`); return a; });

/** Conservação: banco + mãos = 19 de cada recurso, sempre. */
function conferirCartas(p) {
  for (const r of RECURSOS) {
    const total = p.banco[r] + p.jogadores.reduce((s, j) => s + j.mao[r], 0);
    assert.equal(total, 19, `${r}: ${total}`);
    assert.ok(p.banco[r] >= 0 && p.jogadores.every((j) => j.mao[r] >= 0));
  }
}

test('a geometria: 19 terrenos, 54 cruzamentos, 72 arestas, 9 portos na costa sem cruzamento em comum', () => {
  assert.equal(POSICOES.length, 19);
  assert.equal(G.cruzamentos.size, 54);
  assert.equal(G.arestas.size, 72);
  const dosPortos = G.portos.flat();
  assert.equal(new Set(dosPortos).size, 18);
  for (const v of dosPortos) assert.ok(G.cruzamentos.get(v).hexes.length < 3, `${v} não é costa`);
  for (const [a, [v, w]] of G.arestas) assert.equal(a, `${v}|${w}`);
});

test('o tabuleiro sorteado: as peças certas, e 6 e 8 nunca vizinhos', () => {
  for (let s = 1; s <= 300; s++) {
    const t = sortearTabuleiro(semente(s));
    const conta = (k) => t.hexes.filter((h) => h.terreno === k).length;
    assert.deepEqual([conta('floresta'), conta('pasto'), conta('campo'), conta('colina'), conta('montanha'), conta('deserto')], [4, 4, 4, 3, 3, 1]);
    assert.deepEqual(t.hexes.map((h) => h.numero).filter(Boolean).sort((a, b) => a - b), [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    assert.equal(t.hexes.find((h) => h.terreno === 'deserto').numero, null);
    const porChave = new Map(t.hexes.map((h) => [chave(h), h]));
    for (const h of t.hexes) {
      if (h.numero !== 6 && h.numero !== 8) continue;
      for (const k of G.vizinhosDoHex.get(chave(h))) assert.ok(![6, 8].includes(porChave.get(k).numero), `semente ${s}: 6/8 juntos`);
    }
    assert.equal(t.portos.filter((x) => x.tipo === '3:1').length, 4);
  }
});

test('o começo: ida e volta, aldeia antes da estrada, regra da distância, e a segunda aldeia rende', () => {
  const p = novaPartida(3, { tabuleiro: tabuleiroDoManual(), sorteio: semente(2) });
  const ordem = [];
  const v0 = vista(p, 0);
  assert.equal(v0.pode.aldeias.length, 54);
  assert.throws(() => agir(p, 1, { tipo: 'aldeia', v: v0.pode.aldeias[0] }), recusa(/vez/));
  assert.throws(() => agir(p, 0, { tipo: 'estrada', a: [...G.arestas.keys()][0] }), recusa(/aldeia/));

  const escolhidas = [];
  for (let passo = 0; passo < 6; passo++) {
    const j = p.vez;
    ordem.push(j);
    const v = vista(p, j).pode.aldeias[0];
    escolhidas.push(v);
    const antes = { ...p.jogadores[j].mao };
    agir(p, j, { tipo: 'aldeia', v });
    // Os vizinhos de uma aldeia deixam de valer.
    for (const w of G.cruzamentos.get(v).vizinhos) assert.ok(!vista(p, (j + 1) % 3).pode.aldeias?.includes(w));
    if (passo >= 3) {
      const terrenos = G.cruzamentos.get(v).hexes.map((h) => p.hexes.find((x) => chave(x) === h).terreno).filter((t) => t !== 'deserto');
      assert.equal(RECURSOS.reduce((s, r) => s + p.jogadores[j].mao[r] - antes[r], 0), terrenos.length);
    } else assert.deepEqual(p.jogadores[j].mao, antes);
    const estradas = vista(p, j).pode.estradas;
    assert.ok(estradas.length >= 2 && estradas.every((a) => G.arestas.get(a).includes(v)));
    agir(p, j, { tipo: 'estrada', a: estradas[0] });
  }
  assert.deepEqual(ordem, [0, 1, 2, 2, 1, 0]);
  assert.equal(p.fase, 'rolar');
  assert.equal(p.vez, 0);
  assert.equal(p.rodada, 1);
  conferirCartas(p);
});

test('produção: aldeia 1, cidade 2, e o ladrão segura o terreno dele', () => {
  const p = montada();
  const campo9 = hexDe(p, 'campo', 9);
  const [a, , c] = G.cantosDoHex.get(chave(campo9));
  por(p, 0, a);
  por(p, 1, c, 'cidade');
  agir(p, 0, { tipo: 'rolar' }, dados(4, 5));
  assert.equal(p.jogadores[0].mao.trigo, 1);
  assert.equal(p.jogadores[1].mao.trigo, 2);
  assert.equal(p.fase, 'acoes');
  agir(p, 0, { tipo: 'passar' });
  p.ladrao = chave(campo9);
  agir(p, 1, { tipo: 'rolar' }, dados(3, 6));
  assert.equal(p.jogadores[1].mao.trigo, 2);
  conferirCartas(p);
});

test('banco sem cartas para todos não paga ninguém daquele recurso — mas paga o único que pediu', () => {
  const p = montada();
  const campo9 = hexDe(p, 'campo', 9);
  const [a, , c] = G.cantosDoHex.get(chave(campo9));
  por(p, 0, a, 'cidade');
  por(p, 1, c, 'cidade');
  dar(p, 2, { trigo: 16 });   // sobram 3 no banco; devem 4
  agir(p, 0, { tipo: 'rolar' }, dados(4, 5));
  assert.equal(p.jogadores[0].mao.trigo, 0);
  assert.equal(p.jogadores[1].mao.trigo, 0);
  assert.deepEqual(p.historico.at(-1).faltou, ['trigo']);
  // Só um devendo: leva o que houver.
  delete p.construcoes[c];
  p.fase = 'rolar';
  agir(p, 0, { tipo: 'rolar' }, dados(4, 5));
  assert.equal(p.jogadores[0].mao.trigo, 2);
  p.fase = 'rolar';
  dar(p, 2, { trigo: 0 });
  p.jogadores[2].mao.trigo += p.banco.trigo - 1; p.banco.trigo = 1;
  agir(p, 0, { tipo: 'rolar' }, dados(4, 5));
  assert.equal(p.jogadores[0].mao.trigo, 3);
  assert.equal(p.banco.trigo, 0);
  conferirCartas(p);
});

test('saiu 7: quem tem mais de 7 descarta metade, depois o ladrão muda e rouba uma carta', () => {
  const p = montada();
  const colina6 = hexDe(p, 'colina', 6);
  por(p, 1, G.cantosDoHex.get(chave(colina6))[0]);
  dar(p, 1, { madeira: 5, la: 4 });        // 9 → descarta 4
  dar(p, 2, { trigo: 7 });                 // 7 → não descarta
  dar(p, 0, { minerio: 8 });               // 8 → descarta 4
  agir(p, 0, { tipo: 'rolar' }, dados(3, 4));
  assert.equal(p.fase, 'descartar');
  assert.deepEqual(p.descartes, { 0: 4, 1: 4 });
  assert.equal(vista(p, 2).pode.descartar, undefined);
  assert.throws(() => agir(p, 0, { tipo: 'ladrao', hex: chave(colina6) }), recusa());
  assert.throws(() => agir(p, 1, { tipo: 'descartar', recursos: { madeira: 3 } }), recusa(/exatamente 4/));
  assert.throws(() => agir(p, 1, { tipo: 'descartar', recursos: { tijolo: 4 } }), recusa(/não tem/));
  agir(p, 1, { tipo: 'descartar', recursos: { madeira: 2, la: 2 } });
  assert.equal(p.fase, 'descartar');
  agir(p, 0, { tipo: 'descartar', recursos: { minerio: 4 } });
  assert.equal(p.fase, 'ladrao');
  assert.throws(() => agir(p, 0, { tipo: 'ladrao', hex: p.ladrao }), recusa(/mudar/));
  assert.deepEqual(vista(p, 0).pode.ladrao[chave(colina6)], [1]);
  agir(p, 0, { tipo: 'ladrao', hex: chave(colina6) }, () => 0);
  assert.equal(p.ladrao, chave(colina6));
  assert.equal(RECURSOS.reduce((s, r) => s + p.jogadores[1].mao[r], 0), 4);
  assert.equal(RECURSOS.reduce((s, r) => s + p.jogadores[0].mao[r], 0), 5);
  assert.equal(p.fase, 'acoes');
  // A carta roubada só aparece para os dois.
  const roubo = (k) => vista(p, k).historico.find((e) => e.t === 'roubou');
  assert.ok(roubo(0).recurso && roubo(1).recurso);
  assert.equal(roubo(2).recurso, undefined);
  assert.equal(vista(p, null).historico.find((e) => e.t === 'roubou').recurso, undefined);
  conferirCartas(p);
});

test('ladrão num terreno com duas vítimas pede a escolha; sem vítima não rouba', () => {
  const p = montada();
  const h = hexDe(p, 'pasto', 4);
  const vs = G.cantosDoHex.get(chave(h));
  por(p, 1, vs[0]); por(p, 2, vs[3]);
  dar(p, 1, { la: 1 }); dar(p, 2, { la: 1 });
  p.fase = 'ladrao';
  assert.throws(() => agir(p, 0, { tipo: 'ladrao', hex: chave(h) }), recusa(/de quem/));
  assert.throws(() => agir(p, 0, { tipo: 'ladrao', hex: chave(h), vitima: 0 }), recusa(/de quem/));
  agir(p, 0, { tipo: 'ladrao', hex: chave(h), vitima: 2 }, () => 0);
  assert.equal(p.jogadores[2].mao.la, 0);
  assert.equal(p.jogadores[0].mao.la, 1);
  p.fase = 'ladrao';
  agir(p, 0, { tipo: 'ladrao', hex: chave(hexDe(p, 'deserto', null)) });
  assert.equal(p.fase, 'acoes');
});

test('construir: custo, estrada ligada, aldeia na estrada e a dois cruzamentos, cidade sobre aldeia', () => {
  const p = montada();
  p.fase = 'acoes';
  const h = hexDe(p, 'campo', 12);
  const [c0, c1, c2, c3] = G.cantosDoHex.get(chave(h));
  por(p, 0, c0);
  const [a01, a12, a23] = caminho(c0, c1, c2, c3);
  assert.throws(() => agir(p, 0, { tipo: 'estrada', a: a01 }), recusa(/Faltam/));
  dar(p, 0, { madeira: 5, tijolo: 5, la: 2, trigo: 4, minerio: 3 });
  assert.throws(() => agir(p, 0, { tipo: 'estrada', a: a23 }), recusa(/continuar/));
  agir(p, 0, { tipo: 'estrada', a: a01 });
  assert.throws(() => agir(p, 0, { tipo: 'aldeia', v: c1 }), recusa(/dois cruzamentos/));
  agir(p, 0, { tipo: 'estrada', a: a12 });
  agir(p, 0, { tipo: 'aldeia', v: c2 });
  assert.equal(pontos(p, 0), 2);
  assert.deepEqual(vista(p, 0).pode.cidades.sort(), [c0, c2].sort());
  agir(p, 0, { tipo: 'cidade', v: c2 });
  assert.equal(pontos(p, 0), 3);
  assert.equal(p.jogadores[0].pecas.aldeia, 4);
  assert.throws(() => agir(p, 0, { tipo: 'cidade', v: c2 }), recusa(/aldeia sua/));
  conferirCartas(p);
});

test('a estrada não passa por cima da aldeia de outro', () => {
  const p = montada();
  p.fase = 'acoes';
  dar(p, 0, { madeira: 3, tijolo: 3 });
  const h = hexDe(p, 'campo', 12);
  const [c0, c1, c2] = G.cantosDoHex.get(chave(h));
  por(p, 0, c0);
  p.estradas[caminho(c0, c1)[0]] = 0;
  por(p, 1, c1);
  assert.throws(() => agir(p, 0, { tipo: 'estrada', a: caminho(c1, c2)[0] }), recusa(/continuar/));
});

test('maior estrada: 5 seguidas dá 2 pontos, passar dela toma, cortar no meio devolve ou tira', () => {
  const p = montada(3);
  // Uma linha de sete cruzamentos pela costa de cima.
  const topo = POSICOES.filter(([, r]) => r === -2).map(([q, r]) => G.cantosDoHex.get(chaveDoHex(q, r)));
  const linha = [topo[0][4], topo[0][5], topo[0][0], topo[1][5], topo[1][0], topo[2][5], topo[2][0]];
  const arestas = caminho(...linha);
  for (const a of arestas.slice(0, 4)) p.estradas[a] = 0;
  assert.equal(tamanhoDaEstrada(p, 0), 4);
  p.fase = 'acoes';
  dar(p, 0, { madeira: 1, tijolo: 1 });
  agir(p, 0, { tipo: 'estrada', a: arestas[4] });
  assert.deepEqual(p.maiorEstrada, { j: 0, tamanho: 5 });
  assert.equal(pontos(p, 0), 2);

  // O jogador 1 faz 6 noutro canto: toma.
  const baixo = POSICOES.filter(([, r]) => r === 2).map(([q, r]) => G.cantosDoHex.get(chaveDoHex(q, r)));
  const linha2 = [baixo[0][3], baixo[0][2], baixo[0][1], baixo[1][2], baixo[1][1], baixo[2][2], baixo[2][1]];
  for (const a of caminho(...linha2)) p.estradas[a] = 1;
  p.vez = 1;
  por(p, 2, linha2[0]);   // uma casa na PONTA não corta nada
  dar(p, 1, { madeira: 1, tijolo: 1 });
  const livre = vista(p, 1).pode.estradas[0];
  agir(p, 1, { tipo: 'estrada', a: livre });
  assert.equal(p.maiorEstrada.j, 1);

  // O jogador 2 corta a do 1 num cruzamento de três arestas: 2 + 4, e ela volta para o 0 (5),
  // o único com 5 ou mais.
  p.vez = 2;
  p.fase = 'acoes';
  delete p.construcoes[linha2[0]]; p.jogadores[2].pecas.aldeia++;
  delete p.estradas[livre];
  const corte = linha2[2];
  p.estradas[G.cruzamentos.get(corte).arestas.find((a) => p.estradas[a] === undefined)] = 2;
  dar(p, 2, CUSTOS.aldeia);
  agir(p, 2, { tipo: 'aldeia', v: corte });
  assert.equal(tamanhoDaEstrada(p, 1), 4);
  assert.deepEqual(p.maiorEstrada, { j: 0, tamanho: 5 });
});

/** Um caminho de `n` arestas livres que não encosta em nenhum cruzamento de `longe`. */
function caminhoLivre(p, n, longe) {
  const perto = new Set([...longe].flatMap((v) => [v, ...G.cruzamentos.get(v).vizinhos]));
  const andar = (vs) => {
    if (vs.length === n + 1) return vs;
    for (const w of G.cruzamentos.get(vs.at(-1)).vizinhos) {
      if (vs.includes(w) || perto.has(w)) continue;
      const r = andar([...vs, w]);
      if (r) return r;
    }
    return null;
  };
  for (const v of G.cruzamentos.keys()) { if (perto.has(v)) continue; const r = andar([v]); if (r) return r; }
  throw new Error('sem caminho livre');
}

test('maior estrada: cortada a de quem tinha, e empatados os de cima, ninguém fica com ela', () => {
  const p = montada(3);
  const topo = POSICOES.filter(([, r]) => r === -2).map(([q, r]) => G.cantosDoHex.get(chaveDoHex(q, r)));
  const linha = [topo[0][4], topo[0][5], topo[0][0], topo[1][5], topo[1][0], topo[2][5], topo[2][0]];
  for (const a of caminho(...linha)) p.estradas[a] = 0;           // 6
  const usados = new Set(linha);
  const de1 = caminhoLivre(p, 5, usados);
  for (const a of caminho(...de1)) p.estradas[a] = 1;              // 5
  de1.forEach((v) => usados.add(v));
  const de2 = caminhoLivre(p, 5, usados);
  for (const a of caminho(...de2)) p.estradas[a] = 2;              // 5
  p.maiorEstrada = { j: 0, tamanho: 6 };
  // O 2 põe aldeia num cruzamento de três arestas da linha do 0: 2 e 4. O 1 e o 2 empatam em 5.
  p.vez = 2; p.fase = 'acoes';
  const corte = linha[4];
  p.estradas[G.cruzamentos.get(corte).arestas.find((a) => p.estradas[a] === undefined)] = 2;
  dar(p, 2, CUSTOS.aldeia);
  agir(p, 2, { tipo: 'aldeia', v: corte });
  assert.equal(tamanhoDaEstrada(p, 0), 4);
  assert.equal(p.maiorEstrada, null);
  assert.deepEqual(p.historico.at(-1), { t: 'maiorEstrada', j: null, de: 0, rodada: 1 });
});

test('desenvolvimento: não vale no turno em que foi comprada, uma por turno, cavaleiro antes de rolar', () => {
  const p = montada();
  p.baralho = ['monopolio', 'cavaleiro', 'cavaleiro', 'cavaleiro', 'cavaleiro'];
  p.fase = 'acoes';
  dar(p, 0, { la: 2, trigo: 2, minerio: 2 });
  agir(p, 0, { tipo: 'comprar' });
  assert.deepEqual(vista(p, 0).cartas, [{ tipo: 'cavaleiro', nova: true }]);
  assert.equal(vista(p, 0).pode.jogar, undefined);
  assert.throws(() => agir(p, 0, { tipo: 'cavaleiro' }), recusa(/próximo/));
  assert.equal(vista(p, 1).jogadores[0].desenvolvimento, 1);
  assert.equal(vista(p, 1).historico.at(-1).carta, undefined);
  agir(p, 0, { tipo: 'passar' });
  agir(p, 1, { tipo: 'rolar' }, dados(2, 3));
  agir(p, 1, { tipo: 'passar' });
  agir(p, 2, { tipo: 'rolar' }, dados(2, 3));
  agir(p, 2, { tipo: 'passar' });
  // Antes de rolar, o cavaleiro: move o ladrão e volta para "rolar".
  assert.deepEqual(vista(p, 0).pode.jogar, ['cavaleiro']);
  agir(p, 0, { tipo: 'cavaleiro' });
  assert.equal(p.fase, 'ladrao');
  agir(p, 0, { tipo: 'ladrao', hex: chave(hexDe(p, 'campo', 12)) });
  assert.equal(p.fase, 'rolar');
  assert.equal(p.jogadores[0].cavaleiros, 1);
  agir(p, 0, { tipo: 'rolar' }, dados(2, 3));
  agir(p, 0, { tipo: 'comprar' });
  p.jogadores[0].cartas[0].turno = 0;
  assert.throws(() => agir(p, 0, { tipo: 'monopolio', recurso: 'la' }), recusa(/Só uma/));
});

test('maior exército: três cavaleiros, e só passa a outro com mais', () => {
  const p = montada();
  p.jogadores[0].cavaleiros = 2;
  p.jogadores[0].cartas = [{ tipo: 'cavaleiro', turno: 0 }];
  p.fase = 'acoes';
  agir(p, 0, { tipo: 'cavaleiro' });
  assert.deepEqual(p.maiorExercito, { j: 0, tamanho: 3 });
  assert.equal(pontos(p, 0), 2);
  p.jogadores[1].cavaleiros = 2;
  p.jogadores[1].cartas = [{ tipo: 'cavaleiro', turno: 0 }];
  p.vez = 1; p.fase = 'rolar'; p.desenvolvimentoNoTurno = false;
  agir(p, 1, { tipo: 'cavaleiro' });
  assert.equal(p.maiorExercito.j, 0);   // 3 × 3: fica com quem tinha
});

test('monopólio, fartura e estradas', () => {
  const p = montada();
  p.fase = 'acoes';
  p.jogadores[0].cartas = [{ tipo: 'monopolio', turno: 0 }, { tipo: 'fartura', turno: 0 }, { tipo: 'estradas', turno: 0 }];
  dar(p, 1, { la: 3 }); dar(p, 2, { la: 2, trigo: 1 });
  agir(p, 0, { tipo: 'monopolio', recurso: 'la' });
  assert.equal(p.jogadores[0].mao.la, 5);
  assert.equal(p.jogadores[1].mao.la + p.jogadores[2].mao.la, 0);
  assert.equal(p.jogadores[2].mao.trigo, 1);

  p.desenvolvimentoNoTurno = false;
  agir(p, 0, { tipo: 'fartura', recursos: ['minerio', 'minerio'] });
  assert.equal(p.jogadores[0].mao.minerio, 2);

  p.desenvolvimentoNoTurno = false;
  const h = hexDe(p, 'campo', 12);
  const [c0, c1, c2, c3] = G.cantosDoHex.get(chave(h));
  por(p, 0, c0);
  agir(p, 0, { tipo: 'estradas' });
  assert.equal(p.fase, 'estradas');
  agir(p, 0, { tipo: 'estrada', a: caminho(c0, c1)[0] });
  agir(p, 0, { tipo: 'estrada', a: caminho(c1, c2)[0] });
  assert.equal(p.fase, 'acoes');
  assert.equal(p.jogadores[0].mao.madeira, 0);
  void c3;
  conferirCartas(p);
});

test('banco: 4 por 1, 3 com porto 3:1, 2 com o porto do recurso', () => {
  const p = montada();
  p.fase = 'acoes';
  assert.equal(taxas(p, 0).la, 4);
  const porto31 = p.portos.find((x) => x.tipo === '3:1');
  por(p, 0, porto31.cruzamentos[0]);
  assert.deepEqual(Object.values(taxas(p, 0)), [3, 3, 3, 3, 3]);
  const portoLa = p.portos.find((x) => x.tipo === 'la');
  por(p, 0, portoLa.cruzamentos[1]);
  assert.equal(taxas(p, 0).la, 2);
  assert.equal(taxas(p, 0).trigo, 3);
  dar(p, 0, { la: 2 });
  agir(p, 0, { tipo: 'banco', da: 'la', quer: 'minerio' });
  assert.equal(p.jogadores[0].mao.minerio, 1);
  assert.throws(() => agir(p, 0, { tipo: 'banco', da: 'la', quer: 'minerio' }), recusa(/pede 2/));
  conferirCartas(p);
});

test('troca entre jogadores: oferta, aceite, contraproposta e a troca fechada pela vez', () => {
  const p = montada();
  p.fase = 'acoes';
  dar(p, 0, { trigo: 2 }); dar(p, 1, { la: 1 }); dar(p, 2, { la: 1, minerio: 1 });
  assert.throws(() => agir(p, 0, { tipo: 'oferecer', da: { trigo: 3 }, quer: { la: 1 } }), recusa(/não tem/));
  assert.throws(() => agir(p, 0, { tipo: 'oferecer', da: { trigo: 1 }, quer: { trigo: 1 } }), recusa(/mesmo/));
  agir(p, 0, { tipo: 'oferecer', da: { trigo: 1 }, quer: { la: 1 } });
  assert.ok(vista(p, 1).pode.responder);
  assert.throws(() => agir(p, 0, { tipo: 'responder', resposta: 'aceita' }), recusa(/sua/));
  assert.throws(() => agir(p, 0, { tipo: 'fecharTroca', com: 1 }), recusa(/não aceitou/));
  agir(p, 1, { tipo: 'responder', resposta: 'aceita' });
  agir(p, 2, { tipo: 'contraproposta', da: { minerio: 1 }, quer: { trigo: 2 } });
  assert.equal(vista(p, 0).oferta.respostas[2], 'contra');
  agir(p, 0, { tipo: 'fecharTroca', com: 2, contra: true });
  assert.equal(p.jogadores[0].mao.minerio, 1);
  assert.equal(p.jogadores[2].mao.trigo, 2);
  assert.equal(p.oferta, null);
  assert.equal(p.historico.at(-1).t, 'trocou');
  conferirCartas(p);
});

test('vence quem chega a 10 na própria vez, contando as cartas de ponto escondidas', () => {
  const p = montada();
  const livres = [...G.cruzamentos.keys()];
  const longe = [];
  for (const v of livres) if (longe.every((w) => !G.cruzamentos.get(w).vizinhos.has(v) && w !== v)) longe.push(v);
  for (const v of longe.slice(0, 4)) por(p, 0, v, 'cidade');           // 8
  p.jogadores[0].cartas = [{ tipo: 'ponto', turno: 0 }];                 // 9 escondido
  assert.equal(vista(p, 1).jogadores[0].pontos, 8);
  assert.equal(vista(p, 0).jogadores[0].pontos, 9);
  p.fase = 'acoes';
  dar(p, 0, CUSTOS.aldeia);
  const v = longe[4];
  p.estradas[G.cruzamentos.get(v).arestas[0]] = 0;
  agir(p, 0, { tipo: 'aldeia', v });
  assert.equal(p.fase, 'fim');
  assert.equal(p.vencedor, 0);
  assert.deepEqual(vista(p, 1).jogadores[0].cartasDeDesenvolvimento, ['ponto']);
  assert.throws(() => agir(p, 0, { tipo: 'passar' }), recusa(/terminou/));
});

test('a mão dos outros chega só como quantidade', () => {
  const p = montada();
  dar(p, 1, { la: 2, trigo: 1 });
  const v = vista(p, 0);
  assert.equal(v.jogadores[1].cartas, 3);
  assert.equal(v.jogadores[1].mao, undefined);
  assert.deepEqual(vista(p, 1).mao, { madeira: 0, tijolo: 0, la: 2, trigo: 1, minerio: 0 });
  assert.equal(vista(p, null).mao, null);
  assert.deepEqual(vista(p, null).pode, {});
});

test('quem sai: as cartas voltam ao banco, a vez anda, e sobrando um ele vence', () => {
  const p = montada(3);
  dar(p, 0, { la: 3 });
  sair(p, 0);
  assert.equal(p.vez, 1);
  assert.equal(p.fase, 'rolar');
  assert.throws(() => agir(p, 0, { tipo: 'rolar' }), recusa(/não está/));
  conferirCartas(p);
  agir(p, 1, { tipo: 'rolar' }, dados(2, 3));
  agir(p, 1, { tipo: 'passar' });
  assert.equal(p.vez, 2);
  agir(p, 2, { tipo: 'rolar' }, dados(2, 3));
  agir(p, 2, { tipo: 'passar' });
  assert.equal(p.vez, 1);
  sair(p, 2);
  assert.equal(p.fase, 'fim');
  assert.equal(p.vencedor, 1);
});

test('quem sai no começo: os passos dele são pulados e ninguém trava', () => {
  const p = novaPartida(3, { tabuleiro: tabuleiroDoManual(), sorteio: semente(9) });
  sair(p, 2);
  const vezes = [];
  while (p.fase === 'inicio') {
    const j = p.vez;
    vezes.push(j);
    agir(p, j, { tipo: 'aldeia', v: vista(p, j).pode.aldeias[0] });
    agir(p, j, { tipo: 'estrada', a: vista(p, j).pode.estradas[0] });
  }
  assert.deepEqual(vezes, [0, 1, 1, 0]);
  assert.equal(p.fase, 'rolar');
});

/**
 * Partidas inteiras entre robôs que sorteiam uma ação qualquer do que a vista diz que pode.
 * O que se confere a cada passo: nada do que a vista oferece é recusado, e as cartas se conservam.
 */
test('partidas inteiras de robôs: o que a tela oferece sempre vale, e as cartas se conservam', () => {
  let acabaram = 0;
  for (let s = 1; s <= 40; s++) {
    const rnd = semente(s * 7919);
    const n = 2 + (s % 3);
    const p = novaPartida(n, { sorteio: rnd });
    const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];
    let passos = 0;
    while (p.fase !== 'fim' && passos < 6000) {
      passos++;
      const quem = p.fase === 'descartar' ? Number(Object.keys(p.descartes)[0]) : p.vez;
      const v = vista(p, quem);
      const x = v.pode;
      let acao;
      if (x.descartar) {
        const monte = {};
        const mao = { ...v.mao };
        for (let k = 0; k < x.descartar; k++) { const r = escolher(RECURSOS.filter((r2) => mao[r2] > 0)); mao[r]--; monte[r] = (monte[r] ?? 0) + 1; }
        acao = { tipo: 'descartar', recursos: monte };
      } else if (x.ladrao) {
        const hex = escolher(Object.keys(x.ladrao));
        acao = { tipo: 'ladrao', hex, vitima: x.ladrao[hex].length ? escolher(x.ladrao[hex]) : undefined };
      } else if (x.rolar) acao = rnd() < 0.2 && x.jogar?.includes('cavaleiro') ? { tipo: 'cavaleiro' } : { tipo: 'rolar' };
      else {
        const op = [];
        if (x.aldeias?.length) op.push(() => ({ tipo: 'aldeia', v: escolher(x.aldeias) }), () => ({ tipo: 'aldeia', v: escolher(x.aldeias) }));
        if (x.cidades?.length) op.push(() => ({ tipo: 'cidade', v: escolher(x.cidades) }), () => ({ tipo: 'cidade', v: escolher(x.cidades) }));
        if (x.estradas?.length) op.push(() => ({ tipo: 'estrada', a: escolher(x.estradas) }));
        if (x.comprar) op.push(() => ({ tipo: 'comprar' }));
        if (x.jogar?.length) {
          const c = escolher(x.jogar);
          if (c === 'fartura') op.push(() => ({ tipo: 'fartura', recursos: [escolher(RECURSOS.filter((r) => v.banco[r] > 1)), escolher(RECURSOS.filter((r) => v.banco[r] > 1))] }));
          else if (c === 'monopolio') op.push(() => ({ tipo: 'monopolio', recurso: escolher(RECURSOS) }));
          else if (c !== 'estradas' || x.estradas?.length || v.jogadores[quem].pecas.estrada) op.push(() => ({ tipo: c }));
        }
        if (x.banco) {
          const da = RECURSOS.find((r) => v.mao[r] >= x.banco[r]);
          if (da) op.push(() => ({ tipo: 'banco', da, quer: escolher(RECURSOS.filter((r) => r !== da && v.banco[r] > 0)) }));
        }
        if (x.pararEstradas && !x.estradas?.length) op.push(() => ({ tipo: 'pararEstradas' }));
        if (!op.length || (x.passar && rnd() < 0.25)) acao = x.passar ? { tipo: 'passar' } : { tipo: 'pararEstradas' };
        else acao = escolher(op)();
      }
      try {
        agir(p, quem, acao, rnd);
      } catch (e) {
        // A fartura pode pedir duas iguais com uma só no banco, e o cavaleiro pode sair sem onde por
        // estrada: isso é do robô, não da regra. O resto é defeito.
        if (e instanceof ErroDeJogo && /banco não tem|Não há onde/.test(e.message)) continue;
        throw new Error(`semente ${s}, passo ${passos}, fase ${p.fase}: ${JSON.stringify(acao)} → ${e.message}`);
      }
      conferirCartas(p);
      // Ninguém fica com 10 na própria vez sem a partida acabar.
      if (p.fase !== 'fim' && p.fase !== 'inicio') assert.ok(pontos(p, p.vez, true) < 10, `semente ${s}: 10 pontos sem vencer`);
      for (const j of p.jogadores) assert.ok(j.pecas.estrada >= 0 && j.pecas.aldeia >= 0 && j.pecas.cidade >= 0);
    }
    if (p.fase === 'fim') {
      acabaram++;
      assert.ok(pontos(p, p.vencedor, true) >= 10);
    }
  }
  assert.ok(acabaram >= 30, `só ${acabaram} de 40 acabaram`);
});
