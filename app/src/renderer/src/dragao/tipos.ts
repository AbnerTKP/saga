/**
 * O CONTRATO da luta: o que a simulação guarda, o que a rede troca, o que o desenho e a
 * inteligência do computador leem. Mora num arquivo só porque são quatro pedaços de código que
 * precisam concordar sobre o mesmo estado — e concordar por acaso é o jeito de um deles
 * envelhecer em silêncio.
 *
 * Tudo aqui é número inteiro e objeto simples, de propósito: a luta online roda a MESMA
 * simulação nos dois computadores e volta no tempo quando o comando do outro chega atrasado
 * (ver `rede.ts`). Para isso o estado tem de ser copiável num instante e dar exatamente o mesmo
 * resultado nas duas máquinas — conta com vírgula, `Math.sin` e `Math.random` ficam fora da
 * simulação.
 */

/** Os botões de um quadro, somados em bits. É isto que viaja pela rede, um número por quadro. */
export const BOTAO = {
  CIMA: 1,
  BAIXO: 2,
  /** Esquerda e direita são DA TELA; frente e trás a simulação acha pelo lado para onde se olha. */
  ESQUERDA: 4,
  DIREITA: 8,
  SOCO: 16,
  CHUTE: 32,
  RAJADA: 64,
  ESPECIAL: 128,
  CARREGAR: 256,
  SUMIR: 512,
  TRANSFORMAR: 1024,
} as const;

export type Entrada = number;

export const IDS_DOS_LUTADORES = ['goiaba', 'vegetal', 'picole', 'geladeira', 'goiabaSuper', 'vegetalSuper', 'gotinha', 'tronco', 'goteira'] as const;
export type IdDoLutador = (typeof IDS_DOS_LUTADORES)[number];

export const IDS_DOS_CENARIOS = ['torneio', 'planeta', 'ilha', 'canion'] as const;
export type IdDoCenario = (typeof IDS_DOS_CENARIOS)[number];

/** Unidades da simulação por pixel: posição e velocidade andam em 1/64 de pixel. */
export const SUB = 64;
/** Quadros por segundo da simulação, fixos. */
export const QPS = 60;

/**
 * O que o lutador está fazendo. É a pergunta que todo o resto faz: a animação escolhe a pose por
 * isto e por `quadro`; a inteligência do computador decide por isto; o som toca na troca.
 */
export type Acao =
  // de pé e andando
  | 'entrada'        // o começo do round, antes do "LUTEM!"
  | 'parado'
  | 'andando'        // para a frente
  | 'recuando'       // para trás, sem segurar defesa (quem segura trás parado defende quando algo vem)
  | 'investida'      // dois toques para a frente
  | 'recuo'          // dois toques para trás: um pulinho para trás
  | 'agachado'
  | 'pulando'        // no ar, sem golpe; `vy` diz se sobe ou desce
  | 'pouso'          // os quadros de pés no chão depois do pulo
  | 'defendendo'     // em pé, segurando para trás, tomando o golpe na guarda
  | 'defendendoBaixo'
  // golpes
  | 'soco1' | 'soco2' | 'soco3'
  | 'chute1' | 'chute2'
  | 'socoBaixo' | 'rasteira'
  | 'socoAereo' | 'chuteAereo'
  | 'rajada'         // a bola de ki pequena
  | 'especial'       // o golpe com nome (Onda Goiabada, Canhão de Alho, Picolé Espiral, Raio Congelante)
  | 'super'          // a versão de três barras, com clarão
  | 'carregando'     // segurando o botão de carregar ki
  | 'sumindo'        // o teletransporte para as costas do outro
  | 'transformando'  // gritando para virar Super Goiabadin (e os dos outros); dá para ser interrompido
  // apanhando
  | 'apanhando'      // golpe alto ou médio, em pé
  | 'apanhandoBaixo' // agachado
  | 'voando'         // arremessado para trás, no ar
  | 'caido'
  | 'levantando'
  // fim de round
  | 'vitoria'
  | 'derrota'        // perdeu por tempo (quem perde por nocaute fica 'caido')
  ;

