import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AJUSTES_PADRAO, CORTE_AUTOMATICO_MAX, CORTE_AUTOMATICO_MIN, ajustesGuardados, avancar, corteVigente,
  dbDoPorcento, nivelDoBloco, novoPortao, porcentoDoDb, type Portao,
} from './sensibilidade.ts';

/** Um bloco do processador de áudio: 128 amostras a 48 kHz. */
const BLOCO_MS = (128 / 48000) * 1000;

/** Barulho de verdade oscila; um nível parado passaria em teste e falharia na casa de alguém. */
function sorteio(semente = 7) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 * 2 - 1; };
}

/** Roda `ms` de som em torno de `db` e devolve a fração do tempo com o microfone aberto. */
function tocar(p: Portao, db: number, ms: number, auto: boolean, corte = -50, variacao = 3, rnd = sorteio()) {
  let abertos = 0, blocos = 0;
  for (let t = 0; t < ms; t += BLOCO_MS) {
    avancar(p, db + rnd() * variacao, BLOCO_MS, auto, corte);
    blocos++;
    if (p.aberto) abertos++;
  }
  return abertos / blocos;
}

test('o que ficou guardado: vazio, lixo e pedaço faltando voltam ao padrão', () => {
  assert.deepEqual(ajustesGuardados(null), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados(''), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('{isso não é json'), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('"forte"'), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('{"supressao":"turbo","auto":"sim","corte":"-40"}'), AJUSTES_PADRAO);
  assert.deepEqual(ajustesGuardados('{"supressao":"padrao"}'), { ...AJUSTES_PADRAO, supressao: 'padrao' });
  assert.deepEqual(ajustesGuardados('{"supressao":"desligada","auto":false,"corte":-42}'), { supressao: 'desligada', auto: false, corte: -42 });
  // Um corte fora da régua não pode virar microfone que nunca abre.
  assert.equal(ajustesGuardados('{"corte":40}').corte, 0);
  assert.equal(ajustesGuardados('{"corte":-400}').corte, -100);
});

test('o padrão nasce ligado e forte: quem ouve o barulho não é quem precisa mexer', () => {
  assert.equal(AJUSTES_PADRAO.supressao, 'forte');
  assert.equal(AJUSTES_PADRAO.auto, true);
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

test('à mão: silêncio fica fechado e a voz abre no primeiro bloco', () => {
  const p = novoPortao();
  assert.equal(tocar(p, -80, 1000, false), 0);
  avancar(p, -20, BLOCO_MS, false, -50);
  assert.equal(p.aberto, true);
});

test('o respiro entre duas palavras não fecha; um silêncio de verdade fecha', () => {
  const p = novoPortao();
  tocar(p, -20, 500, false, -50, 0);
  tocar(p, -80, 150, false, -50, 0);
  assert.equal(p.aberto, true, '150 ms de pausa não fecha');
  tocar(p, -20, 500, false, -50, 0);
  tocar(p, -80, 450, false, -50, 0);
  assert.equal(p.aberto, false, '450 ms de silêncio fecha');
});

test('voz no limite não picota: entre o corte e o corte menos a histerese, continua aberto', () => {
  const p = novoPortao();
  tocar(p, -20, 300, false, -50, 0);
  assert.equal(tocar(p, -52, 2000, false, -50, 0), 1);
});

test('sozinha, numa casa com barulho constante: o barulho fica de fora e a voz passa', () => {
  const p = novoPortao();
  tocar(p, -50, 6000, true);
  const corte = corteVigente(p, true, -50);
  assert.ok(corte > -45 && corte <= CORTE_AUTOMATICO_MAX, `corte ${corte}`);
  assert.ok(tocar(p, -50, 2000, true) < 0.05, 'o barulho quase nunca abre');
  assert.ok(tocar(p, -20, 2000, true) > 0.99, 'a voz passa');
});

test('sozinha, numa conversa com pausas: o piso fica no barulho, não sobe para a voz', () => {
  const p = novoPortao();
  let aberto = 0;
  for (let i = 0; i < 10; i++) {
    aberto += tocar(p, -20, 1500, true);
    tocar(p, -50, 400, true);
  }
  assert.ok(p.piso < -45, `piso ${p.piso}`);
  assert.ok(aberto / 10 > 0.99, 'a fala continua passando inteira');
});

test('sozinha, uma fala comprida sem pausa nenhuma não se corta', () => {
  const p = novoPortao();
  tocar(p, -55, 3000, true);
  assert.ok(tocar(p, -20, 10000, true) > 0.99);
});

test('sozinha, a TV ligada no meio da call é alcançada em segundos', () => {
  const p = novoPortao();
  tocar(p, -60, 5000, true);
  const r = sorteio(3);
  tocar(p, -38, 6000, true, -50, 4, r);
  assert.ok(tocar(p, -38, 2000, true, -50, 4, r) < 0.1, `depois de 6 s a TV quase não passa (piso ${p.piso})`);
  assert.ok(tocar(p, -18, 1000, true) > 0.99, 'a voz perto do microfone continua passando');
});

test('sozinha, a TV com pausas não entra depois que você falou — foi o que a medida pegou', () => {
  const p = novoPortao();
  tocar(p, -12, 2000, true);
  let tv = 0;
  for (let i = 0; i < 6; i++) {
    tv += tocar(p, -32, 1700, true);
    tocar(p, -75, 300, true, -50, 2);
  }
  assert.ok(tv / 6 < 0.1, `a TV passou ${(100 * tv / 6).toFixed(0)}% do tempo (corte ${corteVigente(p, true, -50)})`);
  assert.ok(tocar(p, -13, 1000, true) > 0.99, 'a voz continua passando');
});

test('sozinha, alguns minutos calado não deixam a TV alcançar a voz lembrada', () => {
  const p = novoPortao();
  tocar(p, -12, 2000, true);
  for (let i = 0; i < 90; i++) { tocar(p, -32, 1700, true, -50, 3); tocar(p, -75, 300, true, -50, 2); }
  assert.ok(tocar(p, -32, 2000, true) < 0.1, `depois de 3 min calado (corte ${corteVigente(p, true, -50)})`);
});

test('sozinha, quem passa a falar 10 dB mais baixo continua passando', () => {
  const p = novoPortao();
  tocar(p, -12, 5000, true);
  let passou = 0;
  for (let i = 0; i < 5; i++) { passou += tocar(p, -22, 1600, true); tocar(p, -60, 400, true); }
  assert.ok(passou / 5 > 0.9, `passou ${(100 * passou / 5).toFixed(0)}%`);
});

test('o corte automático tem limites: nem abre para o silêncio, nem corta voz', () => {
  const p = novoPortao();
  tocar(p, -100, 6000, true, -50, 0);
  assert.equal(corteVigente(p, true, -50), CORTE_AUTOMATICO_MIN);
  tocar(p, 0, 6000, true, -50, 0);
  assert.equal(corteVigente(p, true, -50), CORTE_AUTOMATICO_MAX);
  // À mão vale o que a pessoa escolheu, qualquer que seja o piso.
  assert.equal(corteVigente(p, false, -63), -63);
});
