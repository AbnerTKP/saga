import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PISTA, PARADO, FISICA, carroNoGrid, classificar, codificar, decodificar, desdeALinha, formatarDiferenca,
  formatarTempo, guardarFoto, interpolar, localizar, luzesAcesas, lugarNoGrid, passo, pontoNaPista,
  type Carro, type Comandos, type Posicao,
} from './corrida.ts';

const ACELERA: Comandos = { ...PARADO, acelera: true };
const DT = 1 / 120;

/**
 * Um piloto automático simples: aponta para um ponto um pouco à frente na pista e acelera,
 * tirando o pé quando a curva à frente pede. É o que deixa testar uma volta inteira sem teclado.
 */
function piloto(c: Carro): Comandos {
  const local = localizar(PISTA, c.x, c.y, c.indice);
  const alvo = pontoNaPista(PISTA, local.distancia + 90);
  let erro = Math.atan2(alvo.y - c.y, alvo.x - c.x) - c.angulo;
  erro = Math.atan2(Math.sin(erro), Math.cos(erro));
  return { acelera: Math.abs(erro) < 0.5 || c.velocidade < 180, freia: Math.abs(erro) > 0.9 && c.velocidade > 240, esquerda: erro < -0.04, direita: erro > 0.04 };
}

function correr(c: Carro, segundos: number, { voltas = 3, outros = [] as { x: number; y: number }[], desde = 0 } = {}) {
  let tempo = desde;
  let carro = c;
  for (let i = 0; i < segundos * 120; i++) {
    tempo += DT * 1000;
    carro = passo(PISTA, carro, piloto(carro), DT, tempo, outros, voltas).carro;
    if (carro.chegouEm !== null && carro.velocidade === 0) break;
  }
  return { carro, tempo };
}

test('a pista fecha, é larga e o grid fica todo atrás da linha, dentro do asfalto', () => {
  assert.ok(PISTA.volta > 2000, `volta de ${PISTA.volta}`);
  assert.equal(PISTA.largura, 84);
  for (let lugar = 0; lugar < 8; lugar++) {
    const p = lugarNoGrid(PISTA, lugar);
    const local = localizar(PISTA, p.x, p.y);
    assert.ok(local.afastamento < PISTA.largura / 2 - FISICA.raio, `lugar ${lugar} fora do asfalto`);
    assert.ok(desdeALinha(PISTA, local.distancia) > PISTA.volta * 0.75, `lugar ${lugar} não está atrás da linha`);
  }
  // Ninguém começa na frente de ninguém: a pole está mais perto da linha.
  assert.ok(carroNoGrid(PISTA, 0).progresso > carroNoGrid(PISTA, 7).progresso);
  assert.ok(carroNoGrid(PISTA, 0).progresso < 0);
});

test('acelerar anda para a frente, e não passa da máxima', () => {
  let c = carroNoGrid(PISTA, 0);
  const x0 = c.x;
  for (let i = 0; i < 120 * 1.8; i++) c = passo(PISTA, c, ACELERA, DT, i * 8, [], 3).carro;
  assert.ok(c.velocidade <= FISICA.maxima + 0.001);
  assert.ok(c.velocidade > FISICA.maxima * 0.9, `velocidade ${c.velocidade}`);
  assert.ok(c.x > x0 + 300, 'a reta de largada é para a direita');
});

test('parado não gira, e fora do asfalto a velocidade cai para a da grama', () => {
  let c = carroNoGrid(PISTA, 0);
  const angulo = c.angulo;
  c = passo(PISTA, c, { ...PARADO, direita: true }, DT, 0, [], 3).carro;
  assert.equal(c.angulo, angulo);

  // Um carro rápido, apontado para fora da pista.
  let fora: Carro = { ...carroNoGrid(PISTA, 0), velocidade: FISICA.maxima, angulo: Math.PI / 2 };
  for (let i = 0; i < 120 * 2; i++) fora = passo(PISTA, fora, ACELERA, DT, i * 8, [], 3).carro;
  assert.equal(fora.foraDaPista, true);
  assert.ok(fora.velocidade <= FISICA.foraMaxima + 1, `velocidade na grama ${fora.velocidade}`);
});

