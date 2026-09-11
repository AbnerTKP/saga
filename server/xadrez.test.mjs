import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POSICAO_INICIAL, ErroDeLance, lerFen, escreverFen, lancesLegais, jogar, chaveDeRepeticao, situacao, perft,
} from './xadrez.mjs';

/** Joga uma sequência de lances "e2e4" (promoção como quinto caractere) e devolve tudo o que aconteceu. */
function partida(fen, lances) {
  let posicao = lerFen(fen);
  const chaves = [chaveDeRepeticao(posicao)];
  const sans = [];
  for (const texto of lances) {
    const r = jogar(posicao, { de: texto.slice(0, 2), para: texto.slice(2, 4), promocao: texto[4] ?? null });
    posicao = r.posicao;
    chaves.push(chaveDeRepeticao(posicao));
    sans.push(r.lance.san);
  }
  return { posicao, chaves, sans };
}

const sansDe = (fen) => lancesLegais(lerFen(fen)).map((l) => l.san).sort();

// ---- perft: as contagens que todo motor de xadrez usa como prova ----------------------------

const PERFT = [
  ['inicial', POSICAO_INICIAL, [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['posição 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['posição 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['posição 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['posição 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];

for (const [nome, fen, contagens] of PERFT) {
  test(`perft da ${nome} bate com as contagens conhecidas`, () => {
    const posicao = lerFen(fen);
    contagens.forEach((esperado, i) => assert.equal(perft(posicao, i + 1), esperado, `profundidade ${i + 1}`));
  });
}

test('perft de profundidade zero é a própria posição', () => {
  assert.equal(perft(lerFen(POSICAO_INICIAL), 0), 1);
});

// ---- FEN ------------------------------------------------------------------------------------

test('FEN lido e escrito de volta é o mesmo FEN', () => {
  for (const [, fen] of PERFT) assert.equal(escreverFen(lerFen(fen)), fen);
  assert.equal(escreverFen(lerFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1')), '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
});

test('FEN sem os relógios ganha 0 e 1', () => {
  assert.equal(escreverFen(lerFen('4k3/8/8/8/8/8/8/4K3 w - -')), '4k3/8/8/8/8/8/8/4K3 w - - 0 1');
});

test('FEN que não pode existir é recusado, e com ErroDeLance', () => {
  const invalidos = [
    '',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1',          // sete fileiras
    'rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',  // fileira de nove
    'rnbqkbnr/pppppppp/44/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // dois números seguidos
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1',  // vez que não existe
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNK w - - 0 1',     // dois reis brancos
    'Pnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w - - 0 1',     // peão na última fileira
    '4k3/8/8/8/8/8/8/4K3 w - e3 0 1',                            // en passant sem peão
    '4k3/8/8/8/8/8/8/4K3 w - - x 1',                             // relógio que não é número
    '4k2R/8/8/8/8/8/8/4K3 w - - 0 1',                            // rei de quem não joga em xeque
  ];
  for (const fen of invalidos) assert.throws(() => lerFen(fen), ErroDeLance, fen);
});

test('roque que a posição já não permite é descartado, não recusado', () => {
  assert.equal(escreverFen(lerFen('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1')), '4k3/8/8/8/8/8/8/4K3 w - - 0 1');
});

// ---- SAN ------------------------------------------------------------------------------------

test('o mate do louco termina em Qh4#', () => {
  const { posicao, sans } = partida(POSICAO_INICIAL, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
  assert.deepEqual(sans, ['f3', 'e5', 'g4', 'Qh4#']);
  assert.deepEqual(situacao(posicao), { vez: 'w', xeque: true, fim: { motivo: 'mate', vencedor: 'b' } });
});

test('dois cavalos na mesma casa: a coluna desempata, e sem ela a fileira', () => {
  assert.ok(sansDe('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1').includes('Nbd2'));
  assert.ok(sansDe('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1').includes('Nfd2'));
  const mesmaColuna = sansDe('4k3/8/8/8/8/1N6/8/1N2K3 w - - 0 1');
  assert.ok(mesmaColuna.includes('N1d2') && mesmaColuna.includes('N3d2'), mesmaColuna.join(' '));
});

test('três damas na mesma casa: coluna, fileira ou as duas', () => {
  const sans = sansDe('8/7k/8/8/8/Q7/8/Q1Q4K w - - 0 1');
  for (const esperado of ['Qa1b2', 'Q3b2', 'Qcb2']) assert.ok(sans.includes(esperado), `${esperado} em ${sans.join(' ')}`);
});

test('roque dos dois lados, para os dois', () => {
  const brancas = sansDe('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(brancas.includes('O-O') && brancas.includes('O-O-O'));
  const pretas = lancesLegais(lerFen('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'));
  const curto = pretas.find((l) => l.san === 'O-O');
  assert.deepEqual({ de: curto.de, para: curto.para, roque: curto.roque }, { de: 'e8', para: 'g8', roque: 'curto' });
  assert.equal(pretas.find((l) => l.san === 'O-O-O').roque, 'longo');
});

test('roque não atravessa casa atacada, nem sai de xeque', () => {
  // A torre preta em f8 vigia f1: o roque curto some, o longo fica.
  const vigiado = sansDe('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!vigiado.includes('O-O') && vigiado.includes('O-O-O'));
  // Em xeque pela torre em e8, nenhum roque.
  const emXeque = sansDe('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!emXeque.includes('O-O') && !emXeque.includes('O-O-O'));
});

test('en passant sai como captura de peão, e tira o peão certo', () => {
  const posicao = lerFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  const ep = lancesLegais(posicao).find((l) => l.enPassant);
  assert.deepEqual(ep, { de: 'e5', para: 'd6', peca: 'P', captura: 'p', promocao: null, roque: null, enPassant: true, san: 'exd6' });
  assert.equal(escreverFen(jogar(posicao, { de: 'e5', para: 'd6' }).posicao), '4k3/8/3P4/8/8/8/8/4K3 b - - 0 1');
});

test('promoção vira um lance por peça, e a que dá xeque leva o +', () => {
  const sans = sansDe('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1').filter((s) => s.startsWith('b8'));
  assert.deepEqual(sans, ['b8=B', 'b8=N', 'b8=Q+', 'b8=R+']);
});

// ---- jogar ----------------------------------------------------------------------------------

test('os relógios, o en passant e a vez andam com os lances', () => {
  const { posicao: depoisDeE4 } = partida(POSICAO_INICIAL, ['e2e4']);
  assert.equal(escreverFen(depoisDeE4), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  const { posicao } = partida(POSICAO_INICIAL, ['e2e4', 'e7e5', 'g1f3']);
  assert.equal(escreverFen(posicao), 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
});

test('mexer o rei ou a torre tira o direito de roque; capturar a torre também', () => {
  assert.equal(escreverFen(partida('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['h1h2']).posicao).split(' ')[2], 'Qkq');
  assert.equal(escreverFen(partida('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['e1d1']).posicao).split(' ')[2], 'kq');
  assert.equal(escreverFen(partida('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['a1a8']).posicao).split(' ')[2], 'Kk');
});

test('lance ilegal é recusado, inclusive o que deixa o próprio rei em xeque', () => {
  const inicial = lerFen(POSICAO_INICIAL);
  assert.throws(() => jogar(inicial, { de: 'e2', para: 'e5' }), ErroDeLance);
  assert.throws(() => jogar(inicial, { de: 'e4', para: 'e5' }), ErroDeLance);
  assert.throws(() => jogar(inicial, { de: 'z9', para: 'e5' }), ErroDeLance);
  assert.throws(() => jogar(inicial, {}), ErroDeLance);
  // O bispo em e2 está cravado pela torre em e7 contra o rei em e1.
  assert.throws(() => jogar(lerFen('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1'), { de: 'e2', para: 'd3' }), ErroDeLance);
});

test('promoção exige a peça, e peça de promoção num lance comum é recusada', () => {
  const posicao = lerFen('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  assert.throws(() => jogar(posicao, { de: 'b7', para: 'b8' }), ErroDeLance);
  assert.throws(() => jogar(posicao, { de: 'b7', para: 'b8', promocao: 'k' }), ErroDeLance);
  const { posicao: nova, lance } = jogar(posicao, { de: 'b7', para: 'b8', promocao: 'n' });
  assert.equal(escreverFen(nova), '1N2k3/8/8/8/8/8/8/4K3 b - - 0 1');
  assert.equal(lance.promocao, 'n');
  assert.throws(() => jogar(lerFen(POSICAO_INICIAL), { de: 'e2', para: 'e4', promocao: 'q' }), ErroDeLance);
});

test('jogar não mexe na posição que recebeu', () => {
  const posicao = lerFen(POSICAO_INICIAL);
  const antes = JSON.stringify(posicao);
  jogar(posicao, { de: 'e2', para: 'e4' });
  assert.equal(JSON.stringify(posicao), antes);
});

// ---- situação -------------------------------------------------------------------------------

test('afogamento é empate, sem vencedor', () => {
  assert.deepEqual(situacao(lerFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')),
    { vez: 'b', xeque: false, fim: { motivo: 'afogamento', vencedor: null } });
});

test('material insuficiente: só quando ninguém consegue dar mate', () => {
  const fim = (fen) => situacao(lerFen(fen)).fim?.motivo ?? null;
  assert.equal(fim('8/8/8/4k3/8/8/8/4K3 w - - 0 1'), 'material');             // rei contra rei
  assert.equal(fim('8/8/8/4k3/8/8/8/2B1K3 w - - 0 1'), 'material');           // rei e bispo
  assert.equal(fim('8/8/8/4k3/8/8/8/1N2K3 w - - 0 1'), 'material');           // rei e cavalo
  assert.equal(fim('5b2/8/8/4k3/8/8/8/2B1K3 w - - 0 1'), 'material');         // bispos na mesma cor
  assert.equal(fim('2b5/8/8/4k3/8/8/8/2B1K3 w - - 0 1'), null);               // bispos em cores diferentes
  assert.equal(fim('8/8/8/4k3/8/8/8/R3K3 w - - 0 1'), null);                  // torre ainda dá mate
  assert.equal(fim('8/8/8/4k3/8/8/8/1NN1K3 w - - 0 1'), null);                // dois cavalos: fora da lista
});

test('cinquenta lances sem peão nem captura é empate', () => {
  assert.equal(situacao(lerFen('8/8/8/4k3/8/8/R7/4K3 w - - 100 80')).fim?.motivo, 'cinquentaLances');
  assert.equal(situacao(lerFen('8/8/8/4k3/8/8/R7/4K3 w - - 99 80')).fim, null);
});

test('a mesma posição pela terceira vez é empate', () => {
  const vaiEVolta = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  const duas = partida(POSICAO_INICIAL, vaiEVolta);
  assert.equal(situacao(duas.posicao, duas.chaves).fim, null);
  const tres = partida(POSICAO_INICIAL, [...vaiEVolta, ...vaiEVolta]);
  assert.deepEqual(situacao(tres.posicao, tres.chaves).fim, { motivo: 'repeticao', vencedor: null });
});

test('en passant que ninguém pode capturar não separa posições na repetição', () => {
  const depoisDeE4 = partida(POSICAO_INICIAL, ['e2e4']).posicao;
  assert.equal(chaveDeRepeticao(depoisDeE4), chaveDeRepeticao(lerFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')));
  // Com um peão preto em d4, a captura existe — e aí a casa conta.
  assert.ok(chaveDeRepeticao(lerFen('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1')).endsWith(' e3'));
});

test('a situação comum: vez, xeque e partida seguindo', () => {
  assert.deepEqual(situacao(lerFen(POSICAO_INICIAL)), { vez: 'w', xeque: false, fim: null });
  // Torre em e1 dando xeque no rei preto, que tem para onde ir.
  assert.deepEqual(situacao(lerFen('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1')), { vez: 'b', xeque: true, fim: null });
});
