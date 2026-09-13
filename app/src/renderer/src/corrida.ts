/**
 * A corrida de Fórmula 1 sem tela: a pista, o carro, as voltas, a batida e a classificação.
 *
 * Tudo aqui é conta pura, testada sem navegador. A tela (`TelaDaCorrida`) só lê o teclado,
 * chama `passo` e desenha. Cada app simula o PRÓPRIO carro e manda a posição pelo LiveKit; os
 * carros dos outros chegam por lá e são desenhados onde disseram estar (`interpolar`). A
 * batida é resolvida por cada um contra a posição que recebeu dos outros — os dois lados
 * empurram o próprio carro, e por isso ela parece a mesma batida nas duas telas.
 *
 * Unidades: a pista mora num mundo de ~1000 x 800, e o carro tem 36 de comprimento. O tempo
 * de corrida é em milissegundos desde as luzes apagarem, no relógio do SERVIDOR — é ele que
 * põe todos os carros no mesmo instante.
 */

// ---- os carros ----------------------------------------------------------------

export type Equipe = { nome: string; curto: string; pri: string; sec: string; acc: string; cor: string };

export const EQUIPES = {
  rbr: { nome: 'Red Bull Racing', curto: 'Red Bull', pri: '#1e2b63', sec: '#d8102f', acc: '#ffc906', cor: '#3671c6' },
  fer: { nome: 'Ferrari', curto: 'Ferrari', pri: '#dc0000', sec: '#1b1b1b', acc: '#ffe000', cor: '#e8002d' },
  mcl: { nome: 'McLaren', curto: 'McLaren', pri: '#ff8000', sec: '#14161b', acc: '#47c7fc', cor: '#ff8000' },
  mer: { nome: 'Mercedes', curto: 'Mercedes', pri: '#c3cad1', sec: '#00d2be', acc: '#1b1d21', cor: '#27f4d2' },
} satisfies Record<string, Equipe>;

export type CodigoDoCarro = 'VER' | 'HAD' | 'LEC' | 'HAM' | 'NOR' | 'PIA' | 'RUS' | 'ANT';

/** Na ordem do grid da tela, equipe por equipe. Os códigos são protocolo com o servidor. */
export const CARROS: { cod: CodigoDoCarro; piloto: string; equipe: keyof typeof EQUIPES }[] = [
  { cod: 'VER', piloto: 'Max Verstappen', equipe: 'rbr' },
  { cod: 'HAD', piloto: 'Isack Hadjar', equipe: 'rbr' },
  { cod: 'LEC', piloto: 'Charles Leclerc', equipe: 'fer' },
  { cod: 'HAM', piloto: 'Lewis Hamilton', equipe: 'fer' },
  { cod: 'NOR', piloto: 'Lando Norris', equipe: 'mcl' },
  { cod: 'PIA', piloto: 'Oscar Piastri', equipe: 'mcl' },
  { cod: 'RUS', piloto: 'George Russell', equipe: 'mer' },
  { cod: 'ANT', piloto: 'Kimi Antonelli', equipe: 'mer' },
];

export const dadosDoCarro = (cod: string) => CARROS.find((c) => c.cod === cod) ?? CARROS[0];
export const equipeDoCarro = (cod: string): Equipe => EQUIPES[dadosDoCarro(cod).equipe];

// ---- a pista --------------------------------------------------------------------

export type Pista = {
  pontos: [number, number][];
  /** Distância acumulada até cada ponto; o último elemento é a volta inteira. */
  acum: number[];
  volta: number;
  largura: number;
  /** Onde fica a linha de chegada, em distância desde o primeiro ponto. */
  largada: number;
  limites: { x: number; y: number; w: number; h: number };
};

/**
 * Espaçada de propósito — foi o pedido do dono: 84 de largura para um carro de 18, e curvas
 * de raio largo, sem esses apertados. Oito carros cabem lado a lado de quatro em quatro, e
 * uma ultrapassagem não precisa de milímetro.
 */
