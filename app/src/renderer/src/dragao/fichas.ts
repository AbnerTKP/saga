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
  // o Super Saiyajin Blue da fase nova, e o Super Saiyajin 3 do Gotenks
  goiabaSuper: 'Super Goiabadin Blue',
  vegetalSuper: 'Super Vegetalzin Blue',
  goteira: 'Super Goteira 3',
  gotinha: 'Super Gotinha',
  tronco: 'Super Tronco',
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

/**
 * Os golpes de mão e pé do Goiaba, que servem de régua para os outros. As caixas saem do sprite de
 * pixel (2 pixels da tela por pixel do zip, na `ESCALA` 1): o punho esticado vai 12
 * pixels do zip à frente do pé, a uns 13 de altura, e o pé do chute, 12 à frente e baixo. Com as
 * caixas do boneco antigo, que tinha perna comprida, o chute acertava 20 pixels antes de encostar.
 */
const GOLPES_BASE: Ficha['golpes'] = {
  soco1: { inicio: 4, ativo: 3, volta: 8, dano: 35, atordoa: 15, defendido: 9, altura: 'medio', caixa: [8, 20, 27, 35], empurra: 1.6, encadeia: 'soco2' },
  soco2: { inicio: 5, ativo: 3, volta: 10, dano: 40, atordoa: 16, defendido: 10, altura: 'medio', caixa: [8, 20, 28, 35], empurra: 1.8, encadeia: 'soco3', avanca: 1 },
  soco3: { inicio: 8, ativo: 4, volta: 18, dano: 65, atordoa: 0, defendido: 14, altura: 'medio', caixa: [10, 24, 28, 48], empurra: 4, derruba: true, forte: true, avanca: 1.5 },
  chute1: { inicio: 6, ativo: 4, volta: 13, dano: 50, atordoa: 17, defendido: 11, altura: 'medio', caixa: [10, 6, 28, 22], empurra: 2.2, encadeia: 'chute2' },
  chute2: { inicio: 10, ativo: 4, volta: 20, dano: 75, atordoa: 0, defendido: 15, altura: 'medio', caixa: [12, 20, 32, 36], empurra: 4.5, derruba: true, forte: true },
  socoBaixo: { inicio: 4, ativo: 3, volta: 9, dano: 30, atordoa: 13, defendido: 8, altura: 'baixo', caixa: [8, 13, 27, 29], empurra: 1.4 },
  rasteira: { inicio: 8, ativo: 5, volta: 22, dano: 55, atordoa: 0, defendido: 12, altura: 'baixo', caixa: [10, 0, 34, 10], empurra: 1.5, derruba: true },
  socoAereo: { inicio: 5, ativo: 8, volta: 4, dano: 45, atordoa: 16, defendido: 10, altura: 'aereo', caixa: [6, 18, 28, 36], empurra: 1.8 },
  chuteAereo: { inicio: 7, ativo: 10, volta: 4, dano: 55, atordoa: 18, defendido: 11, altura: 'aereo', caixa: [4, 0, 26, 15], empurra: 2.2 },
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
  espessura: 6, altura: 31, custo: 25, atordoa: 16,
};