test('uma corrida de 3 voltas: as voltas contam uma vez cada, e a bandeirada tem hora', () => {
  const { carro } = correr(carroNoGrid(PISTA, 0), 120, { voltas: 3 });
  assert.notEqual(carro.chegouEm, null, `parou na volta ${carro.volta}, progresso ${carro.progresso}`);
  assert.equal(carro.volta, 4);
  assert.ok(carro.melhorVolta !== null && carro.melhorVolta > 3000, `melhor volta ${carro.melhorVolta}`);
  assert.ok(carro.chegouEm! > carro.melhorVolta! * 3 - 1000);
});

test('cruzar a linha na largada não conta volta, e dar ré por cima dela não ganha nada', () => {
  let c = carroNoGrid(PISTA, 0);
  for (let i = 0; i < 120; i++) c = passo(PISTA, c, ACELERA, DT, i * 8, [], 3).carro;
  assert.equal(c.volta, 1);
  assert.ok(c.progresso > 0, 'já passou da linha');
  const depois = c.progresso;
  for (let i = 0; i < 240; i++) c = passo(PISTA, c, { ...PARADO, freia: true }, DT, 1000 + i * 8, [], 3).carro;
  assert.equal(c.volta, 1);
  assert.ok(c.progresso < depois);
});

test('batida: o carro sai de dentro do outro e perde velocidade só quando ia contra ele', () => {
  const c: Carro = { ...carroNoGrid(PISTA, 0), velocidade: 300 };
  const naFrente = { x: c.x + 20, y: c.y };
  const r = passo(PISTA, c, ACELERA, DT, 0, [naFrente], 3);
  assert.ok(r.batida && r.batida.forca > 50, `força ${r.batida?.forca}`);
  assert.ok(r.carro.velocidade < 250);
  assert.ok(Math.hypot(r.carro.x - naFrente.x, r.carro.y - naFrente.y) >= FISICA.raio * 2 - 0.001);

  // O de trás encostando de lado não freia quem vai na frente.
  const deLado = { x: c.x, y: c.y + 25 };
  const r2 = passo(PISTA, c, ACELERA, DT, 0, [deLado], 3);
  assert.ok(Math.hypot(r2.carro.x - deLado.x, r2.carro.y - deLado.y) >= FISICA.raio * 2 - 0.001);
  assert.ok(r2.carro.velocidade > 295);
});

test('classificar: chegada pelo tempo, depois quem andou mais, e quem abandonou por último', () => {
  const lista = classificar([
    { id: 1, progresso: 900, chegouEm: null },
    { id: 2, progresso: 5000, chegouEm: 61_000 },
    { id: 3, progresso: 5000, chegouEm: 60_000 },
    { id: 4, progresso: 4000, chegouEm: null, abandonou: true },
    { id: 5, progresso: 1200, chegouEm: null },
  ]);
  assert.deepEqual(lista.map((l) => l.id), [3, 2, 5, 1, 4]);
});

test('tempos escritos como na tela', () => {
  assert.equal(formatarTempo(62_430), '1:02,4');
  assert.equal(formatarTempo(9_960), '0:10,0');
  assert.equal(formatarDiferenca(1_280), '+1,3 s');
});

test('a posição vai e volta pelo LiveKit, e lixo não vira carro', () => {
  const c = { ...carroNoGrid(PISTA, 2), velocidade: 212.4 };
  const volta = decodificar(JSON.stringify(codificar(c, 4321.6)));
  assert.ok(volta);
  assert.equal(volta!.t, 4322);
  assert.equal(volta!.v, 212);
  assert.equal(volta!.c, null);
  assert.equal(decodificar('{"t":1}'), null);
  assert.equal(decodificar('não é json'), null);
  assert.equal(decodificar(JSON.stringify({ t: 1, x: NaN, y: 0, a: 0, v: 0, p: 0, vo: 1, c: null })), null);
});

test('interpolar: entre duas fotos, a reta; depois da última, só um pouco adiante', () => {
  const foto = (t: number, x: number, a = 0): Posicao => ({ t, x, y: 0, a, v: 100, p: 0, vo: 1, c: null });
  let fotos: Posicao[] = [];
  fotos = guardarFoto(fotos, foto(100, 20));
  fotos = guardarFoto(fotos, foto(0, 10));
  fotos = guardarFoto(fotos, foto(100, 99));
  assert.deepEqual(fotos.map((f) => f.t), [0, 100]);
  assert.equal(interpolar(fotos, 50)!.x, 15);
  // Mais de 150 ms sem foto: não inventa por onde ele foi.
  assert.equal(Math.round(interpolar(fotos, 1000)!.x), 35);
  // O ângulo vai pelo caminho curto.
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
