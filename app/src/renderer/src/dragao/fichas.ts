/**
 * As fichas dos lutadores: vida, velocidade, alcance e o tempo de cada golpe, em quadros a 60 por
 * segundo. É a tabela que decide se a luta é justa, e por isso mora longe do desenho — mudar um
 * número aqui muda a luta nos dois computadores do mesmo jeito, e o desenho só acompanha.
 *
 * Caixas em PIXELS, a partir dos pés, olhando para a direita, com y PARA CIMA: [x0, y0, x1, y1].
 * Os tempos são os de um jogo de luta de fliperama: soco rápido e fraco, chute mais lento e mais
 * forte, e o golpe grande com tempo de sobra para quem estiver atento pular ou defender.
 */
import type { Acao, IdDoLutador, TipoDeProjetil } from './tipos.ts';
import { ESCALA } from './medidas.ts';

export type Caixa = [number, number, number, number];

/** Onde o golpe tem de ser defendido: alto e aéreo em pé, baixo agachado, médio dos dois jeitos. */
export type Altura = 'alto' | 'medio' | 'baixo' | 'aereo';

export type Golpe = {
  /** Quadros até começar a acertar, acertando, e de volta ao normal. */
  inicio: number;
  ativo: number;
  volta: number;
  dano: number;
  /** Quadros de atordoamento de quem levou, e de quem defendeu. */
  atordoa: number;
  defendido: number;
  altura: Altura;
  caixa: Caixa;
  /** Velocidade (px/quadro) com que empurra quem levou para trás. */
  empurra: number;
  /** Joga para cima e para trás ('voando') em vez de só atordoar. */
  derruba?: boolean;
  /** Parada de impacto mais longa, faísca grande e tremor. */
  forte?: boolean;
  /** O próximo golpe da sequência, se o botão for apertado a tempo. */
  encadeia?: Acao;
  /** Anda para a frente durante o golpe (px/quadro nos quadros de início). */
  avanca?: number;
};

export type Poder = {
  tipo: TipoDeProjetil;
  /** Quadros até soltar, quanto dura, e a volta depois. */
  inicio: number;
  duracao: number;
  volta: number;
  /** Batidas e o dano de cada uma; o raio fino dá uma só. */
  batidas: number;
  intervalo: number;
  dano: number;
  /** px/quadro (bola) ou crescimento da ponta (raio). */
  velocidade: number;
  /** Meia altura da caixa do projétil, em pixels. */
  espessura: number;
  /** Altura do disparo acima do chão, em pixels (a altura da mão). */
  altura: number;
  custo: number;
  atordoa: number;
  derruba?: boolean;
};

export type Ficha = {
  id: IdDoLutador;
  nome: string;
  estilo: string;
  vida: number;
  /** px/quadro. */
  andar: number;
  recuar: number;
  investida: number;
  pulo: number;
  /** Corpo que apanha, em pé e agachado: largura para cada lado e altura. */
  corpo: { meiaLargura: number; altura: number; alturaAgachado: number };
  golpes: Record<'soco1' | 'soco2' | 'soco3' | 'chute1' | 'chute2' | 'socoBaixo' | 'rasteira' | 'socoAereo' | 'chuteAereo', Golpe>;
  rajada: Poder;
  especial: Poder & { nome: string };
  super: Poder & { nome: string };
};

/**
 * A transformação. Precisa de uma barra e meia de ki e gasta meia. O grito dura pouco mais de um
 * segundo e é INVULNERÁVEL: a primeira versão durava 2,5 s e podia ser interrompida, e o dono
 * achou demorado — gritar virou esperar apanhar. Transformado, bate e anda mais; o ki escoa (uma
 * barra a cada 10 s) e, zerando, volta ao normal.
 */
export const TRANSFORMACAO = {
  kiMinimo: 150,
  custo: 50,
  duracao: 66,
  /** Um ponto de ki a cada tantos quadros, enquanto transformado e lutando. */
  escoamento: 6,
  dano: 1.25,
  velocidade: 1.15,
};

