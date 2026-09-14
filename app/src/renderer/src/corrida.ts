/**
 * A corrida de Fórmula 1 sem tela: o carro, as voltas, os setores, a batida, o muro, o limite
 * de pista e a classificação.
 *
 * Tudo aqui é conta pura, testada sem navegador. A tela (`TelaDaCorrida`) só lê o teclado,
 * chama `passo` e desenha. Cada app simula o PRÓPRIO carro e manda a posição pelo LiveKit; os
 * carros dos outros chegam por lá e são desenhados onde disseram estar (`interpolar`). A
 * batida é resolvida por cada um contra a posição que recebeu dos outros — os dois lados
 * empurram o próprio carro, e por isso ela parece a mesma batida nas duas telas.
 *
 * A pista vem de `pista.ts`: o muro em que se bate aqui é o muro que o desenho mostra. O tempo
 * de corrida é em milissegundos desde as luzes apagarem, no relógio do SERVIDOR.
 */
import { chaoEm, desdeALinha, localizar, lugarNoGrid, type Chao, type Pista } from './pista.ts';

// ---- os carros ----------------------------------------------------------------------------

export type Equipe = { nome: string; curto: string; pri: string; sec: string; acc: string; cor: string; cabine?: string };

export const EQUIPES = {
  rbr: { nome: 'Red Bull Racing', curto: 'Red Bull', pri: '#1e2b63', sec: '#d8102f', acc: '#ffc906', cor: '#3671c6' },
  fer: { nome: 'Ferrari', curto: 'Ferrari', pri: '#dc0000', sec: '#1b1b1b', acc: '#ffe000', cor: '#e8002d' },
  mcl: { nome: 'McLaren', curto: 'McLaren', pri: '#ff8000', sec: '#14161b', acc: '#47c7fc', cor: '#ff8000' },
  mer: { nome: 'Mercedes', curto: 'Mercedes', pri: '#c3cad1', sec: '#00d2be', acc: '#1b1d21', cor: '#27f4d2', cabine: '#00d2be' },
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

// ---- o carro ------------------------------------------------------------------------------

/**
 * A pista é de verdade e a largura é de F1, então a máxima dá ~310 km/h na conta de 36 de
 * comprimento para 5,6 m (`kmh`). Acelerar perde força perto da máxima; virar perde força com a
 * velocidade — é o que faz a curva pedir freio, que era o que faltava.
 */
export const FISICA = {
  maxima: 560,
  aceleracao: 330,
  freio: 820,
  arrasto: 120,
  re: -120,
  giro: 2.75,
  /** Entre carros. */
  raio: 15,
  /** Contra o muro: meia largura do carro. */
  raioMuro: 11,
  /** Fração da máxima que cada chão deixa, e o quanto freia quem passou dela. */
  chao: {
    asfalto: { teto: 1, arrasto: 0, giro: 1 },
    zebra: { teto: 1, arrasto: 0, giro: 1 },
    escape: { teto: 1, arrasto: 0, giro: 1 },
    grama: { teto: 0.55, arrasto: 520, giro: 0.8 },
    brita: { teto: 0.25, arrasto: 1100, giro: 0.55 },
  } satisfies Record<Chao, { teto: number; arrasto: number; giro: number }>,
  /** Cortou caminho: segundos somados no fim, como na F1 — foi a escolha do dono. */
  punicaoPorCorte: 3000,
  /**
   * Quanto se pode ganhar fora da pista antes de contar como corte. Medido nas seis pistas:
   * cortar uma chicane pela reta ganha de 40 a 150; pegar a zebra e a grama por dentro de uma
   * curva, uns 10 a 15.
   */
  folgaDoCorte: 30,
};

/** 36 de comprimento são 5,6 m. */
export const kmh = (velocidade: number) => Math.round(Math.abs(velocidade) * (3.6 / 6.43));

export type Comandos = { acelera: boolean; freia: boolean; esquerda: boolean; direita: boolean };
export const PARADO: Comandos = { acelera: false, freia: false, esquerda: false, direita: false };

export type Carro = {
  x: number; y: number; angulo: number;
  /** Para a frente é positivo. */
  velocidade: number;
  indice: number;
  lateral: number;
  chao: Chao;
  /** Quanto se andou desde a linha de chegada, nesta volta. */
  desdeLinha: number;
  /** A volta que se está correndo, começando em 1. */
  volta: number;
  /**
   * Os setores passados nesta volta (0, 1 ou 2). Cruzar a linha só vale depois dos dois — é o que
   * faz a volta não contar pulando um pedaço da pista.
   */
  setor: number;
  /** Distância andada na corrida inteira; negativa enquanto ainda está atrás da linha na largada. */
  progresso: number;
  voltaComecouEm: number;
  melhorVolta: number | null;
  /** Os tempos de setor desta volta e os melhores de todas. */
  setores: number[];
  melhoresSetores: (number | null)[];
  /** Tempo de corrida em que cruzou a bandeirada, ou null. */
  chegouEm: number | null;
  /** Saiu da pista: de onde saiu e quanto andou lá fora. */
  fora: { progresso: number; andado: number } | null;
  /** Milissegundos de punição acumulados. */
  punicao: number;
  cortes: number;
};

export function carroNoGrid(pista: Pista, lugar: number): Carro {
  const p = lugarNoGrid(pista, lugar);
  const local = localizar(pista, p.x, p.y);
  const desdeLinha = desdeALinha(pista, local.distancia);
  return {
    x: p.x, y: p.y, angulo: p.angulo, velocidade: 0, indice: local.indice, lateral: local.lateral,
    chao: chaoEm(pista, local), desdeLinha, volta: 1, setor: 0,
    progresso: progressoDe(pista, 1, 0, desdeLinha), voltaComecouEm: 0, melhorVolta: null,
    setores: [], melhoresSetores: [null, null, null], chegouEm: null, fora: null, punicao: 0, cortes: 0,
  };
}

export type Batida = { forca: number; muro: boolean };
export type Outro = { x: number; y: number };

/**
 * Um passo de física. Devolve o carro novo, a batida (com a força, para o som saber se foi um
 * toque ou uma pancada) e se houve corte de caminho nesse passo.
 *
 * Arcade de propósito: o carro vai para onde aponta, sem derrapar. Grama e brita seguram, e o
 * muro pára — sair da pista custa tempo, e cortar caminho custa segundos no fim.
 */
export function passo(
  pista: Pista, carro: Carro, cmd: Comandos, dt: number, tempo: number, outros: Outro[], voltas: number,
): { carro: Carro; batida: Batida | null; completouVolta: boolean; cortou: boolean } {
  const f = FISICA;
  const c: Carro = { ...carro };
  // Depois da bandeirada o carro só desacelera: a corrida dele acabou.
  const k = c.chegouEm !== null ? PARADO : cmd;
  const chao = f.chao[c.chao];
  const v = c.velocidade;

  if (k.acelera) c.velocidade += (v < 0 ? f.freio : f.aceleracao * (1 - 0.5 * Math.min(1, v / f.maxima))) * dt;
  else if (k.freia) c.velocidade -= (v > 0 ? f.freio : -f.re) * dt;
  else c.velocidade -= Math.sign(v) * Math.min(Math.abs(v), f.arrasto * dt);
  if (k.freia && c.velocidade < f.re) c.velocidade = f.re;
  if (c.chegouEm !== null) c.velocidade -= Math.sign(c.velocidade) * Math.min(Math.abs(c.velocidade), f.freio * 0.4 * dt);

  const teto = f.maxima * chao.teto;
  if (c.velocidade > f.maxima) c.velocidade = f.maxima;
  if (c.velocidade > teto) c.velocidade = Math.max(teto, c.velocidade - chao.arrasto * dt);
  if (c.velocidade < -teto) c.velocidade = Math.min(-teto, c.velocidade + chao.arrasto * dt);

  // Virar depende de andar: parado não gira, e rápido demais gira menos.
  const rapidez = Math.abs(c.velocidade);
  const efeito = Math.min(1, rapidez / 100) * (1 - 0.45 * Math.min(1, rapidez / f.maxima)) * chao.giro;
  const direcao = (k.direita ? 1 : 0) - (k.esquerda ? 1 : 0);
  c.angulo += direcao * f.giro * efeito * Math.sign(c.velocidade || 1) * dt;

  c.x += Math.cos(c.angulo) * c.velocidade * dt;
  c.y += Math.sin(c.angulo) * c.velocidade * dt;

  let batida: Batida | null = null;
  const bater = (forca: number, muro: boolean) => { if (!batida || forca > batida.forca) batida = { forca, muro }; };

  // Os outros carros: cada um empurra o PRÓPRIO carro para fora do outro.
  for (const o of outros) {
    const dx = c.x - o.x, dy = c.y - o.y;
    const d = Math.hypot(dx, dy);
    const minimo = f.raio * 2;
    if (d >= minimo) continue;
    const nx = d > 0.001 ? dx / d : Math.cos(c.angulo + Math.PI / 2);
    const ny = d > 0.001 ? dy / d : Math.sin(c.angulo + Math.PI / 2);
    c.x += nx * (minimo - d);
    c.y += ny * (minimo - d);
    const contra = -(Math.cos(c.angulo) * nx + Math.sin(c.angulo) * ny) * Math.sign(c.velocidade);
    if (contra > 0) {
      const perda = Math.abs(c.velocidade) * contra * 0.6;
      c.velocidade -= Math.sign(c.velocidade) * perda;
      bater(perda, false);
    }
  }

  // O muro: sai de dentro dele, perde o que ia contra e escorrega ao longo.
  pista.gradeDosMuros.perto(c.x, c.y, 120, (s) => {
    const m = pista.segmentos[s];
    const vx = m.bx - m.ax, vy = m.by - m.ay;
    const l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((c.x - m.ax) * vx + (c.y - m.ay) * vy) / l2));
    const px = m.ax + vx * t, py = m.ay + vy * t;
    const dx = c.x - px, dy = c.y - py;
    const d = Math.hypot(dx, dy);
    if (d >= f.raioMuro || d < 1e-6) return;
    const nx = dx / d, ny = dy / d;
    c.x = px + nx * f.raioMuro;
    c.y = py + ny * f.raioMuro;
    const hx = Math.cos(c.angulo) * c.velocidade, hy = Math.sin(c.angulo) * c.velocidade;
    const contra = -(hx * nx + hy * ny);
    if (contra <= 0) return;
    // o que sobra é o que corria ao longo do muro, com um pouco de atrito
    const tx = hx + nx * contra, ty = hy + ny * contra;
    const sobra = Math.hypot(tx, ty) * 0.85;
    if (sobra > 20) c.angulo = Math.atan2(ty, tx) + (c.velocidade < 0 ? Math.PI : 0);
    c.velocidade = Math.sign(c.velocidade) * sobra;
    bater(contra, true);
  });

  const local = localizar(pista, c.x, c.y, c.indice);
  c.indice = local.indice;
  c.lateral = local.lateral;
  c.chao = chaoEm(pista, local);

  // As voltas e os setores.
  const antes = carro.desdeLinha;
  const agora = desdeALinha(pista, local.distancia);
  c.desdeLinha = agora;
  const V = pista.volta;
  let completouVolta = false;
  if (c.chegouEm === null) {
    if (c.setor === 0 && agora > V / 3 && agora < V / 2) { c.setor = 1; c.setores = [tempo - c.voltaComecouEm]; }
    if (c.setor === 1 && agora > (2 * V) / 3 && agora < (5 * V) / 6) { c.setor = 2; c.setores = [...c.setores, tempo - c.voltaComecouEm]; }
    if (antes > V * 0.75 && agora < V * 0.25 && c.setor === 2) {
      const duracao = tempo - c.voltaComecouEm;
      const parciais = [c.setores[0], c.setores[1] - c.setores[0], duracao - c.setores[1]];
      c.melhoresSetores = c.melhoresSetores.map((m, i) => (m === null ? parciais[i] : Math.min(m, parciais[i])));
      c.melhorVolta = c.melhorVolta === null ? duracao : Math.min(c.melhorVolta, duracao);
      c.voltaComecouEm = tempo;
      c.setor = 0;
      c.setores = [];
      c.volta += 1;
      completouVolta = true;
      if (c.volta > voltas) c.chegouEm = tempo;
    }
    // Andar de ré por cima da linha desfaz a volta que ela deu.
    if (antes < V * 0.25 && agora > V * 0.75 && c.setor === 0 && c.volta > 1) {
      c.volta -= 1;
      c.setor = 2;
    }
  }
  c.progresso = progressoDe(pista, c.volta, c.setor, agora);

  // O limite de pista: o carro inteiro passou da linha branca. Voltando, confere se ganhou
  // caminho — andou menos lá fora do que avançou na pista.
  let cortou = false;
  const foraAgora = Math.abs(c.lateral) > pista.L / 2 + 10;
  if (foraAgora) {
    c.fora = c.fora ? { ...c.fora, andado: c.fora.andado + Math.abs(c.velocidade) * dt } : { progresso: carro.progresso, andado: 0 };
  } else if (c.fora) {
    const ganho = c.progresso - c.fora.progresso;
    if (ganho - c.fora.andado > f.folgaDoCorte && c.chegouEm === null) {
      c.punicao += f.punicaoPorCorte;
      c.cortes += 1;
      cortou = true;
    }
    c.fora = null;
  }
  return { carro: c, batida, completouVolta, cortou };
}

