/**
 * O esqueleto dos lutadores. Cada personagem é o MESMO boneco — quadril, tronco, cabeça, dois
 * braços e duas pernas — com proporções, roupa e cabeça próprias; uma pose é um punhado de
 * ângulos e alvos, e o desenho sai da pose. É o que deixa quatro personagens com dezenas de
 * quadros cada caberem em código: desenhar quadro a quadro à mão seriam milhares de pixels
 * escritos um por um, e o quadro 7 do chute nunca bateria com o 6.
 *
 * O desenho é sempre olhando para a DIREITA; quem luta do outro lado é o mesmo sprite espelhado.
 * Coordenadas em pixels do sprite, com y para baixo, a partir da ÂNCORA: o ponto no chão entre os
 * pés. Ângulo de membro: 0 aponta para baixo, 90 para a frente, 180 para cima.
 */
import { type Cor, type Quadro, criarQuadro } from './quadro.ts';
import { Mascara, type Forma, type P, type Tinta, pintarPeca } from './raster.ts';

export type Membro = {
  /** Ângulos (graus): o primeiro osso a partir de "para baixo", o segundo relativo ao primeiro. */
  ang?: [number, number];
  /** Onde a mão (ou o pé) deve chegar, a partir da âncora. O cotovelo e o joelho se acham sozinhos. */
  alvo?: P;
};

export type Pose = {
  /** O centro do quadril, a partir da âncora. */
  quadril: P;
  /** Inclinação do tronco: positivo é para a frente. */
  tronco: number;
  cabeca?: number;
  bracoF: Membro;
  bracoT: Membro;
  pernaF: Membro;
  pernaT: Membro;
  /** Mão fechada, aberta (rajada, defesa) — cada personagem desenha as duas. */
  maoF?: 'punho' | 'aberta';
  maoT?: 'punho' | 'aberta';
  /** Pé: ângulo da sola (0 é chão reto; positivo, ponta para cima). */
  peF?: number;
  peT?: number;
  /** A boca aberta do grito. */
  grito?: boolean;
  /** Olhos fechados (vitória, carregando) ou em X (nocaute). */
  olhos?: 'abertos' | 'fechados' | 'nocaute';
  /** Número livre que cada personagem usa como quiser: capa, rabo, cabelo balançando. */
  vento?: number;
};

export type Corpo = {
  tronco: number;
  pescoco: number;
  bracoSup: number;
  antebraco: number;
  coxa: number;
  canela: number;
  /** Ombros e quadris no tronco: [para a frente, para cima] a partir do quadril. */
  ombroF: P;
  ombroT: P;
  quadrilF: P;
  quadrilT: P;
};

export type Esqueleto = {
  corpo: Corpo;
  pose: Pose;
  quadril: P;
  /** Direções do tronco: `u` para a frente, `v` para cima. */
  u: P;
  v: P;
  pescoco: P;
  cabeca: P;
  angCabeca: number;
  ombroF: P; cotoveloF: P; maoF: P;
  ombroT: P; cotoveloT: P; maoT: P;
  quadrilF: P; joelhoF: P; tornozeloF: P;
  quadrilT: P; joelhoT: P; tornozeloT: P;
};

const RAD = Math.PI / 180;
export const dir = (grau: number): P => [Math.sin(grau * RAD), Math.cos(grau * RAD)];
export const soma = (a: P, b: P, k = 1): P => [a[0] + b[0] * k, a[1] + b[1] * k];
export const dist = (a: P, b: P) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** O ângulo (na convenção dos membros) de `a` para `b`. */
export const angulo = (a: P, b: P) => Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD;

/** Dois ossos até um alvo. `lado` diz para onde a junta dobra (o joelho vai para a frente). */
function ik(raiz: P, alvo: P, a: number, b: number, lado: P): [P, P] {
  let dx = alvo[0] - raiz[0], dy = alvo[1] - raiz[1];
  let d = Math.hypot(dx, dy);
  const max = a + b - 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  if (d < 0.01) d = 0.01;
  const ux = dx / d, uy = dy / d;
  const ao = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - ao * ao));
  let nx = -uy, ny = ux;
  if (nx * lado[0] + ny * lado[1] < 0) { nx = -nx; ny = -ny; }
  const junta: P = [raiz[0] + ux * ao + nx * h, raiz[1] + uy * ao + ny * h];
  return [junta, [raiz[0] + dx, raiz[1] + dy]];
}

function membro(raiz: P, m: Membro, a: number, b: number, lado: P): [P, P] {
  if (m.alvo) return ik(raiz, m.alvo, a, b, lado);
  const [a1, a2] = m.ang ?? [0, 0];
  const junta = soma(raiz, dir(a1), a);
  return [junta, soma(junta, dir(a1 + a2), b)];
}