/** O nome da forma transformada de cada um, como aparece no letreiro e no placar. */
export const NOMES_DAS_FORMAS: Record<IdDoLutador, string> = {
  goiaba: 'Super Goiabadin',
  vegetal: 'Super Vegetalzin',
  picole: 'Picolé de Laranja',
  geladeira: 'Geladeira Dourada',
};

export const KI_MAXIMO = 300;
export const KI_POR_BARRA = 100;
export const CUSTO_DO_SUMIR = 50;
/** Ki por quadro segurando o carregar: uma barra em pouco menos de dois segundos. */
export const KI_CARREGANDO = 1;
/** Ki que quem bate ganha por acerto, e quem apanha. */
export const KI_POR_ACERTO = 6;
export const KI_POR_APANHAR = 4;
/** Ki com que cada um começa a luta. Passa de um round para o outro. */
export const KI_INICIAL = 50;

/** Gravidade na escala dos lutadores: com o pulo escalado junto, o tempo no ar continua o mesmo. */
export const GRAVIDADE = 0.36 * ESCALA;
/** Quantos quadros vale um toque para a frente esperando o segundo. */
export const JANELA_DO_DUPLO_TOQUE = 12;
/** Quadros de parada de impacto. */
export const PARADA = { golpe: 5, forte: 9, defendido: 3 };
/** Cada acerto seguido num combo tira menos: 100%, 90%, 80%… até a metade. */
export const ESCALA_DO_COMBO = [100, 90, 80, 70, 60, 50];
/** Dano de golpe de ki em quem defende: a quarta parte. */
export const DANO_NA_DEFESA = 4;
export const TEMPO_DO_ROUND = 99;

/** Os golpes de mão e pé do Goiaba, que servem de régua para os outros. */
const GOLPES_BASE: Ficha['golpes'] = {
  soco1: { inicio: 4, ativo: 3, volta: 8, dano: 35, atordoa: 15, defendido: 9, altura: 'medio', caixa: [8, 34, 30, 46], empurra: 1.6, encadeia: 'soco2' },
  soco2: { inicio: 5, ativo: 3, volta: 10, dano: 40, atordoa: 16, defendido: 10, altura: 'medio', caixa: [8, 32, 32, 46], empurra: 1.8, encadeia: 'soco3', avanca: 1 },
  soco3: { inicio: 8, ativo: 4, volta: 18, dano: 65, atordoa: 0, defendido: 14, altura: 'medio', caixa: [10, 28, 36, 48], empurra: 4, derruba: true, forte: true, avanca: 1.5 },
  chute1: { inicio: 6, ativo: 4, volta: 13, dano: 50, atordoa: 17, defendido: 11, altura: 'medio', caixa: [10, 18, 40, 34], empurra: 2.2, encadeia: 'chute2' },
  chute2: { inicio: 10, ativo: 4, volta: 20, dano: 75, atordoa: 0, defendido: 15, altura: 'medio', caixa: [12, 26, 42, 48], empurra: 4.5, derruba: true, forte: true },
  socoBaixo: { inicio: 4, ativo: 3, volta: 9, dano: 30, atordoa: 13, defendido: 8, altura: 'baixo', caixa: [8, 8, 30, 20], empurra: 1.4 },
  rasteira: { inicio: 8, ativo: 5, volta: 22, dano: 55, atordoa: 0, defendido: 12, altura: 'baixo', caixa: [10, 0, 46, 10], empurra: 1.5, derruba: true },
  socoAereo: { inicio: 5, ativo: 8, volta: 4, dano: 45, atordoa: 16, defendido: 10, altura: 'aereo', caixa: [6, 18, 28, 36], empurra: 1.8 },
  chuteAereo: { inicio: 7, ativo: 10, volta: 4, dano: 55, atordoa: 18, defendido: 11, altura: 'aereo', caixa: [4, 2, 36, 22], empurra: 2.2 },
};

