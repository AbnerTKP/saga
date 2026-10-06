/**
 * Os dados no copo (pedido do dono, 06/10/2026: "os dados quero animação deles girando também em
 * uma espécie de copo, foco em desempenho sem lag"). A animação é toda de CSS, em
 * `dadosNoCopo.css`; aqui fica só a regra que dá para testar sem tela: onde cada face mora no cubo e
 * quanto o cubo gira para parar com a face sorteada virada para quem olha.
 *
 * As faces opostas somam 7, como num dado de verdade: 1 na frente e 6 atrás, 2 à direita e 5 à
 * esquerda, 3 em cima e 4 embaixo.
 */

/** Onde cada face mora: o giro que a leva da frente ao lugar dela, antes do `translateZ`. */
export const FACE_NO_CUBO: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 }, 6: { x: 0, y: 180 },
  2: { x: 0, y: 90 }, 5: { x: 0, y: -90 },
  3: { x: 90, y: 0 }, 4: { x: -90, y: 0 },
};

/**
 * O giro do cubo que traz a face `n` para a frente: o desfaz de onde ela mora. Cada face mora a um
 * giro de um eixo só, então desfazer é girar o mesmo eixo ao contrário.
 */
export function giroParaAFrente(n: number): { x: number; y: number } {
  const f = FACE_NO_CUBO[n];
  if (!f) throw new Error(`um dado não tem a face ${n}`);
  return { x: -f.x || 0, y: f.y === 180 ? 180 : -f.y || 0 };
}

export type GiroDoDado = {
  /** O giro final (graus): a face sorteada de frente, e o dado torto como o parado de hoje. */
  fimX: number; fimY: number; giro: number;
  /** De onde ele parte, dentro do copo: voltas inteiras a mais em cada eixo, mais um tanto. */
  iniX: number; iniY: number; iniZ: number;
};

/** O dado parado fica um pouco torto, como à mesa: o branco para um lado, o vermelho para o outro. */
export const GIRO_PARADO: [number, number] = [-6, 8];

/**
 * O giro de um dado numa rolagem. Determinístico pela rolagem — as duas telas que a veem giram
 * igual, e o mesmo dado não repete o mesmo giro duas rolagens seguidas —, e de voltas inteiras a
 * mais sobre o giro final, para o cubo terminar EXATAMENTE na face sorteada.
 */
export function giroDoDado(face: number, rolagem: number, qual: 0 | 1): GiroDoDado {
  const { x, y } = giroParaAFrente(face);
  const sinal = (rolagem + qual) % 2 ? 1 : -1;
  const voltasX = 2 + ((rolagem + qual) % 2);
  const voltasY = 1 + ((rolagem * 3 + qual) % 2);
  const giro = GIRO_PARADO[qual];
  return {
    fimX: x, fimY: y, giro,
    iniX: x + sinal * (360 * voltasX + 40),
    iniY: y - sinal * (360 * voltasY + 25),
    iniZ: giro + sinal * (150 + 30 * qual),
  };
}