/** A distância da corrida inteira: é o que ordena a classificação enquanto ninguém chegou. */
export function progressoDe(pista: Pista, volta: number, setor: number, desdeLinha: number) {
  const V = pista.volta;
  // Sem ter passado nenhum setor, estar "quase no fim da volta" é estar atrás da linha.
  const naVolta = setor === 0 && desdeLinha > V * 0.75 ? desdeLinha - V : desdeLinha;
  return (volta - 1) * V + naVolta;
}

// ---- classificação ------------------------------------------------------------------------

export type NaClassificacao = { id: number; progresso: number; chegouEm: number | null; abandonou?: boolean; punicao?: number };

/**
 * Quem chegou vem primeiro, pelo tempo COM a punição; depois quem corre, por quanto andou;
 * quem abandonou, por último. Correndo, a punição ainda não conta: ela é somada no fim.
 */
export function classificar<T extends NaClassificacao>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    if (!!a.abandonou !== !!b.abandonou) return a.abandonou ? 1 : -1;
    if (a.chegouEm !== null && b.chegouEm !== null) return a.chegouEm + (a.punicao ?? 0) - (b.chegouEm + (b.punicao ?? 0));
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

// ---- o que anda pelo LiveKit ----------------------------------------------------------------

/**
 * A posição de um carro, vinte vezes por segundo, pelo canal SEM garantia de entrega: pacote
 * perdido é substituído pelo seguinte, 50 ms depois. O formato é protocolo entre versões do
 * app — só se acrescenta campo, e campo novo é opcional na leitura.
 */
