import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AJUSTES_PADRAO, ajustesGuardados, avancar, dbDoPorcento, nivelDoBloco, novoPortao, porcentoDoDb, type Portao,
} from './sensibilidade.ts';

/** Um bloco do processador de áudio: 128 amostras a 48 kHz. */
const BLOCO_MS = (128 / 48000) * 1000;

/** Barulho de verdade oscila; um nível parado passaria em teste e falharia na casa de alguém. */
function sorteio(semente = 7) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 * 2 - 1; };
}

/** Roda `ms` de som em torno de `db` e devolve a fração do tempo com o microfone aberto. */
function tocar(p: Portao, db: number, ms: number, corte = -50, variacao = 3, rnd = sorteio()) {
  let abertos = 0, blocos = 0;
  for (let t = 0; t < ms; t += BLOCO_MS) {
    avancar(p, db + rnd() * variacao, BLOCO_MS, corte);
    blocos++;
    if (p.aberto) abertos++;
  }
  return abertos / blocos;
}

/** Fala com pausas de respiro, `segundos` dela; devolve a fração da fala que passou. */
function falar(p: Portao, db: number, segundos: number, corte = -50) {
  let passou = 0;
  for (let i = 0; i < segundos / 2; i++) { passou += tocar(p, db, 1600, corte); tocar(p, -60, 400, corte); }
  return passou / (segundos / 2);
}

test('o que ficou guardado: vazio, lixo e pedaço faltando voltam ao padrão', () => {
  assert.deepEqual(ajustesGuardados(null), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados(''), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('{isso não é json'), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('"forte"'), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('{"supressao":"turbo","corte":"-40"}'), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('{"supressao":"padrao"}'), { ...AJUSTES_PADRAO, supressao: 'padrao' });
  assert.deepEqual(ajustesGuardados('{"supressao":"desligada","corte":-42}'), { supressao: 'desligada', corte: -42 });
  // Um corte fora da régua não pode virar microfone que nunca abre.
  assert.equal(ajustesGuardados('{"corte":40}').corte, 0);
  assert.equal(ajustesGuardados('{"corte":-400}').corte, -100);
});

test('o "Ajustar sozinha" guardado por quem o ligou é ignorado: vale o corte fixo', () => {
  assert.deepEqual(ajustesGuardados('{"supressao":"forte","auto":true,"corte":-50}'), { supressao: 'forte', corte: -50 });
  assert.equal('auto' in AJUSTES_PADRAO, false);
});

test('o padrão nasce forte, com o corte em −50 dB: quem ouve o barulho não é quem precisa mexer', () => {
  assert.equal(AJUSTES_PADRAO.supressao, 'forte');
  assert.equal(AJUSTES_PADRAO.corte, -50);
});

test('a régua da barra vai de −100 dB a 0 dB e não passa das pontas', () => {
  assert.equal(porcentoDoDb(-100), 0);
  assert.equal(porcentoDoDb(0), 100);
  assert.equal(porcentoDoDb(-50), 50);
  assert.equal(porcentoDoDb(-300), 0);
  assert.equal(porcentoDoDb(12), 100);
  assert.equal(dbDoPorcento(25), -75);
  assert.equal(dbDoPorcento(porcentoDoDb(-37)), -37);
});

test('nível de um bloco: silêncio digital é o fundo da régua, e um seno cheio fica em −3 dB', () => {
  assert.equal(nivelDoBloco(new Float32Array(128)), -100);
  const seno = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000));
  assert.ok(Math.abs(nivelDoBloco(seno) + 3.01) < 0.05, String(nivelDoBloco(seno)));
});

test('silêncio fica fechado e a voz abre no primeiro bloco', () => {
  const p = novoPortao();
  assert.equal(tocar(p, -80, 1000), 0);
  avancar(p, -20, BLOCO_MS, -50);
  assert.equal(p.aberto, true);
});

test('o respiro entre duas palavras não fecha; um silêncio de verdade fecha', () => {
  const p = novoPortao();
  tocar(p, -20, 500, -50, 0);
  tocar(p, -80, 150, -50, 0);
  assert.equal(p.aberto, true, '150 ms de pausa não fecha');
  tocar(p, -20, 500, -50, 0);
  tocar(p, -80, 450, -50, 0);
  assert.equal(p.aberto, false, '450 ms de silêncio fecha');
});

test('voz no limite não picota: entre o corte e o corte menos a histerese, continua aberto', () => {
  const p = novoPortao();
  tocar(p, -20, 300, -50, 0);
  assert.equal(tocar(p, -52, 2000, -50, 0), 1);
});

// O "mutar sozinho" (08/10/2026): o corte automático subia até −20 dB e calava a fala
// normal, sem ícone de mudo. Estes são os dois casos medidos nele — passavam 7% e 15%.
test('depois de uma risada alta, a fala normal continua passando inteira', () => {
  const p = novoPortao();
  falar(p, -22, 10);
  for (let i = 0; i < 3; i++) tocar(p, -6, 1500);
  assert.equal(falar(p, -24, 30), 1);
  assert.equal(falar(p, -24, 60), 1);
});

test('com o som do jogo saindo pela caixa, a voz passa inteira', () => {
  const p = novoPortao();
  let voz = 0;
  for (let i = 0; i < 20; i++) { tocar(p, -34, 900); voz += tocar(p, -24, 900); }
  assert.equal(voz / 20, 1);
});

test('à mão vale o que a pessoa escolheu: o barulho abaixo do corte fica de fora', () => {
  const p = novoPortao();
  assert.ok(tocar(p, -45, 3000, -40) < 0.05);
  assert.ok(tocar(p, -20, 2000, -40) > 0.99);
});
