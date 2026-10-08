import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMOSTRAS, desenharGrafico, dica, guardar, lerEstatisticas, porcento, resumir, type Amostra } from './conexao.ts';

// O formato é o do Chromium: o transporte aponta o par em uso, em segundos.
const relatorio = [
  { id: 'T01', type: 'transport', selectedCandidatePairId: 'CPb' },
  { id: 'CPa', type: 'candidate-pair', state: 'failed', currentRoundTripTime: 0.9 },
  { id: 'CPb', type: 'candidate-pair', state: 'succeeded', nominated: true, currentRoundTripTime: 0.0423 },
  { id: 'OT1', type: 'outbound-rtp', kind: 'audio', packetsSent: 5000 },
  { id: 'RI1', type: 'remote-inbound-rtp', kind: 'audio', packetsLost: 12, roundTripTime: 0.05 },
];

test('lê o ping do par em uso, em ms, e os contadores do seu áudio', () => {
  assert.deepEqual(lerEstatisticas(relatorio), { rtt: 42, enviados: 5000, perdidos: 12 });
});

test('o RTCStatsReport é um Map: lê pelos valores, não pelos pares', () => {
  const mapa = new Map(relatorio.map((e) => [e.id, e]));
  assert.deepEqual(lerEstatisticas(mapa), { rtt: 42, enviados: 5000, perdidos: 12 });
});

test('sem o transporte, vale o par que deu certo; sem par, o RTT do retorno do áudio', () => {
  assert.equal(lerEstatisticas(relatorio.filter((e) => e.type !== 'transport')).rtt, 42);
  assert.equal(lerEstatisticas(relatorio.filter((e) => e.type !== 'transport' && e.type !== 'candidate-pair')).rtt, 50);
  assert.deepEqual(lerEstatisticas([]), { rtt: null, enviados: null, perdidos: null });
});

test('a janela guarda um minuto e esquece o resto', () => {
  let h: Amostra[] = [];
  for (let i = 0; i < 100; i++) h = guardar(h, { rtt: i, enviados: null, perdidos: null });
  assert.equal(h.length, AMOSTRAS + 1);
  assert.equal(h[h.length - 1].rtt, 99);
});

test('o resumo: agora, média, pior, e a perda só do que andou na janela', () => {
  const h: Amostra[] = [
    { rtt: 40, enviados: 1000, perdidos: 50 },     // perda antiga, de antes da janela, não conta
    { rtt: 50, enviados: 1100, perdidos: 50 },
    { rtt: null, enviados: 1200, perdidos: 53 },
    { rtt: 60, enviados: 1300, perdidos: 56 },
  ];
  const r = resumir(h);
  assert.equal(r.agora, 60);
  assert.equal(r.media, 50);
  assert.equal(r.pior, 60);
  assert.deepEqual(r.pings, [40, 50, 60]);
  assert.ok(Math.abs(r.perda! - 6 / 306) < 1e-9, String(r.perda));
});

test('sem contador ou com uma amostra só, a perda é desconhecida, e não zero', () => {
  assert.equal(resumir([{ rtt: 40, enviados: null, perdidos: null }]).perda, null);
  assert.equal(resumir([{ rtt: 40, enviados: 10, perdidos: 0 }]).perda, null);
  assert.equal(resumir([]).agora, null);
});

test('o gráfico: escala mínima de 150 ms, o mais novo na borda direita', () => {
  const g = desenharGrafico([40, 45, 50], 240, 56);
  assert.equal(g.topo, 150);
  assert.deepEqual(g.ultimo, { x: 240, y: Math.round((56 - (50 / 150) * 56) * 10) / 10 });
  assert.equal(g.linhaDos100, Math.round((56 - (100 / 150) * 56) * 10) / 10);
  assert.equal(g.pontos.split(' ').length, 3);
});

test('um pico abre a escala com folga, e nada sai do desenho', () => {
  const g = desenharGrafico([40, 260, 180], 240, 56);
  assert.equal(g.topo, 300);
  for (const p of g.pontos.split(' ')) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && x <= 240 && y >= 0 && y <= 56, p);
  }
});

test('a dica só aparece quando dá para dizer de que lado está o problema', () => {
  assert.equal(dica({ voz: 42, servidor: 61, perda: 0 }), null);
  assert.match(dica({ voz: 120, servidor: 340, perda: 0 })!, /servidor/);
  assert.equal(dica({ voz: 200, servidor: 340, perda: 0 }), null, 'os dois lentos: não dá para culpar um');
  assert.match(dica({ voz: 42, servidor: 61, perda: 0.032 })!, /perdendo/);
  assert.equal(dica({ voz: null, servidor: null, perda: null }), null);
});

test('a porcentagem se escreve com vírgula', () => {
  assert.equal(porcento(0.032), '3,2%');
  assert.equal(porcento(0), '0,0%');
});