/** Estica (ou encolhe) o alcance dos golpes de um lutador: o Picolé tem braço e perna longos. */
function comAlcance(golpes: Ficha['golpes'], fator: number, dano = 1): Ficha['golpes'] {
  const saida = {} as Ficha['golpes'];
  for (const [nome, g] of Object.entries(golpes) as [keyof Ficha['golpes'], Golpe][]) {
    saida[nome] = { ...g, dano: Math.round(g.dano * dano), caixa: [g.caixa[0], g.caixa[1], Math.round(g.caixa[2] * fator), g.caixa[3]] };
  }
  return saida;
}

const RAJADA_BASE: Poder = {
  tipo: 'rajada', inicio: 12, duracao: 150, volta: 16, batidas: 1, intervalo: 1, dano: 40, velocidade: 5,
  espessura: 6, altura: 38, custo: 25, atordoa: 16,
};

const NA_MEDIDA_DO_DESENHO: Record<IdDoLutador, Ficha> = {
  goiaba: {
    id: 'goiaba', nome: 'Goiaba', estilo: 'equilibrado',
    vida: 1000, andar: 1.5, recuar: 1.2, investida: 4, pulo: 6.2,
    corpo: { meiaLargura: 11, altura: 62, alturaAgachado: 42 },
    golpes: GOLPES_BASE,
    rajada: RAJADA_BASE,
    especial: { nome: 'Onda Goiabada', tipo: 'onda', inicio: 22, duracao: 40, volta: 22, batidas: 7, intervalo: 6, dano: 18, velocidade: 14, espessura: 9, altura: 38, custo: 100, atordoa: 14, derruba: true },
    super: { nome: 'Onda Goiabada Máxima', tipo: 'onda', inicio: 14, duracao: 70, volta: 28, batidas: 10, intervalo: 7, dano: 30, velocidade: 16, espessura: 16, altura: 38, custo: 300, atordoa: 16, derruba: true },
  },
  vegetal: {
    id: 'vegetal', nome: 'Vegetal', estilo: 'baixo e agressivo',
    vida: 950, andar: 1.75, recuar: 1.3, investida: 4.6, pulo: 6.4,
    corpo: { meiaLargura: 11, altura: 58, alturaAgachado: 40 },
    golpes: comAlcance(GOLPES_BASE, 1, 1.06),
    rajada: { ...RAJADA_BASE, inicio: 10, velocidade: 5.5 },
    especial: { nome: 'Canhão de Alho', tipo: 'onda', inicio: 16, duracao: 34, volta: 22, batidas: 6, intervalo: 6, dano: 19, velocidade: 15, espessura: 9, altura: 36, custo: 100, atordoa: 14, derruba: true },
    super: { nome: 'Canhão de Alho Final', tipo: 'onda', inicio: 12, duracao: 66, volta: 28, batidas: 10, intervalo: 6, dano: 31, velocidade: 17, espessura: 17, altura: 36, custo: 300, atordoa: 16, derruba: true },
  },
  picole: {
    id: 'picole', nome: 'Picolé', estilo: 'alto, alcance longo',
    vida: 1080, andar: 1.3, recuar: 1.1, investida: 3.6, pulo: 6.0,
    corpo: { meiaLargura: 11, altura: 70, alturaAgachado: 46 },
    golpes: comAlcance(GOLPES_BASE, 1.22),
    rajada: { ...RAJADA_BASE, velocidade: 4.2, dano: 45, altura: 42 },
    especial: { nome: 'Picolé Espiral', tipo: 'espiral', inicio: 26, duracao: 22, volta: 24, batidas: 1, intervalo: 1, dano: 150, velocidade: 24, espessura: 4, altura: 44, custo: 100, atordoa: 0, derruba: true },
    super: { nome: 'Picolé Espiral Máximo', tipo: 'espiral', inicio: 18, duracao: 40, volta: 30, batidas: 3, intervalo: 10, dano: 100, velocidade: 26, espessura: 8, altura: 44, custo: 300, atordoa: 18, derruba: true },
  },
  geladeira: {
    id: 'geladeira', nome: 'Geladeira', estilo: 'rápido e técnico',
    vida: 920, andar: 1.7, recuar: 1.4, investida: 5, pulo: 6.6,
    corpo: { meiaLargura: 10, altura: 60, alturaAgachado: 40 },
    golpes: {
      ...comAlcance(GOLPES_BASE, 1, 0.95),
      // o rabo: a rasteira e o chute alcançam mais
      rasteira: { ...GOLPES_BASE.rasteira, caixa: [10, 0, 54, 10] },
      chute2: { ...GOLPES_BASE.chute2, caixa: [12, 20, 50, 44] },
    },
    rajada: { ...RAJADA_BASE, inicio: 9, velocidade: 7, custo: 20, dano: 34, altura: 40 },
    especial: { nome: 'Raio Congelante', tipo: 'laser', inicio: 10, duracao: 10, volta: 20, batidas: 1, intervalo: 1, dano: 90, velocidade: 400, espessura: 3, altura: 42, custo: 100, atordoa: 0, derruba: true },
    super: { nome: 'Bola Congelante', tipo: 'bola', inicio: 24, duracao: 200, volta: 26, batidas: 1, intervalo: 1, dano: 280, velocidade: 2.4, espessura: 20, altura: 52, custo: 300, atordoa: 0, derruba: true },
  },
};

