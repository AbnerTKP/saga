import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPRITE } from '../boneco.ts';
import { cor } from '../quadro.ts';
import { LINHAS_GOIABA, PALETA_GOIABA } from './base-goiaba.ts';
import { IDS_DOS_LUTADORES } from '../tipos.ts';
import { MATERIAIS } from './materiais.ts';
import { PE_NA_ARTE } from './poses.ts';
import { CHAVES_DO_PIXEL, artePixel, quadroDoPixel, retratoDoPixel, tamanhoDoPixel } from './sprites.ts';
import './todos.ts';

/** As chaves que a luta pede ao desenhar um lutador (animacoes.ts), sem os sufixos. */
const CHAVES_DA_LUTA = [
  'parado0', 'parado1', 'andar1', 'andar2', 'andar3', 'andar4', 'investida', 'recuo', 'agachado', 'pulando', 'caindo',
  'pouso', 'defesa', 'defesaBaixa', 'socoPreparo', 'soco', 'socoTras', 'socoForte', 'chutePreparo', 'chute', 'chuteAlto',
  'socoBaixo', 'rasteira', 'socoAereo', 'chuteAereo', 'maosNoQuadril', 'rajada', 'soltarDuas', 'carrega', 'solta',
  'carregar1', 'carregar2', 'apanhar1', 'apanhar2', 'apanharBaixo', 'voando', 'caido', 'levantando', 'vitoria', 'derrota',
  'sumindo',
];

test('o parado do Goiaba é o zip, pixel por pixel, ampliado 3x com o pé na âncora', () => {
  const q = quadroDoPixel('goiaba', 0, 'parado0')!;
  const e = tamanhoDoPixel;
  assert.equal(e, 3);
  let opacos = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const letra = LINHAS_GOIABA[y][x];
    if (letra === '.') continue;
    opacos++;
    // a coluna 15 do zip é a do pé e fica centrada em ancoraX; a linha 30 é a sola, logo acima de ancoraY
    const x0 = SPRITE.ancoraX - 1 + (x - 15) * e, y0 = SPRITE.ancoraY - e + (y - 30) * e;
    for (let yy = y0; yy < y0 + e; yy++) for (let xx = x0; xx < x0 + e; xx++) {
      assert.equal(q.px[yy * q.largura + xx], cor(PALETA_GOIABA[letra]), `pixel ${x},${y} do zip`);
    }
  }
  // e nada além dele
  assert.equal(q.px.filter((c) => c !== 0).length, opacos * e * e);
});

test('toda pose da luta existe nos quatro, nas duas formas, do tamanho do sprite e pisando na âncora', () => {
  assert.deepEqual([...CHAVES_DA_LUTA].sort(), [...CHAVES_DO_PIXEL].sort());
  // lutador fora de todos.ts cairia no boneco antigo sem erro nenhum: é aqui que isso aparece
  for (const id of IDS_DOS_LUTADORES) for (const forma of [0, 1] as const) {
    assert.ok(retratoDoPixel(id, forma), `retrato de ${id} (forma ${forma})`);
    for (const chave of CHAVES_DA_LUTA) {
      const q = quadroDoPixel(id, forma, chave)!;
      assert.ok(q, `${id} ${chave} (forma ${forma})`);
      assert.equal(q.largura, SPRITE.largura, chave);
      assert.equal(q.altura, SPRITE.altura, chave);
      let fundo = -1;
      for (let i = q.px.length - 1; i >= 0; i--) if (q.px[i]) { fundo = Math.floor(i / q.largura); break; }
      assert.equal(fundo, SPRITE.ancoraY - 1, `${id} ${chave} (forma ${forma}) pisa na linha do chão`);
      // o pé fica perto da coluna da âncora: há pixel na linha do chão a até 12 pixels de arte dela
      const linha = q.px.subarray(fundo * q.largura, (fundo + 1) * q.largura);
      const perto = linha.some((c, x) => c !== 0 && Math.abs(x - SPRITE.ancoraX) <= 12 * tamanhoDoPixel);
      assert.ok(perto, `${id} ${chave} (forma ${forma}) com o pé perto da âncora`);
    }
  }
});

