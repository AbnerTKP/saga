import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  casaClara, descreverMesa, destinosDe, emPares, formatarRelogio, indiceDaCasa, lerCasas, nomeDaCasa,
  ordemDasCasas, partesDoLance, pedePromocao, plateiaDaPartida, restante, textoDoFim, tomadas, type LanceLegal,
} from './xadrez.ts';

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('as casas saem da posição de a8 a h1, com as brancas embaixo', () => {
  const casas = lerCasas(INICIAL);
  assert.equal(casas.length, 64);
  assert.equal(casas[0], 'r');
  assert.equal(casas[4], 'k');
  assert.equal(casas[60], 'K');
  assert.equal(casas[indiceDaCasa('d4')], null);
  assert.equal(nomeDaCasa(0), 'a8');
  assert.equal(nomeDaCasa(63), 'h1');
  assert.equal(indiceDaCasa('e4'), 36);
  for (let i = 0; i < 64; i++) assert.equal(indiceDaCasa(nomeDaCasa(i)), i);
});

test('posição quebrada vira tabuleiro vazio, e não uma tela quebrada', () => {
  assert.deepEqual(lerCasas('lixo'), Array(64).fill(null));
  assert.deepEqual(lerCasas(''), Array(64).fill(null));
});

test('a1 é escura e h1 é clara, como em todo tabuleiro', () => {
  assert.equal(casaClara(indiceDaCasa('a1')), false);
  assert.equal(casaClara(indiceDaCasa('h1')), true);
  assert.equal(casaClara(indiceDaCasa('a8')), true);
});

test('quem joga de pretas vê as pretas embaixo', () => {
  assert.equal(ordemDasCasas('w')[0], 0);
  assert.equal(ordemDasCasas('b')[0], 63);
  assert.equal(ordemDasCasas('b')[63], 0);
});

const legais: LanceLegal[] = [
  { de: 'e7', para: 'e8', promocao: 'q', san: 'e8=Q' },
  { de: 'e7', para: 'e8', promocao: 'r', san: 'e8=R' },
  { de: 'e7', para: 'e8', promocao: 'b', san: 'e8=B' },
  { de: 'e7', para: 'e8', promocao: 'n', san: 'e8=N' },
  { de: 'e7', para: 'd8', promocao: 'q', san: 'exd8=Q+' },
  { de: 'e7', para: 'd8', promocao: 'r', san: 'exd8=R+' },
  { de: 'g1', para: 'f3', promocao: null, san: 'Nf3' },
];

test('a promoção chega como quatro lances e vira um ponto só', () => {
  assert.deepEqual(destinosDe(legais, 'e7'), [{ para: 'e8', captura: false }, { para: 'd8', captura: true }]);
  assert.equal(pedePromocao(legais, 'e7', 'e8'), true);
  assert.equal(pedePromocao(legais, 'g1', 'f3'), false);
  assert.deepEqual(destinosDe(legais, 'a2'), []);
});

test('a letra da peça vira o desenho dela, e o resto do lance fica como está', () => {
  assert.deepEqual(partesDoLance('Nf3'), [{ figura: true, texto: '♞' }, { figura: false, texto: 'f3' }]);
  assert.deepEqual(partesDoLance('exd8=Q+'), [
    { figura: false, texto: 'exd8=' }, { figura: true, texto: '♛' }, { figura: false, texto: '+' },
  ]);
  assert.deepEqual(partesDoLance('O-O'), [{ figura: false, texto: 'O-O' }]);
  assert.deepEqual(partesDoLance('e4'), [{ figura: false, texto: 'e4' }]);
});

test('os lances vão de dois em dois, e o último pode estar sozinho', () => {
  assert.deepEqual(emPares([{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }]), [
    { numero: 1, brancas: 'e4', pretas: 'e5' },
    { numero: 2, brancas: 'Nf3', pretas: null },
  ]);
  assert.deepEqual(emPares([]), []);
});