export type Posicao = {
  /** tempo de corrida em que a foto foi tirada */
  t: number;
  x: number; y: number; a: number; v: number;
  /** progresso e volta, para a classificação de quem assiste */
  p: number; vo: number;
  c: number | null;
  /** punição acumulada, em ms (desde o redesenho; versão antiga não manda) */
  pu: number;
};

export const TOPICO = 'corrida';

/**
 * A versão da corrida que este app fala, mandada ao sentar. Um app antigo desenharia a pista
 * velha e os outros carros num mundo que não é o dele — ninguém se enxerga —, então o servidor
 * não o deixa sentar (`corridas.mjs`, `PROTOCOLO`).
 */
export const PROTOCOLO_DA_CORRIDA = 2;

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
    pu: carro.punicao,
  };
}

export function decodificar(texto: string): Posicao | null {
  try {
    const o = JSON.parse(texto);
    const numeros = ['t', 'x', 'y', 'a', 'v', 'p', 'vo'].every((k) => typeof o?.[k] === 'number' && Number.isFinite(o[k]));
    if (!numeros || !(o.c === null || typeof o.c === 'number')) return null;
    const pu = typeof o.pu === 'number' && Number.isFinite(o.pu) && o.pu >= 0 ? o.pu : 0;
    return { t: o.t, x: o.x, y: o.y, a: o.a, v: o.v, p: o.p, vo: o.vo, c: o.c, pu };
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

// ---- a largada -----------------------------------------------------------------------------

/**
 * As cinco luzes: uma acende a cada segundo, e todas apagam juntas quando o tempo de corrida
 * chega a zero. Devolve quantas estão acesas, ou `null` quando a largada já foi.
 */
export function luzesAcesas(tempo: number): number | null {
  if (tempo >= 0) return null;
  return Math.max(0, Math.min(5, Math.floor((tempo + 6000) / 1000)));
}
