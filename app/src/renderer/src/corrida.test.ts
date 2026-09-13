import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARADO, FISICA, carroNoGrid, classificar, codificar, decodificar, formatarDiferenca, formatarTempo, guardarFoto,
  interpolar, kmh, luzesAcesas, passo, type Carro, type Comandos, type Posicao,
} from './corrida.ts';
import { IDS_DAS_PISTAS, PASSO, idx, localizar, pistaPronta, pontoNaPista, type Pista } from './pista.ts';

const ACELERA: Comandos = { ...PARADO, acelera: true };
const DT = 1 / 120;
const INTERLAGOS = pistaPronta('interlagos');

/** O quanto o carro consegue virar a uma velocidade: é a mesma conta de `passo`. */
const giroPossivel = (v: number) => FISICA.giro * Math.min(1, v / 100) * (1 - 0.45 * Math.min(1, v / FISICA.maxima));

/**
 * Um piloto automático: mira um ponto à frente na pista e escolhe a velocidade pelas curvas que
 * vêm, freando a tempo. É o que deixa testar corridas inteiras sem teclado — e se ele não
 * consegue dar a volta sem cortar nem ficar preso no muro, a pista tem defeito.
 */
function piloto(p: Pista, c: Carro): Comandos {
  const local = localizar(p, c.x, c.y, c.indice);
  const alvo = pontoNaPista(p, local.distancia + 60 + Math.abs(c.velocidade) * 0.18);
  let erro = Math.atan2(alvo.y - c.y, alvo.x - c.x) - c.angulo;
  erro = Math.atan2(Math.sin(erro), Math.cos(erro));
  let desejada = FISICA.maxima;
  for (let d = 0; d <= 900; d += 20) {
    const i = idx(p, Math.round((local.distancia + d) / PASSO));
    const k = Math.abs(p.curv[i]);
    // a maior velocidade em que o carro faz esta curva, com folga
    let v = FISICA.maxima;
    while (v > 60 && v * k > giroPossivel(v) * 0.8) v -= 10;
    desejada = Math.min(desejada, Math.sqrt(v * v + 2 * FISICA.freio * 0.75 * d));
  }
  return {
    // devagar, acelera mesmo desalinhado: parado o carro não vira, e ficaria ali para sempre
    acelera: c.velocidade < desejada - 8 && (Math.abs(erro) < 0.6 || c.velocidade < 60),
    freia: c.velocidade > desejada + 12,
    esquerda: erro < -0.03,
    direita: erro > 0.03,
  };
}

function correr(p: Pista, c: Carro, segundos: number, voltas = 3) {
  let tempo = 0, carro = c, cortes = 0, batidasNoMuro = 0;
  for (let i = 0; i < segundos * 120; i++) {
    tempo += DT * 1000;
    const r = passo(p, carro, piloto(p, carro), DT, tempo, [], voltas);
    carro = r.carro;
    if (r.cortou) cortes++;
    if (r.batida?.muro && r.batida.forca > 80) batidasNoMuro++;
    if (carro.chegouEm !== null) break;
  }
  return { carro, tempo, cortes, batidasNoMuro };
}

test('acelerar anda para a frente e chega à máxima em uns 2,5 s, que é ~310 km/h', () => {
  let c = carroNoGrid(INTERLAGOS, 0);
  const inicio = localizar(INTERLAGOS, c.x, c.y).distancia;
  let t = 0;
  while (c.velocidade < FISICA.maxima - 1 && t < 600) { c = passo(INTERLAGOS, c, ACELERA, DT, t * 8, [], 3).carro; t++; }
  assert.ok(t / 120 > 1.5 && t / 120 < 3.5, `levou ${(t / 120).toFixed(2)} s`);
  assert.ok(localizar(INTERLAGOS, c.x, c.y).distancia !== inicio);
  assert.ok(kmh(FISICA.maxima) > 290 && kmh(FISICA.maxima) < 330, `${kmh(FISICA.maxima)} km/h`);
});

test('parado não gira; na grama e na brita a velocidade cai, e na brita cai mais', () => {
  let c = carroNoGrid(INTERLAGOS, 0);
  const angulo = c.angulo;
  c = passo(INTERLAGOS, c, { ...PARADO, direita: true }, DT, 0, [], 3).carro;
  assert.equal(c.angulo, angulo);

  const naVelocidade = (chao: Carro['chao']) => {
    let carro: Carro = { ...carroNoGrid(INTERLAGOS, 0), velocidade: FISICA.maxima, chao };
    // um passo só, sem sair do lugar de verdade: é a regra do chão que se mede
    for (let i = 0; i < 120; i++) carro = { ...passo(INTERLAGOS, { ...carro, x: carroNoGrid(INTERLAGOS, 0).x, y: carroNoGrid(INTERLAGOS, 0).y, chao }, ACELERA, DT, i * 8, [], 3).carro };
    return carro.velocidade;
  };
  const grama = naVelocidade('grama'), brita = naVelocidade('brita');
  assert.ok(grama <= FISICA.maxima * 0.56, `grama ${grama}`);
  assert.ok(brita <= FISICA.maxima * 0.26, `brita ${brita}`);
});

