/**
 * O retrato do placar sai do PRÓPRIO lutador: o mesmo `desenhar` da luta, numa pose parada, e um
 * recorte quadrado em volta da cabeça. Retrato pintado à parte envelheceria calado — trocar o
 * cabelo do personagem e esquecer o retrato é o tipo de coisa que só se nota com o jogo publicado.
 *
 * Nada aqui sabe de personagem nenhum: a pose sai das medidas do `Corpo`, e o recorte se acha
 * pela cabeça do esqueleto montado e pelo que foi pintado em volta dela. O fundo do retrato é
 * transparente; a moldura é do placar.
 */
import { type Quadro, colar, criarQuadro, ler } from './quadro.ts';
import { type Corpo, type Personagem, type Pose, SPRITE, montar, sprite } from './boneco.ts';
import type { P } from './raster.ts';

/**
 * Um retrato é um quadro comum — cola onde qualquer quadro cola — que lembra onde está a cabeça
 * dentro dele. É o que deixa o placar compacto tirar um rosto menor do retrato de 32 sem saber
 * de quem é: cada personagem tem a cabeça num lugar.
 */
export type Retrato = Quadro & {
  /** O centro da cabeça do esqueleto, dentro do retrato. */
  cabeca: P;
  /** A primeira linha pintada da cabeça (a ponta do cabelo, do turbante, do domo). */
  topo: number;
  /** O meio, na horizontal, do que foi pintado da cabeça. */
  meio: number;
};

/** Do centro da cabeça até o que precisa sobrar abaixo dela: o queixo e um respiro. */
const ABAIXO_DA_CABECA = 10;
/** A folga entre a ponta do cabelo e a borda de cima, quando cabe. */
const FOLGA_EM_CIMA = 2;
/** Até onde, para os lados do centro da cabeça, ainda é cabeça. Mais que isso é ombreira ou capa. */
const RAIO_DA_CABECA = 20;

/**
 * A pose do retrato: em pé, tronco e cabeça RETOS (a cabeça torta cortaria o topo do cabelo de um
 * lado e sobraria fundo do outro) e braços caídos — a guarda da pose de luta põe o punho na frente
 * do queixo. Tudo por ângulo, nada por alvo: alvo é distância da âncora e pede medida de cada
 * corpo, ângulo não. A altura do quadril sai das pernas, então corpo comprido ou troncudo fica com
 * os pés no chão do mesmo jeito.
 */
export function poseDeRetrato(corpo: Corpo): Pose {
  const abertura = 8;
  const perna = (corpo.coxa + corpo.canela) * Math.cos((abertura * Math.PI) / 180);
  return {
    quadril: [0, -Math.round(perna + 3)],
    tronco: 0,
    cabeca: 0,
    bracoF: { ang: [10, 20] },
    bracoT: { ang: [-6, 22] },
    pernaF: { ang: [abertura, 0] },
    pernaT: { ang: [-abertura, 0] },
    olhos: 'abertos',
  };
}

/**
 * Onde cortar. A cabeça fica com a ponta do cabelo perto da borda de cima e o resto é ombro — é o
 * que faz a cabeça pequena da Geladeira e o cabelo em chama do Vegetal saírem os dois inteiros e
 * no alto. Mas o queixo nunca sai: cabelo alto demais para o lado perde a ponta, não o rosto. Por
 * isso o retrato de 20 é o rosto com a franja, e não o cabelo sem boca.
 */
function enquadrar(cabeca: P, topo: number, meio: number, lado: number): [number, number] {
  // centrado no que foi pintado da cabeça (cabelo e turbante inclusive), e não no centro do osso
  const x0 = Math.round(meio - lado / 2);
  const y0 = Math.max(topo - FOLGA_EM_CIMA, Math.round(cabeca[1]) + ABAIXO_DA_CABECA - lado);
  return [x0, y0];
}

function recortar(origem: Quadro, cabeca: P, topo: number, meio: number, lado: number): Retrato {
  const [x0, y0] = enquadrar(cabeca, topo, meio, lado);
  const r = criarQuadro(lado, lado);
  colar(r, origem, -x0, -y0);
  return { ...r, cabeca: [cabeca[0] - x0, cabeca[1] - y0], topo: topo - y0, meio: meio - x0 };
}

/**
 * O retrato de um lutador: `lado` x `lado`, olhando para a direita como todo sprite. Quem luta do
 * lado de lá cola espelhado, e aí o retrato olha para o meio da tela, para o adversário.
 *
 * O recorte NÃO amplia nem reduz: pixel art ampliada vira borrão ou bloco. Retrato menor é recorte
 * mais justo, com os mesmos pixels da luta.
 */
export function retratoDe(personagem: Personagem, lado = 32, pose: Pose = poseDeRetrato(personagem.corpo)): Retrato {
  const s = sprite(personagem, pose);
  // A cabeça no sprite: montar com o quadril deslocado pela âncora, como `sprite` faz por dentro.
  // A pose do retrato não tem alvo nenhum, então só o quadril precisa andar.
  const e = montar(personagem.corpo, { ...pose, quadril: [pose.quadril[0] + SPRITE.ancoraX, pose.quadril[1] + SPRITE.ancoraY] });
  // O que foi pintado acima do pescoço e perto da cabeça é a cabeça — cabelo, antena e domo
  // incluídos, que o esqueleto não conhece.
  const x0 = Math.max(0, Math.round(e.cabeca[0] - RAIO_DA_CABECA)), x1 = Math.min(s.largura - 1, Math.round(e.cabeca[0] + RAIO_DA_CABECA));
  const yPescoco = Math.round(e.pescoco[1]);
  let topo = yPescoco, esq = Infinity, dir = -Infinity;
  for (let y = 0; y <= yPescoco; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ler(s, x, y) === 0) continue;
      if (y < topo) topo = y;
      if (x < esq) esq = x;
      if (x > dir) dir = x;
    }
  }
  const meio = dir >= esq ? (esq + dir + 1) / 2 : e.cabeca[0];
  return recortar(s, e.cabeca, topo, meio, lado);
}

/**
 * Um retrato menor tirado de outro — o placar compacto recebe o de 32 e mostra só o rosto. Usa a
 * cabeça que o retrato lembra, então sai igual a pedir `retratoDe` já no tamanho menor. Quadro
 * sem essa lembrança (um retrato feito à mão) é cortado pelo meio.
 */
export function apertarRetrato(retrato: Quadro | Retrato, lado: number): Retrato {
  if ('cabeca' in retrato) return recortar(retrato, retrato.cabeca, retrato.topo, retrato.meio, lado);
  const meio = retrato.largura / 2;
  return recortar(retrato, [meio, retrato.altura / 2], Math.round(retrato.altura / 2 - lado / 2) + FOLGA_EM_CIMA, meio, lado);
}