const NA_MEDIDA_DO_DESENHO: Record<IdDoLutador, Ficha> = {
  goiaba: {
    id: 'goiaba', nome: 'Goiaba', estilo: 'equilibrado',
    vida: 1000, andar: 1.5, recuar: 1.2, investida: 4, pulo: 6.2,
    corpo: { meiaLargura: 11, altura: 62, alturaAgachado: 42 },
    golpes: GOLPES_BASE,
    rajada: RAJADA_BASE,
    especial: { nome: 'Onda Goiabada', tipo: 'onda', inicio: 22, duracao: 40, volta: 22, batidas: 7, intervalo: 6, dano: 18, velocidade: 14, espessura: 9, altura: 31, custo: 100, atordoa: 14, derruba: true },
    super: { nome: 'Onda Goiabada Máxima', tipo: 'onda', inicio: 14, duracao: 70, volta: 28, batidas: 10, intervalo: 7, dano: 30, velocidade: 16, espessura: 16, altura: 31, custo: 300, atordoa: 16, derruba: true },
  },
  vegetal: {
    id: 'vegetal', nome: 'Vegetal', estilo: 'baixo e agressivo',
    vida: 950, andar: 1.75, recuar: 1.3, investida: 4.6, pulo: 6.4,
    corpo: { meiaLargura: 11, altura: 58, alturaAgachado: 40 },
    golpes: comAlcance(GOLPES_BASE, 1, 1.06),
    rajada: { ...RAJADA_BASE, inicio: 10, velocidade: 5.5 },
    especial: { nome: 'Canhão de Alho', tipo: 'onda', inicio: 16, duracao: 34, volta: 22, batidas: 6, intervalo: 6, dano: 19, velocidade: 15, espessura: 9, altura: 31, custo: 100, atordoa: 14, derruba: true },
    super: { nome: 'Canhão de Alho Final', tipo: 'onda', inicio: 12, duracao: 66, volta: 28, batidas: 10, intervalo: 6, dano: 31, velocidade: 17, espessura: 17, altura: 31, custo: 300, atordoa: 16, derruba: true },
  },
  picole: {
    id: 'picole', nome: 'Picolé', estilo: 'alto, alcance longo',
    vida: 1080, andar: 1.3, recuar: 1.1, investida: 3.6, pulo: 6.0,
    corpo: { meiaLargura: 11, altura: 70, alturaAgachado: 46 },
    golpes: comAlcance(GOLPES_BASE, 1.22),
    rajada: { ...RAJADA_BASE, velocidade: 4.2, dano: 45, altura: 31 },
    especial: { nome: 'Picolé Espiral', tipo: 'espiral', inicio: 26, duracao: 22, volta: 24, batidas: 1, intervalo: 1, dano: 150, velocidade: 24, espessura: 4, altura: 31, custo: 100, atordoa: 0, derruba: true },
    super: { nome: 'Picolé Espiral Máximo', tipo: 'espiral', inicio: 18, duracao: 40, volta: 30, batidas: 3, intervalo: 10, dano: 100, velocidade: 26, espessura: 8, altura: 31, custo: 300, atordoa: 18, derruba: true },
  },
  geladeira: {
    id: 'geladeira', nome: 'Geladeira', estilo: 'rápido e técnico',
    vida: 920, andar: 1.7, recuar: 1.4, investida: 5, pulo: 6.6,
    corpo: { meiaLargura: 10, altura: 60, alturaAgachado: 40 },
    golpes: {
      ...comAlcance(GOLPES_BASE, 1, 0.95),
      // o rabo: a rasteira e o chute alcançam mais
      rasteira: { ...GOLPES_BASE.rasteira, caixa: [10, 0, 40, 10] },
      chute2: { ...GOLPES_BASE.chute2, caixa: [12, 20, 38, 36] },
    },
    rajada: { ...RAJADA_BASE, inicio: 9, velocidade: 7, custo: 20, dano: 34, altura: 31 },
    especial: { nome: 'Raio Congelante', tipo: 'laser', inicio: 10, duracao: 10, volta: 20, batidas: 1, intervalo: 1, dano: 90, velocidade: 400, espessura: 3, altura: 31, custo: 100, atordoa: 0, derruba: true },
    super: { nome: 'Bola Congelante', tipo: 'bola', inicio: 24, duracao: 200, volta: 26, batidas: 1, intervalo: 1, dano: 280, velocidade: 2.4, espessura: 20, altura: 40, custo: 300, atordoa: 0, derruba: true },
  },
  // Os da Super Feira são os mesmos dois, mais afiados: o Goiaba solta o raio mais cedo e mais
  // rápido, o Vegetal bate mais forte e troca o raio do especial por uma bola que vai longe.
  goiabaSuper: {
    id: 'goiabaSuper', nome: 'Goiaba Super Feira', estilo: 'veloz, raio rápido',
    vida: 970, andar: 1.6, recuar: 1.25, investida: 4.3, pulo: 6.3,
    corpo: { meiaLargura: 11, altura: 62, alturaAgachado: 42 },
    golpes: comAlcance(GOLPES_BASE, 1, 1.03),
    rajada: { ...RAJADA_BASE, inicio: 10, velocidade: 5.6 },
    especial: { nome: 'Onda Goiabada', tipo: 'onda', inicio: 17, duracao: 38, volta: 22, batidas: 7, intervalo: 5, dano: 17, velocidade: 17, espessura: 9, altura: 31, custo: 100, atordoa: 14, derruba: true },
    super: { nome: 'Onda Goiabada Blue', tipo: 'onda', inicio: 12, duracao: 66, volta: 28, batidas: 10, intervalo: 6, dano: 30, velocidade: 19, espessura: 16, altura: 31, custo: 300, atordoa: 16, derruba: true },
  },
  vegetalSuper: {
    id: 'vegetalSuper', nome: 'Vegetal Super Feira', estilo: 'agressivo, bate forte',
    vida: 930, andar: 1.8, recuar: 1.35, investida: 4.8, pulo: 6.5,
    corpo: { meiaLargura: 11, altura: 58, alturaAgachado: 40 },
    golpes: comAlcance(GOLPES_BASE, 1, 1.1),
    rajada: { ...RAJADA_BASE, inicio: 8, velocidade: 6, custo: 20, dano: 34 },
    especial: { nome: 'Big Bang de Brócolis', tipo: 'bola', inicio: 14, duracao: 160, volta: 22, batidas: 1, intervalo: 1, dano: 140, velocidade: 3.8, espessura: 11, altura: 31, custo: 100, atordoa: 0, derruba: true },
    super: { nome: 'Alface Final', tipo: 'onda', inicio: 16, duracao: 62, volta: 30, batidas: 10, intervalo: 6, dano: 32, velocidade: 18, espessura: 18, altura: 31, custo: 300, atordoa: 16, derruba: true },
  },
  // A fusão do Goten com o Trunks: criança, a mais rápida e a de menos vida. O especial é o
  // fantasma que voa devagar e estoura; a super, a chuva de mísseis.
  goteira: {
    id: 'goteira', nome: 'Goteira', estilo: 'ligeiro, vida curta',
    vida: 890, andar: 1.9, recuar: 1.5, investida: 5.2, pulo: 6.9,
    corpo: { meiaLargura: 10, altura: 58, alturaAgachado: 40 },
    golpes: comAlcance(GOLPES_BASE, 1, 0.97),
    rajada: { ...RAJADA_BASE, inicio: 9, velocidade: 6.2, custo: 20, dano: 32 },
    especial: { nome: 'Fantasma Kamikaze', tipo: 'bola', inicio: 18, duracao: 220, volta: 22, batidas: 1, intervalo: 1, dano: 150, velocidade: 2.2, espessura: 10, altura: 33, custo: 100, atordoa: 0, derruba: true },
    super: { nome: 'Míssil Morre-Morre', tipo: 'onda', inicio: 12, duracao: 64, volta: 28, batidas: 12, intervalo: 5, dano: 28, velocidade: 18, espessura: 14, altura: 31, custo: 300, atordoa: 16, derruba: true },
  },
  // Os dois que se fundem na Goteira, cada um por si: crianças, rápidas e de pouca vida como ela.
  // O Gotinha é o pai em pequeno — a onda dele, mais curta —, e pula mais alto que todos; o Tronco
  // bate um pouco mais forte, e a super é uma bola que vai depressa.
  gotinha: {
    id: 'gotinha', nome: 'Gotinha', estilo: 'ágil, pula alto',
    vida: 900, andar: 1.8, recuar: 1.45, investida: 5, pulo: 7,
    corpo: { meiaLargura: 11, altura: 58, alturaAgachado: 40 },
    golpes: comAlcance(GOLPES_BASE, 1, 0.95),
    rajada: { ...RAJADA_BASE, inicio: 10, velocidade: 5.8, custo: 20, dano: 32 },
    especial: { nome: 'Ondinha Goiabada', tipo: 'onda', inicio: 18, duracao: 36, volta: 22, batidas: 6, intervalo: 6, dano: 18, velocidade: 15, espessura: 8, altura: 31, custo: 100, atordoa: 14, derruba: true },
    super: { nome: 'Ondona Goiabada', tipo: 'onda', inicio: 14, duracao: 66, volta: 28, batidas: 10, intervalo: 6, dano: 29, velocidade: 17, espessura: 15, altura: 31, custo: 300, atordoa: 16, derruba: true },
  },
  tronco: {
    id: 'tronco', nome: 'Tronco', estilo: 'atrevido, bate forte',
    vida: 910, andar: 1.75, recuar: 1.4, investida: 4.9, pulo: 6.8,
    corpo: { meiaLargura: 11, altura: 58, alturaAgachado: 40 },
    golpes: comAlcance(GOLPES_BASE, 1, 1.04),
    rajada: { ...RAJADA_BASE, inicio: 9, velocidade: 6, custo: 20, dano: 34 },
    especial: { nome: 'Canhãozinho de Alho', tipo: 'onda', inicio: 15, duracao: 32, volta: 22, batidas: 6, intervalo: 6, dano: 18, velocidade: 16, espessura: 8, altura: 31, custo: 100, atordoa: 14, derruba: true },
    super: { nome: 'Ataque Tostado', tipo: 'bola', inicio: 16, duracao: 140, volta: 26, batidas: 1, intervalo: 1, dano: 230, velocidade: 4.6, espessura: 16, altura: 34, custo: 300, atordoa: 0, derruba: true },
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