test('o muro segura: apontado para fora da pista a toda, o carro nunca atravessa um muro', () => {
  for (const id of ['interlagos', 'monaco', 'bahrein'] as const) {
    const p = pistaPronta(id);
    const cruza = (ax: number, ay: number, bx: number, by: number) => p.segmentos.some((s) => {
      const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
      return o(ax, ay, bx, by, s.ax, s.ay) !== o(ax, ay, bx, by, s.bx, s.by) && o(s.ax, s.ay, s.bx, s.by, ax, ay) !== o(s.ax, s.ay, s.bx, s.by, bx, by);
    });
    for (let d = 500; d < p.volta; d += 1300) {
      for (const s of [1, -1]) {
        const q = pontoNaPista(p, d);
        const l = localizar(p, q.x, q.y);
        let c: Carro = { ...carroNoGrid(p, 0), x: q.x, y: q.y, indice: l.indice, lateral: 0, angulo: q.angulo + (s * Math.PI) / 2.2, velocidade: FISICA.maxima };
        for (let i = 0; i < 120 * 3; i++) {
          const antes = c;
          c = passo(p, c, ACELERA, DT, i * 8, [], 3).carro;
          assert.ok(!cruza(antes.x, antes.y, c.x, c.y), `${id}, d=${d}, lado ${s}: atravessou o muro no passo ${i}`);
        }
      }
    }
  }
});

test('cortar caminho soma 3 s; sair da pista e voltar sem ganhar caminho, não', () => {
  const p = INTERLAGOS;
  const base = carroNoGrid(p, 0);
  const noAsfalto = (d: number) => {
    const q = pontoNaPista(p, d);
    const l = localizar(p, q.x, q.y);
    return { ...base, x: q.x, y: q.y, angulo: q.angulo, indice: l.indice, velocidade: 200, desdeLinha: d, progresso: d };
  };
  // saiu em 1000 e voltou em 1600 tendo andado 250 lá fora: atalho
  const cortou = passo(p, { ...noAsfalto(1600), fora: { progresso: 1000, andado: 250 } }, ACELERA, DT, 1000, [], 3);
  assert.equal(cortou.cortou, true);
  assert.equal(cortou.carro.punicao, FISICA.punicaoPorCorte);
  assert.equal(cortou.carro.fora, null);
  // saiu em 1000, andou 620 pela grama e voltou em 1600: só perdeu tempo
  const passeio = passo(p, { ...noAsfalto(1600), fora: { progresso: 1000, andado: 620 } }, ACELERA, DT, 1000, [], 3);
  assert.equal(passeio.cortou, false);
  assert.equal(passeio.carro.punicao, 0);
});

test('em cada uma das seis pistas o piloto automático dá duas voltas, sem cortar e sem ficar preso no muro', () => {
  for (const id of IDS_DAS_PISTAS) {
    const p = pistaPronta(id);
    const { carro, cortes } = correr(p, carroNoGrid(p, 0), 200, 2);
    assert.notEqual(carro.chegouEm, null, `${id}: parou na volta ${carro.volta}, a ${carro.desdeLinha.toFixed(0)} da linha`);
    assert.equal(cortes, 0, `${id}: cortou ${cortes} vez(es)`);
    assert.equal(carro.punicao, 0);
    assert.ok(carro.melhorVolta! > 20_000 && carro.melhorVolta! < 70_000, `${id}: volta de ${carro.melhorVolta} ms`);
    assert.ok(carro.melhoresSetores.every((s) => s !== null && s > 3000), `${id}: setores ${carro.melhoresSetores}`);
  }
});

test('cruzar a linha na largada não conta volta, e dar ré por cima dela não ganha nada', () => {
  const p = INTERLAGOS;
  let c = carroNoGrid(p, 0);
  for (let i = 0; i < 120 * 1.5; i++) c = passo(p, c, ACELERA, DT, i * 8, [], 3).carro;
  assert.equal(c.volta, 1);
  assert.ok(c.progresso > 0, 'já passou da linha');
  const depois = c.progresso;
  for (let i = 0; i < 480; i++) c = passo(p, c, { ...PARADO, freia: true }, DT, 2000 + i * 8, [], 3).carro;
  assert.equal(c.volta, 1);
  assert.ok(c.progresso < depois);
});