export const CONTROLE_DA_PISTA: [number, number][] = [
  [260, 690], [560, 700], [830, 685], [945, 610], [960, 470], [930, 330], [960, 190], [900, 90],
  [760, 60], [600, 90], [500, 190], [380, 210], [250, 150], [140, 110], [70, 190], [80, 340],
  [190, 430], [200, 540], [150, 630],
];

export function criarPista(controle = CONTROLE_DA_PISTA, largura = 84, porTrecho = 30): Pista {
  const n = controle.length;
  const pontos: [number, number][] = [];
  // Catmull-Rom fechada: a curva passa por todos os pontos de controle, sem quina.
  for (let i = 0; i < n; i++) {
    const p0 = controle[(i - 1 + n) % n], p1 = controle[i], p2 = controle[(i + 1) % n], p3 = controle[(i + 2) % n];
    for (let k = 0; k < porTrecho; k++) {
      const t = k / porTrecho, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pontos.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const acum = [0];
  for (let i = 1; i <= pontos.length; i++) {
    const a = pontos[i - 1], b = pontos[i % pontos.length];
    acum.push(acum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const xs = pontos.map((p) => p[0]), ys = pontos.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return {
    pontos,
    acum,
    volta: acum[pontos.length],
    largura,
    largada: 220,
    limites: { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY },
  };
}

export const PISTA = criarPista();

export type Ponto = { x: number; y: number; angulo: number };

/** Um ponto a `d` do começo da pista, deslocado `lado` para a direita de quem anda. */
export function pontoNaPista(pista: Pista, d: number, lado = 0): Ponto {
  const { pontos, acum, volta } = pista;
  const dd = ((d % volta) + volta) % volta;
  let i = 0;
  while (acum[i + 1] < dd) i++;
  const a = pontos[i], b = pontos[(i + 1) % pontos.length];
  const t = (dd - acum[i]) / (acum[i + 1] - acum[i] || 1);
  const angulo = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return {
    x: a[0] + (b[0] - a[0]) * t - Math.sin(angulo) * lado,
    y: a[1] + (b[1] - a[1]) * t + Math.cos(angulo) * lado,
    angulo,
  };
}

export type Local = { indice: number; distancia: number; afastamento: number };

/**
 * Onde o carro está na pista: o trecho mais próximo, a distância andada até ali e o quanto
 * ele se afastou do meio. Procura perto do último trecho conhecido — dois trechos paralelos
 * da pista podem estar mais perto um do outro que o carro anda num segundo, e procurar na
 * pista inteira pularia de um para o outro. Longe demais de tudo, aí sim procura em toda parte.
 */
export function localizar(pista: Pista, x: number, y: number, dica: number | null = null): Local {
  const n = pista.pontos.length;
  const procurar = (de: number, ate: number) => {
    let melhor = { indice: 0, t: 0, d2: Infinity };
    for (let k = de; k <= ate; k++) {
      const i = ((k % n) + n) % n;
      const a = pista.pontos[i], b = pista.pontos[(i + 1) % n];
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2));
      const px = a[0] + vx * t - x, py = a[1] + vy * t - y;
      const d2 = px * px + py * py;
      if (d2 < melhor.d2) melhor = { indice: i, t, d2 };
    }
    return melhor;
  };
  let achado = dica === null ? procurar(0, n - 1) : procurar(dica - 40, dica + 40);
  if (dica !== null && Math.sqrt(achado.d2) > pista.largura * 2) achado = procurar(0, n - 1);
  const { indice, t } = achado;
  return {
    indice,
    distancia: pista.acum[indice] + (pista.acum[indice + 1] - pista.acum[indice]) * t,
    afastamento: Math.sqrt(achado.d2),
  };
}

/** A distância desde a linha de chegada, de 0 a uma volta. */
export const desdeALinha = (pista: Pista, distancia: number) =>
  (((distancia - pista.largada) % pista.volta) + pista.volta) % pista.volta;

/**
 * A caixa do grid: a pole logo atrás da linha, e os outros de dois em dois, alternando os
 * lados. `lugar` começa em 0.
 */
export function lugarNoGrid(pista: Pista, lugar: number): Ponto {
  const fila = Math.floor(lugar / 2);
  const lado = lugar % 2 === 0 ? -pista.largura * 0.22 : pista.largura * 0.22;
  return pontoNaPista(pista, pista.largada - 34 - fila * 52 - (lugar % 2) * 20, lado);
}

// ---- o carro ------------------------------------------------------------------------

export const FISICA = {
  maxima: 430,
  aceleracao: 290,
  freio: 760,
  arrasto: 110,
  re: -110,
  foraMaxima: 170,
  foraArrasto: 620,
  giro: 2.7,
  raio: 15,
};

export type Comandos = { acelera: boolean; freia: boolean; esquerda: boolean; direita: boolean };
export const PARADO: Comandos = { acelera: false, freia: false, esquerda: false, direita: false };

export type Carro = {
  x: number; y: number; angulo: number;
  /** Para a frente é positivo. */
  velocidade: number;
  indice: number;
  /** Quanto se andou desde a linha de chegada, nesta volta. */
  desdeLinha: number;
  /** A volta que se está correndo, começando em 1. */
  volta: number;
  /** Passou da metade da volta: é o que faz cruzar a linha valer, e não voltar de ré por cima dela. */
  metade: boolean;
  /** Distância andada na corrida inteira; negativa enquanto ainda está atrás da linha na largada. */
  progresso: number;
  voltaComecouEm: number;
  melhorVolta: number | null;
  /** Tempo de corrida em que cruzou a bandeirada, ou null. */
  chegouEm: number | null;
  foraDaPista: boolean;
};

export function carroNoGrid(pista: Pista, lugar: number): Carro {
  const p = lugarNoGrid(pista, lugar);
  const local = localizar(pista, p.x, p.y);
  const desdeLinha = desdeALinha(pista, local.distancia);
  return {
    x: p.x, y: p.y, angulo: p.angulo, velocidade: 0, indice: local.indice, desdeLinha,
    volta: 1, metade: false, progresso: progressoDe(pista, 1, false, desdeLinha),
    voltaComecouEm: 0, melhorVolta: null, chegouEm: null, foraDaPista: false,
  };
}

export type Batida = { forca: number };
export type Outro = { x: number; y: number };

/**
 * Um passo de física. Devolve o carro novo e, se houve, a batida — com a força, para o som
 * saber se foi um toque ou uma pancada.
 *
 * Arcade de propósito: o carro vai para onde aponta, sem derrapar. Fora do asfalto a
 * velocidade cai para a da grama, mas não há muro — sair da pista custa tempo, não a corrida.
 */
export function passo(
  pista: Pista, carro: Carro, cmd: Comandos, dt: number, tempo: number, outros: Outro[], voltas: number,
): { carro: Carro; batida: Batida | null; completouVolta: boolean } {
  const f = FISICA;
  const c = { ...carro };
  // Depois da bandeirada o carro só desacelera: a corrida dele acabou.
  const k = c.chegouEm !== null ? PARADO : cmd;

  if (k.acelera) c.velocidade += (c.velocidade < 0 ? f.freio : f.aceleracao) * dt;
  else if (k.freia) c.velocidade -= (c.velocidade > 0 ? f.freio : -f.re) * dt;
  else c.velocidade -= Math.sign(c.velocidade) * Math.min(Math.abs(c.velocidade), f.arrasto * dt);
  if (k.freia && c.velocidade < f.re) c.velocidade = f.re;
  if (c.chegouEm !== null) c.velocidade -= Math.sign(c.velocidade) * Math.min(Math.abs(c.velocidade), f.freio * 0.4 * dt);

  const teto = c.foraDaPista ? f.foraMaxima : f.maxima;
  if (c.velocidade > teto) c.velocidade = Math.max(teto, c.velocidade - f.foraArrasto * dt);

  // Virar depende de andar: parado não gira, e rápido demais gira menos.
  const rapidez = Math.abs(c.velocidade);
  const efeito = Math.min(1, rapidez / 120) * (1 - 0.4 * Math.min(1, rapidez / f.maxima));
  const direcao = (k.direita ? 1 : 0) - (k.esquerda ? 1 : 0);
  c.angulo += direcao * f.giro * efeito * Math.sign(c.velocidade || 1) * dt;

  c.x += Math.cos(c.angulo) * c.velocidade * dt;
  c.y += Math.sin(c.angulo) * c.velocidade * dt;

  // A batida: cada um empurra o PRÓPRIO carro para fora do outro. O outro faz o mesmo na tela
  // dele, e é por isso que ela parece a mesma dos dois lados.
  let batida: Batida | null = null;
  for (const o of outros) {
    const dx = c.x - o.x, dy = c.y - o.y;
    const d = Math.hypot(dx, dy);
    const minimo = f.raio * 2;
    if (d >= minimo) continue;
    const nx = d > 0.001 ? dx / d : Math.cos(c.angulo + Math.PI / 2);
    const ny = d > 0.001 ? dy / d : Math.sin(c.angulo + Math.PI / 2);
    c.x += nx * (minimo - d);
    c.y += ny * (minimo - d);
    // Quanto do movimento ia CONTRA o outro: é isso que se perde.
    const contra = -(Math.cos(c.angulo) * nx + Math.sin(c.angulo) * ny) * Math.sign(c.velocidade);
    if (contra > 0) {
      const perda = Math.abs(c.velocidade) * contra * 0.6;
      c.velocidade -= Math.sign(c.velocidade) * perda;
      if (!batida || perda > batida.forca) batida = { forca: perda };
    }
  }

  const local = localizar(pista, c.x, c.y, c.indice);
  c.indice = local.indice;
  c.foraDaPista = local.afastamento > pista.largura / 2 + 6;

  // As voltas. Cruzar a linha só vale depois de ter passado da metade.
  const antes = carro.desdeLinha;
  const agora = desdeALinha(pista, local.distancia);
  c.desdeLinha = agora;
  const V = pista.volta;
  if (agora > V * 0.4 && agora < V * 0.6) c.metade = true;
  let completouVolta = false;
  if (antes > V * 0.75 && agora < V * 0.25 && c.metade && c.chegouEm === null) {
    const duracao = tempo - c.voltaComecouEm;
    c.melhorVolta = c.melhorVolta === null ? duracao : Math.min(c.melhorVolta, duracao);
    c.voltaComecouEm = tempo;
    c.metade = false;
    c.volta += 1;
    completouVolta = true;
    if (c.volta > voltas) c.chegouEm = tempo;
  }
  // Andar de ré por cima da linha desfaz a volta que ela deu.
  if (antes < V * 0.25 && agora > V * 0.75 && !c.metade && c.volta > 1 && c.chegouEm === null) {
    c.volta -= 1;
    c.metade = true;
  }
  c.progresso = progressoDe(pista, c.volta, c.metade, agora);
  return { carro: c, batida, completouVolta };
}

/** A distância da corrida inteira: é o que ordena a classificação enquanto ninguém chegou. */
export function progressoDe(pista: Pista, volta: number, metade: boolean, desdeLinha: number) {
  const V = pista.volta;
  // Sem ter passado da metade, estar "quase no fim da volta" é estar atrás da linha.
  const naVolta = !metade && desdeLinha > V * 0.75 ? desdeLinha - V : desdeLinha;
  return (volta - 1) * V + naVolta;
}

// ---- classificação ------------------------------------------------------------------

export type NaClassificacao = { id: number; progresso: number; chegouEm: number | null; abandonou?: boolean };

/** Quem chegou vem primeiro, pelo tempo; depois quem corre, por quanto andou; quem abandonou, por último. */
export function classificar<T extends NaClassificacao>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    if (!!a.abandonou !== !!b.abandonou) return a.abandonou ? 1 : -1;
    if (a.chegouEm !== null && b.chegouEm !== null) return a.chegouEm - b.chegouEm;
    if (a.chegouEm !== null) return -1;
    if (b.chegouEm !== null) return 1;
    return b.progresso - a.progresso;
  });
}