/**
 * As fichas acima estão na medida em que os personagens são escritos (o Goiaba com uns 66 de
 * altura). Na luta eles são desenhados `ESCALA` vezes maiores, então o que é espaço cresce junto —
 * caixa de golpe, corpo, altura do disparo, espessura do raio, pulo — e a caixa continua batendo
 * com o desenho. Velocidade cresce um pouco menos: o mundo continua com 640 pixels, e lutador
 * maior correndo na mesma proporção atravessaria a arena rápido demais.
 */
const VELOCIDADE = 1 + (ESCALA - 1) * 0.6;
function escalar(f: Ficha): Ficha {
  const caixa = (c: Caixa): Caixa => [c[0] * ESCALA, c[1] * ESCALA, c[2] * ESCALA, c[3] * ESCALA];
  const golpes = {} as Ficha['golpes'];
  for (const [nome, g] of Object.entries(f.golpes) as [keyof Ficha['golpes'], Golpe][]) {
    golpes[nome] = { ...g, caixa: caixa(g.caixa), empurra: g.empurra * VELOCIDADE, avanca: g.avanca === undefined ? undefined : g.avanca * VELOCIDADE };
  }
  const poder = <T extends Poder>(p: T): T => ({
    ...p, altura: p.altura * ESCALA, espessura: p.espessura * ESCALA,
    velocidade: p.tipo === 'laser' ? p.velocidade : p.velocidade * VELOCIDADE,
  });
  return {
    ...f,
    andar: f.andar * VELOCIDADE, recuar: f.recuar * VELOCIDADE, investida: f.investida * VELOCIDADE, pulo: f.pulo * ESCALA,
    corpo: { meiaLargura: f.corpo.meiaLargura * ESCALA, altura: f.corpo.altura * ESCALA, alturaAgachado: f.corpo.alturaAgachado * ESCALA },
    golpes, rajada: poder(f.rajada), especial: poder(f.especial), super: poder(f.super),
  };
}

export const FICHAS = Object.fromEntries(
  (Object.entries(NA_MEDIDA_DO_DESENHO) as [IdDoLutador, Ficha][]).map(([id, f]) => [id, escalar(f)]),
) as Record<IdDoLutador, Ficha>;

/** Quanto as velocidades da luta cresceram com a escala (a simulação usa nas medidas soltas dela). */
export const ESCALA_DE_VELOCIDADE = VELOCIDADE;


/** Os golpes de mão e pé pelo nome da ação. */
export const GOLPES_DE_CORPO = ['soco1', 'soco2', 'soco3', 'chute1', 'chute2', 'socoBaixo', 'rasteira', 'socoAereo', 'chuteAereo'] as const;
export type GolpeDeCorpo = (typeof GOLPES_DE_CORPO)[number];
export const ehGolpeDeCorpo = (a: Acao): a is GolpeDeCorpo => (GOLPES_DE_CORPO as readonly string[]).includes(a);