export type Lutador = {
  id: IdDoLutador;
  /** Segunda cor: o mesmo personagem dos dois lados sai com as cores trocadas. */
  cor: 0 | 1;
  /**
   * 0 é a forma de sempre; 1 é a transformação (Super Goiabadin, Super Vegetalzin, Picolé de
   * Laranja, Geladeira Dourada, os dois Blue da Super Feira, Super Gotinha, Super Tronco e o Super
   * Goteira 3). Transformado,
   * bate mais forte e anda mais rápido, e o ki escoa até acabar — aí volta ao normal.
   */
  forma: 0 | 1;
  /** O quadro global em que a forma mudou pela última vez (-1 nunca): o som e o clarão saem daqui. */
  formaDesde: number;
  /** Posição no mundo, em SUB. `y` é a altura acima do chão (0 é pisando). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Para onde olha: 1 é a direita da tela. Só vira no chão e fora de golpe. */
  lado: 1 | -1;
  acao: Acao;
  /** Quadros desde que a ação começou. */
  quadro: number;
  /** 0 a `vida` da ficha do lutador. */
  vida: number;
  /** Até onde a vida ia há pouco: desce devagar depois do combo, para o placar pintar de vermelho. */
  vidaAtrasada: number;
  /** 0 a KI_MAXIMO. Cada 100 é uma barra. */
  ki: number;
  /** Quadros que ainda faltam de atordoamento (apanhando ou defendendo). */
  atordoado: number;
  /** Quadros de invencibilidade (levantando, sumindo). */
  invencivel: number;
  /** O golpe atual já acertou: um golpe acerta uma vez (as rajadas longas têm o próprio relógio). */
  acertou: boolean;
  /** Apertou o botão do próximo golpe da sequência a tempo: sai quando o atual deixar. */
  encadear: Acao | null;
  /** Acertos seguidos que o OUTRO levou deste lutador sem sair do atordoamento. */
  combo: number;
  vitorias: number;
  /** Os botões do quadro anterior, para saber o que foi APERTADO agora e o que só continua segurado. */
  anterior: Entrada;
  /** Quadros desde o último toque para a frente e para trás soltos — é o duplo toque da investida. */
  toqueFrente: number;
  toqueTras: number;
  /**
   * O último impacto que ESTE lutador levou: quadro global, lugar (pixels do mundo, y para cima)
   * e tipo. O desenho tira daqui a faísca, o tremor e o som — tirar do estado, e não de um evento
   * solto, é o que faz a faísca não sair duas vezes quando a rede volta no tempo e refaz o quadro.
   */
  impactoEm: number;
  impactoX: number;
  impactoY: number;
  impactoTipo: 0 | 1 | 2 | 3; // 0 nada, 1 golpe, 2 golpe forte, 3 defendido
};

export type TipoDeProjetil =
  | 'rajada'     // bola pequena que voa
  | 'onda'       // raio grosso preso à mão (Onda Goiabada, Canhão de Alho), acerta em várias batidas
  | 'espiral'    // raio fino que atravessa (Picolé Espiral)
  | 'laser'      // raio instantâneo (Raio Congelante)
  | 'bola';      // bola grande e lenta (a super da Geladeira)

export type Projetil = {
  /** Um número que não se repete na luta: o desenho e o som seguem o projétil por ele. */
  id: number;
  dono: 0 | 1;
  tipo: TipoDeProjetil;
  /** Se é da super (maior, mais forte). */
  super: boolean;
  /** Onde nasce (raio) ou onde está (bola), em SUB; `y` acima do chão. */
  x: number;
  y: number;
  vx: number;
  /** Raio: onde a ponta está agora, em SUB (cresce até a borda). */
  ponta: number;
  direcao: 1 | -1;
  /** Quadros de vida que restam, e quadros desde que nasceu. */
  resta: number;
  quadro: number;
  /** Quantas batidas ainda pode dar, e de quantos em quantos quadros. */
  batidas: number;
  intervalo: number;
  proximaBatida: number;
};

export type Fase =
  | 'apresentacao' // "ROUND 1" e "LUTEM!": ninguém se mexe
  | 'luta'
  | 'nocaute'      // alguém caiu: a luta desacelera e o golpe final termina
  | 'tempo'        // o relógio zerou
  | 'fimDoRound'   // quem ganhou comemora
  | 'fimDaLuta';   // acabou a luta: fica aqui até a tela sair

export type ConfigDaLuta = {
  lutadores: [IdDoLutador, IdDoLutador];
  cenario: IdDoCenario;
  /** 1 (luta única) ou 2 (melhor de 3). */
  roundsParaVencer: 1 | 2;
  /** Sorteio da luta, igual nos dois computadores. */
  semente: number;
};

export type EstadoDaLuta = {
  config: ConfigDaLuta;
  /** Quadros desde o começo da luta. É o relógio que a rede conta. */
  quadro: number;
  fase: Fase;
  /** Quadros desde que a fase começou. */
  faseQuadro: number;
  round: number;
  /** Quadros que faltam no relógio do round. */
  tempo: number;
  lutadores: [Lutador, Lutador];
  projeteis: Projetil[];
  proximoProjetil: number;
  /** Parada de impacto: os quadros em que a tela congela no golpe. Ninguém se mexe. */
  congelado: number;
  /** O clarão da super: quadros que faltam e de quem é (-1 nenhum). Só o dono se mexe. */
  clarao: number;
  claraoDe: -1 | 0 | 1;
  /** Quem venceu o round que acabou (0, 1) ou empate (2); -1 no meio do round. */
  vencedorDoRound: -1 | 0 | 1 | 2;
  /** Quem venceu a luta; -1 enquanto não acabou, 2 empate. */
  vencedor: -1 | 0 | 1 | 2;
  /** Estado do sorteio (mulberry32), dentro do estado: volta junto quando a rede volta. */
  sorteio: number;
};