test('pular um setor não fecha a volta', () => {
  const p = INTERLAGOS;
  // quase no fim da volta, sem ter passado pelos setores, cruzando a linha
  const q = pontoNaPista(p, p.volta - 30);
  let c: Carro = { ...carroNoGrid(p, 0), x: q.x, y: q.y, angulo: q.angulo, velocidade: 400, desdeLinha: p.volta - 30, setor: 1, volta: 2 };
  for (let i = 0; i < 60; i++) c = passo(p, c, ACELERA, DT, 30_000 + i * 8, [], 3).carro;
  assert.equal(c.volta, 2);
});

test('batida: o carro sai de dentro do outro e perde velocidade só quando ia contra ele', () => {
  const c: Carro = { ...carroNoGrid(INTERLAGOS, 0), velocidade: 300 };
  const frente = { x: c.x + Math.cos(c.angulo) * 20, y: c.y + Math.sin(c.angulo) * 20 };
  const r = passo(INTERLAGOS, c, ACELERA, DT, 0, [frente], 3);
  assert.ok(r.batida && r.batida.forca > 50 && !r.batida.muro, `força ${r.batida?.forca}`);
  assert.ok(r.carro.velocidade < 250);
  assert.ok(Math.hypot(r.carro.x - frente.x, r.carro.y - frente.y) >= FISICA.raio * 2 - 0.001);

  const lado = { x: c.x - Math.sin(c.angulo) * 25, y: c.y + Math.cos(c.angulo) * 25 };
  const r2 = passo(INTERLAGOS, c, ACELERA, DT, 0, [lado], 3);
  assert.ok(Math.hypot(r2.carro.x - lado.x, r2.carro.y - lado.y) >= FISICA.raio * 2 - 0.001);
  assert.ok(r2.carro.velocidade > 295);
});

test('classificar: chegada pelo tempo com a punição, depois quem andou mais, e quem abandonou por último', () => {
  const lista = classificar([
    { id: 1, progresso: 900, chegouEm: null },
    { id: 2, progresso: 5000, chegouEm: 61_000 },
    { id: 3, progresso: 5000, chegouEm: 60_000, punicao: 3000 },
    { id: 4, progresso: 4000, chegouEm: null, abandonou: true },
    { id: 5, progresso: 1200, chegouEm: null, punicao: 6000 },
  ]);
  assert.deepEqual(lista.map((l) => l.id), [2, 3, 5, 1, 4]);
});

test('tempos escritos como na tela', () => {
  assert.equal(formatarTempo(62_430), '1:02,4');
  assert.equal(formatarTempo(9_960), '0:10,0');
  assert.equal(formatarDiferenca(1_280), '+1,3 s');
});

test('a posição vai e volta pelo LiveKit com a punição, e a versão antiga (sem punição) ainda é lida', () => {
  const c = { ...carroNoGrid(INTERLAGOS, 2), velocidade: 212.4, punicao: 3000 };
  const volta = decodificar(JSON.stringify(codificar(c, 4321.6)));
  assert.ok(volta);
  assert.equal(volta!.t, 4322);
  assert.equal(volta!.v, 212);
  assert.equal(volta!.c, null);
  assert.equal(volta!.pu, 3000);
  assert.equal(decodificar(JSON.stringify({ t: 1, x: 0, y: 0, a: 0, v: 0, p: 0, vo: 1, c: null }))!.pu, 0);
  assert.equal(decodificar('{"t":1}'), null);
  assert.equal(decodificar('não é json'), null);
  assert.equal(decodificar(JSON.stringify({ t: 1, x: NaN, y: 0, a: 0, v: 0, p: 0, vo: 1, c: null })), null);
});

test('interpolar: entre duas fotos, a reta; depois da última, só um pouco adiante', () => {
  const foto = (t: number, x: number, a = 0): Posicao => ({ t, x, y: 0, a, v: 100, p: 0, vo: 1, c: null, pu: 0 });
  let fotos: Posicao[] = [];
  fotos = guardarFoto(fotos, foto(100, 20));
  fotos = guardarFoto(fotos, foto(0, 10));
  fotos = guardarFoto(fotos, foto(100, 99));
  assert.deepEqual(fotos.map((f) => f.t), [0, 100]);
  assert.equal(interpolar(fotos, 50)!.x, 15);
  assert.equal(Math.round(interpolar(fotos, 1000)!.x), 35);
  const giro = interpolar([foto(0, 0, 3.1), foto(100, 0, -3.1)], 50)!;
  assert.ok(Math.abs(Math.abs(giro.a) - Math.PI) < 0.01, `ângulo ${giro.a}`);
  assert.equal(interpolar([], 10), null);
});

test('as luzes: uma por segundo, e apagam todas no zero', () => {
  assert.equal(luzesAcesas(-7000), 0);
  assert.equal(luzesAcesas(-5000), 1);
  assert.equal(luzesAcesas(-3500), 2);
  assert.equal(luzesAcesas(-1), 5);
  assert.equal(luzesAcesas(0), null);
});