export function montar(corpo: Corpo, pose: Pose): Esqueleto {
  const t = pose.tronco * RAD;
  const u: P = [Math.cos(t), Math.sin(t)];
  const v: P = [Math.sin(t), -Math.cos(t)];
  const q = pose.quadril;
  const noTronco = (f: number, h: number): P => [q[0] + u[0] * f + v[0] * h, q[1] + u[1] * f + v[1] * h];
  const ombroF = noTronco(...corpo.ombroF);
  const ombroT = noTronco(...corpo.ombroT);
  const pescoco = noTronco(0.5, corpo.tronco);
  const angCabeca = pose.tronco + (pose.cabeca ?? 0);
  const tc = angCabeca * RAD;
  const cabeca: P = [pescoco[0] + Math.sin(tc) * corpo.pescoco, pescoco[1] - Math.cos(tc) * corpo.pescoco];
  const quadrilF = noTronco(...corpo.quadrilF);
  const quadrilT = noTronco(...corpo.quadrilT);
  // Cotovelo dobra para trás e para baixo; joelho, para a frente.
  const [cotoveloF, maoF] = membro(ombroF, pose.bracoF, corpo.bracoSup, corpo.antebraco, [-0.4, 1]);
  const [cotoveloT, maoT] = membro(ombroT, pose.bracoT, corpo.bracoSup, corpo.antebraco, [-0.4, 1]);
  const [joelhoF, tornozeloF] = membro(quadrilF, pose.pernaF, corpo.coxa, corpo.canela, [1, -0.1]);
  const [joelhoT, tornozeloT] = membro(quadrilT, pose.pernaT, corpo.coxa, corpo.canela, [1, -0.1]);
  return {
    corpo, pose, quadril: q, u, v, pescoco, cabeca, angCabeca,
    ombroF, cotoveloF, maoF, ombroT, cotoveloT, maoT,
    quadrilF, joelhoF, tornozeloF, quadrilT, joelhoT, tornozeloT,
  };
}

/** Um ponto no referencial do tronco: [para a frente, para cima] a partir do quadril. */
export function noTronco(e: Esqueleto, f: number, h: number): P {
  return [e.quadril[0] + e.u[0] * f + e.v[0] * h, e.quadril[1] + e.u[1] * f + e.v[1] * h];
}

/** Um ponto no referencial da cabeça: [para a frente, para cima] a partir do centro dela. */
export function naCabeca(e: Esqueleto, f: number, h: number): P {
  const t = e.angCabeca * RAD;
  return [e.cabeca[0] + Math.cos(t) * f + Math.sin(t) * h, e.cabeca[1] + Math.sin(t) * f - Math.cos(t) * h];
}

/** Um ponto ao longo de um osso: `t` 0 na raiz, 1 na ponta; `lado` desloca na perpendicular. */
export function noOsso(a: P, b: P, t: number, lado = 0): P {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  return [a[0] + dx * t - (dy / d) * lado, a[1] + dy * t + (dx / d) * lado];
}

/** O pé: do calcanhar à ponta, deitado no chão com a sola no ângulo da pose. */
export function formaDoPe(tornozelo: P, comprimento: number, altura: number, ang = 0, recuo = 2): Forma {
  const a = ang * RAD;
  const f: P = [Math.cos(a), -Math.sin(a)];
  const up: P = [Math.sin(a), Math.cos(a)];
  const p = (x: number, y: number): P => [tornozelo[0] + f[0] * x - up[0] * y, tornozelo[1] + f[1] * x - up[1] * y];
  return {
    tipo: 'poligono',
    pts: [p(-recuo - 1, -1), p(-recuo, altura - 0.5), p(comprimento, altura - 0.5), p(comprimento + 0.5, altura * 0.4), p(comprimento * 0.45, -1.5)],
  };
}

export type Pintor = {
  q: Quadro;
  m: Mascara;
  peca: (formas: Forma[], t: Tinta) => void;
};

export function pintor(q: Quadro): Pintor {
  const m = new Mascara(q.largura, q.altura);
  return { q, m, peca: (formas, t) => pintarPeca(q, m, formas, t) };
}

/** A tinta de um tom: base, sombra, luz e contorno, a partir de cores escritas à mão. */
export const tinta = (base: Cor, sombra: Cor, contorno: Cor, luz?: Cor, faixa = 2): Tinta => ({ base, sombra, contorno, luz, faixa });

/** O tamanho do sprite de um lutador e onde fica a âncora nele. */
export const SPRITE = { largura: 128, altura: 120, ancoraX: 56, ancoraY: 112 };

export type Personagem = {
  id: string;
  nome: string;
  corpo: Corpo;
  /** Desenha o personagem no quadro já montado, com a âncora em (0, 0) somada pelo chamador. */
  desenhar: (p: Pintor, e: Esqueleto) => void;
};

/** Desenha uma pose num sprite novo, com a âncora no lugar de sempre. */
export function sprite(personagem: Personagem, pose: Pose): Quadro {
  const q = criarQuadro(SPRITE.largura, SPRITE.altura);
  const deslocada: Pose = {
    ...pose,
    quadril: [pose.quadril[0] + SPRITE.ancoraX, pose.quadril[1] + SPRITE.ancoraY],
    bracoF: moverAlvo(pose.bracoF), bracoT: moverAlvo(pose.bracoT),
    pernaF: moverAlvo(pose.pernaF), pernaT: moverAlvo(pose.pernaT),
  };
  personagem.desenhar(pintor(q), montar(personagem.corpo, deslocada));
  return q;
}

const moverAlvo = (m: Membro): Membro =>
  m.alvo ? { ...m, alvo: [m.alvo[0] + SPRITE.ancoraX, m.alvo[1] + SPRITE.ancoraY] } : m;