test('o que cada lado tomou sai do tabuleiro, e promoção não conta como captura', () => {
  assert.deepEqual(tomadas(lerCasas(INICIAL)), { pelasBrancas: '', pelasPretas: '' });
  // A Italiana do desenho: cada lado tomou um bispo e um peão.
  assert.deepEqual(
    tomadas(lerCasas('r1bqk2r/ppp2ppp/2n2n2/3p4/2BPP3/5N2/PP1N1PPP/R2QK2R w KQkq - 0 9')),
    { pelasBrancas: '♝♟', pelasPretas: '♝♟' },
  );
  // Um peão virou a segunda dama e a torre de h1 foi tomada: o peão não sumiu por captura.
  assert.deepEqual(
    tomadas(lerCasas('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNQ w - - 0 1')),
    { pelasBrancas: '', pelasPretas: '♜' },
  );
});

test('o relógio desconta o que passou só do lado que está correndo', () => {
  const r = { brancas: 252_000, pretas: 397_000, correndo: 'w' as const };
  assert.equal(restante(r, 'w', 2_000), 250_000);
  assert.equal(restante(r, 'b', 2_000), 397_000);
  assert.equal(restante(r, 'w', 999_999), 0);
  assert.equal(restante({ ...r, correndo: null }, 'w', 5_000), 252_000);
  // Relógio desta máquina atrasado em relação à resposta não devolve tempo a ninguém.
  assert.equal(restante(r, 'w', -3_000), 252_000);
});

test('o relógio se lê em minutos e segundos, e com décimos no fim', () => {
  assert.equal(formatarRelogio(600_000), '10:00');
  assert.equal(formatarRelogio(252_400), '04:12');
  assert.equal(formatarRelogio(1_800_000), '30:00');
  assert.equal(formatarRelogio(10_000), '00:10');
  assert.equal(formatarRelogio(9_450), '00:09.4');
  assert.equal(formatarRelogio(0), '00:00.0');
  assert.equal(formatarRelogio(-50), '00:00.0');
});

test('o convite diz o tempo e as peças como se fala', () => {
  assert.equal(descreverMesa(600, 'sorteio'), '10 min para cada um · peças no sorteio');
  assert.equal(descreverMesa(null, 'pretas'), 'sem relógio · você joga de pretas');
});

const tkp = { id: 1, nome: 'TKP' };
const juninho = { id: 2, nome: 'Juninho' };

test('o fim fala com quem lê: você venceu, ou fulano venceu', () => {
  assert.deepEqual(textoDoFim({ motivo: 'mate', vencedor: 2 }, tkp, juninho, 1), { titulo: 'Xeque-mate', frase: 'Juninho venceu com as pretas.' });
  assert.deepEqual(textoDoFim({ motivo: 'mate', vencedor: 2 }, tkp, juninho, 2), { titulo: 'Xeque-mate', frase: 'Você venceu com as pretas.' });
  assert.equal(textoDoFim({ motivo: 'tempo', vencedor: 1 }, tkp, juninho, 2).frase, 'O seu tempo acabou. TKP venceu com as brancas.');
  assert.equal(textoDoFim({ motivo: 'tempo', vencedor: 1 }, tkp, juninho, 9).frase, 'O tempo de Juninho acabou. TKP venceu com as brancas.');
  assert.equal(textoDoFim({ motivo: 'desistencia', vencedor: 1 }, tkp, juninho, 2).frase, 'Você desistiu. TKP venceu com as brancas.');
});

test('empate não tem vencedor, e diz por quê', () => {
  assert.deepEqual(
    textoDoFim({ motivo: 'afogamento', vencedor: null }, tkp, juninho, 1),
    { titulo: 'Empate por afogamento', frase: 'Não havia lance, e o rei não estava em xeque.' },
  );
  assert.equal(textoDoFim({ motivo: 'empate', vencedor: null }, tkp, juninho, 1).frase, 'Os dois aceitaram o empate.');
});

test('a plateia se lê com nomes, você primeiro, e a conta fora do corte', () => {
  assert.equal(plateiaDaPartida([], 1), null);
  assert.equal(plateiaDaPartida([{ id: 3, nome: 'Rafa' }], 1), 'Rafa assistindo');
  assert.equal(plateiaDaPartida([{ id: 3, nome: 'Rafa' }, { id: 1, nome: 'TKP' }], 1), 'Você e Rafa assistindo');
  assert.equal(
    plateiaDaPartida([{ id: 3, nome: 'Rafa' }, { id: 4, nome: 'Bia' }, { id: 5, nome: 'Caio' }, { id: 6, nome: 'Dudu' }], 1),
    'Rafa, Bia +2 assistindo',
  );
});