/** "1:02,4" — minutos, segundos e décimo. */
export function formatarTempo(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100));
  const min = Math.floor(total / 600);
  const seg = Math.floor(total / 10) % 60;
  return `${min}:${String(seg).padStart(2, '0')},${total % 10}`;
}

/** "+1,3 s" — a diferença para quem chegou antes. */
export const formatarDiferenca = (ms: number) => `+${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} s`;

// ---- o que anda pelo LiveKit -----------------------------------------------------------

/**
 * A posição de um carro, vinte vezes por segundo, pelo canal SEM garantia de entrega: pacote
 * perdido é substituído pelo seguinte, 50 ms depois, e reenviar um velho seria desenhar o
 * passado. O formato é protocolo entre versões do app — só se acrescenta campo.
 */
export type Posicao = {
  /** tempo de corrida em que a foto foi tirada */
  t: number;
  x: number; y: number; a: number; v: number;
  /** progresso e volta, para a classificação de quem assiste */
  p: number; vo: number;
  c: number | null;
};

export const TOPICO = 'corrida';

export function codificar(carro: Carro, tempo: number): Posicao {
  return {
    t: Math.round(tempo),
    x: Math.round(carro.x * 10) / 10,
    y: Math.round(carro.y * 10) / 10,
    a: Math.round(carro.angulo * 1000) / 1000,
    v: Math.round(carro.velocidade),
    p: Math.round(carro.progresso),
    vo: carro.volta,
    c: carro.chegouEm === null ? null : Math.round(carro.chegouEm),
  };
}