test('os sufixos da luta são tirados: grito da super, da transformação, volta e nocaute', () => {
  const g = (chave: string) => quadroDoPixel('goiaba', 0, chave);
  assert.equal(g('maosNoQuadrils'), g('maosNoQuadril'));
  assert.equal(g('soltas'), g('solta'));
  assert.equal(g('carregar1t'), g('carregar1'));
  assert.equal(g('soltarDuasv'), g('soltarDuas'));
  assert.equal(g('caidoko'), g('caido'));
  // e o "s" que é da própria pose fica
  assert.notEqual(g('socoTras'), g('soco'));
});

test('o quadro é guardado: a mesma pose devolve o mesmo objeto', () => {
  assert.equal(quadroDoPixel('goiaba', 1, 'chute'), quadroDoPixel('goiaba', 1, 'chute'));
  assert.notEqual(quadroDoPixel('goiaba', 1, 'chute'), quadroDoPixel('goiaba', 0, 'chute'));
});

test('a forma dourada muda o cabelo e deixa a roupa', () => {
  const normal = quadroDoPixel('goiaba', 0, 'soco')!, dourado = quadroDoPixel('goiaba', 1, 'soco')!;
  const diferentes: number[] = [];
  for (let i = 0; i < normal.px.length; i++) if (normal.px[i] !== dourado.px[i]) diferentes.push(Math.floor(i / normal.largura));
  assert.ok(diferentes.length > 0);
  // abaixo do queixo (linha 17 do zip) nada muda
  const queixo = SPRITE.ancoraY - tamanhoDoPixel + (17 - 30) * tamanhoDoPixel;
  assert.ok(diferentes.every((y) => y < queixo), 'só a cabeça muda');
});

test('a segunda cor gira a roupa e deixa cabelo, pele e olho como estão', () => {
  // pela cor, o cabelo escuro do zip girava junto e o Goiaba do espelho saía de cabelo verde
  const a = artePixel('goiaba', 0, 'parado0')!;
  const um = quadroDoPixel('goiaba', 0, 'parado0', 0)!, dois = quadroDoPixel('goiaba', 0, 'parado0', 1)!;
  let roupa = 0, girou = 0;
  for (let y = 0; y < a.altura; y++) for (let x = 0; x < a.largura; x++) {
    const m = a.mat[y * a.largura + x];
    if (!m) continue;
    const nome = MATERIAIS[m - 1];
    const i = (SPRITE.ancoraY - tamanhoDoPixel + (y - PE_NA_ARTE[1]) * tamanhoDoPixel) * um.largura + SPRITE.ancoraX - 1 + (x - PE_NA_ARTE[0]) * tamanhoDoPixel;
    if (nome === 'cabelo' || nome === 'pele' || nome === 'olho') assert.equal(dois.px[i], um.px[i], `${nome} em ${x},${y}`);
    else if (nome === 'camisa' || nome === 'calca') { roupa++; if (dois.px[i] !== um.px[i]) girou++; }
  }
  // contorno quase preto e o símbolo claro do peito não têm matiz para girar: ficam
  assert.ok(roupa > 20 && girou > roupa / 2, `${girou} de ${roupa} pixels de roupa mudaram`);
});

test('o retrato tem 32x32 e mostra a cabeça', () => {
  for (const forma of [0, 1] as const) {
    const r = retratoDoPixel('goiaba', forma)!;
    assert.equal(r.largura, 32);
    assert.equal(r.altura, 32);
    assert.ok(r.px.filter((c) => c !== 0).length > 32 * 32 * 0.4);
    assert.equal(retratoDoPixel('goiaba', forma), r);
  }
});