export function decodificar(texto: string): Posicao | null {
  try {
    const o = JSON.parse(texto);
    const numeros = ['t', 'x', 'y', 'a', 'v', 'p', 'vo'].every((k) => typeof o?.[k] === 'number' && Number.isFinite(o[k]));
    if (!numeros || !(o.c === null || typeof o.c === 'number')) return null;
    return { t: o.t, x: o.x, y: o.y, a: o.a, v: o.v, p: o.p, vo: o.vo, c: o.c };
  } catch {
    return null;
  }
}

/** Quanto atrás do agora os outros carros são desenhados: o bastante para ter duas fotos em volta. */
export const ATRASO_DE_DESENHO = 110;

/**
 * Onde desenhar um carro dos outros no tempo `t`, a partir das últimas fotos dele (em ordem
 * de tempo). Entre duas fotos, a reta entre elas; depois da última, uma continuação curta
 * pela velocidade — mais que isso seria inventar por onde ele foi.
 */
export function interpolar(fotos: Posicao[], t: number): Posicao | null {
  if (fotos.length === 0) return null;
  const ultima = fotos[fotos.length - 1];
  if (t >= ultima.t) {
    const extra = Math.min(t - ultima.t, 150) / 1000;
    return { ...ultima, x: ultima.x + Math.cos(ultima.a) * ultima.v * extra, y: ultima.y + Math.sin(ultima.a) * ultima.v * extra };
  }
  for (let i = fotos.length - 1; i > 0; i--) {
    const a = fotos[i - 1], b = fotos[i];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      // O ângulo pelo caminho curto: de 179° para -179° são dois graus, não 358.
      let da = b.a - a.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return { ...b, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: a.a + da * k };
    }
  }
  return fotos[0];
}

/** Guarda a foto nova no lugar certo, sem repetir e sem deixar a lista crescer. */
export function guardarFoto(fotos: Posicao[], nova: Posicao, maximo = 12): Posicao[] {
  if (fotos.some((f) => f.t === nova.t)) return fotos;
  const lista = [...fotos, nova].sort((a, b) => a.t - b.t);
  return lista.slice(-maximo);
}

// ---- a largada -------------------------------------------------------------------------

/**
 * As cinco luzes: uma acende a cada segundo, e todas apagam juntas quando o tempo de corrida
 * chega a zero. Devolve quantas estão acesas, ou `null` quando a largada já foi.
 */
export function luzesAcesas(tempo: number): number | null {
  if (tempo >= 0) return null;
  return Math.max(0, Math.min(5, Math.floor((tempo + 6000) / 1000)));
}
