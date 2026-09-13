/**
 * O que sai do SEU microfone para a call: supressão de ruído e sensibilidade.
 *
 * A supressão tira o que não é voz; a sensibilidade corta tudo — voz inclusive — quando o
 * som fica abaixo do corte. As duas se completam, e isso foi medido antes de escrever:
 * numa mistura de voz com barulho, o filtro de voz (RNNoise) levou o chiado de ventilador
 * de −36 a −70 dB, mas deixou a voz de uma TV ao fundo onde estava (−33 dB) e mal tocou no
 * teclado (−29 para −34). O que resolve TV e teclado nas pausas é o corte.
 *
 * Tudo aqui é conta pura, sem áudio nenhum: roda igual no teste e dentro do processador
 * de áudio (`microfone.worklet.ts`), que chama `avancar` a cada bloco de 128 amostras.
 */

export type Supressao = 'desligada' | 'padrao' | 'forte';

export type AjustesDoMicrofone = {
  supressao: Supressao;
  /** Ajustar sozinha: o corte acompanha o barulho do ambiente. */
  auto: boolean;
  /** O corte escolhido à mão, em dBFS. Guardado mesmo com `auto`, para voltar a ele. */
  corte: number;
};

/**
 * Já nasce ligado, e forte. Quem ouve a casa dos outros não é quem precisa mexer em
 * ajuste — é o outro. Um padrão desligado só funcionaria para quem abrisse a tela.
 */
export const AJUSTES_PADRAO: AjustesDoMicrofone = { supressao: 'forte', auto: true, corte: -50 };

/** O prefixo antigo fica: é o de todas as chaves do app (ver CLAUDE.md). */
export const CHAVE_DO_MICROFONE = 'cantinho.microfone';

const SUPRESSOES: Supressao[] = ['desligada', 'padrao', 'forte'];

/** A régua da barra: de −100 dB (nada) a 0 dB (o máximo que o microfone entrega). */
export const PISO_DA_REGUA = -100;

/** Lê o que ficou guardado. Chave vazia, lixo ou pedaço faltando voltam ao padrão. */
export function ajustesGuardados(texto: string | null): AjustesDoMicrofone {
  let bruto: unknown;
  try { bruto = texto ? JSON.parse(texto) : null; } catch { bruto = null; }
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  return {
    supressao: SUPRESSOES.includes(o.supressao as Supressao) ? (o.supressao as Supressao) : AJUSTES_PADRAO.supressao,
    auto: typeof o.auto === 'boolean' ? o.auto : AJUSTES_PADRAO.auto,
    corte: typeof o.corte === 'number' && Number.isFinite(o.corte) ? limitar(o.corte, PISO_DA_REGUA, 0) : AJUSTES_PADRAO.corte,
  };
}

export function limitar(x: number, min: number, max: number) {
  return Math.min(max, Math.max(min, x));
}

/** dB para a posição na barra, de 0 a 100. */
export function porcentoDoDb(db: number) {
  return limitar(((db - PISO_DA_REGUA) / -PISO_DA_REGUA) * 100, 0, 100);
}

export function dbDoPorcento(p: number) {
  return PISO_DA_REGUA + (limitar(p, 0, 100) / 100) * -PISO_DA_REGUA;
}

/** Nível de um bloco de amostras, em dBFS. Silêncio digital vira o fundo da régua. */
export function nivelDoBloco(amostras: ArrayLike<number>) {
  let soma = 0;
  for (let i = 0; i < amostras.length; i++) soma += amostras[i] * amostras[i];
  if (soma === 0 || amostras.length === 0) return PISO_DA_REGUA;
  return Math.max(PISO_DA_REGUA, 10 * Math.log10(soma / amostras.length));
}

// ---- o corte ----------------------------------------------------------------

/**
 * O corte automático sai de DUAS medidas, e a segunda veio de uma medida que falhou.
 *
 * A primeira é o barulho do ambiente: o corte fica esta folga acima dele. Sozinha ela não
 * segura TV: medido com voz e uma TV ao fundo passando pelo caminho de verdade, a TV tem
 * pausas, nas pausas o "barulho da casa" some, e o corte desceu a −70 dB — a TV passou
 * inteira (−29 dB na saída). Pelo ambiente não há como separar a TV da sua voz.
 *
 * A segunda é a SUA voz, que chega mais alta porque está perto do microfone: o corte fica
 * no máximo esta distância abaixo dela. É o que tira a TV — enquanto ela for mais baixa
 * que você. Uma TV mais alta que a sua voz, nenhuma régua de volume separa.
 */
export const FOLGA_DO_AUTOMATICO = 15;
/**
 * Os dois números abaixo foram escolhidos numa varredura, e não de olho, porque um puxa
 * contra o outro: esquecer rápido a voz deixa a TV voltar enquanto você está calado;
 * ficar muito perto dela corta quem passou a falar mais baixo. Voz a −12 dB, TV com
 * pausas ao fundo, quanto tempo calado até a TV passar:
 *
 *   abaixo  esquece     TV 15 dB abaixo  TV 20 dB abaixo  voz 10 dB mais baixa
 *   14 dB   0,02 dB/s   24 s             274 s            volta em 2 s
 *   16 dB   0,05 dB/s   4 s              70 s             volta em 2 s
 *   18 dB   0,1  dB/s   4 s              14 s             volta em 2 s
 *
 * TV só 15 dB abaixo de você volta em segundos: é o caso do ajuste à mão.
 */
export const ABAIXO_DA_VOZ = 14;
export const VOZ_ESQUECE_DB_POR_S = 0.02;
/** O corte automático nunca desce a ponto de abrir para o silêncio, nem sobe a ponto de cortar voz. */
export const CORTE_AUTOMATICO_MIN = -70;
export const CORTE_AUTOMATICO_MAX = -20;
/** Aberto, só fecha abaixo do corte menos isto: sem a histerese, voz no limite picota. */
export const HISTERESE = 4;
/** O fim de uma palavra e o respiro entre duas não podem fechar o microfone. */
export const SEGURAR_MS = 300;

/**
 * O barulho do ambiente é o som MAIS BAIXO dos últimos segundos. Toda fala tem pausa —
 * entre frases, para respirar — e é na pausa que o barulho da casa aparece sozinho. Uma
 * média subindo devagar confundiria fala comprida com barulho, e levaria mais de um minuto
 * para alcançar uma TV ligada no meio da call; o mínimo de uma janela alcança na largura
 * dela. A janela vai em baldes de meio segundo para não guardar amostra nenhuma.
 */
export const BALDE_MS = 500;
export const BALDES = 10;
/** Antes de haver o que medir, o piso é o de um quarto quieto. */
const PISO_INICIAL = -60;

export type Portao = {
  aberto: boolean;
  /** Há quanto tempo o som está abaixo do ponto de fechar. */
  abaixoHaMs: number;
  /** O nível suavizado, que é o que decide e o que a barra mostra. */
  nivel: number;
  /** O menor nível de cada meio segundo; `Infinity` é balde ainda vazio. */
  baldes: number[];
  balde: number;
  baldeMs: number;
  /** O barulho do ambiente, estimado. */
  piso: number;
  /** O nível da sua fala, lembrado. `PISO_DA_REGUA` enquanto você não falou. */
  voz: number;
};

export function novoPortao(): Portao {
  return { aberto: false, abaixoHaMs: 0, nivel: PISO_DA_REGUA, baldes: new Array(BALDES).fill(Infinity), balde: 0, baldeMs: 0, piso: PISO_INICIAL, voz: PISO_DA_REGUA };
}

export function corteVigente(p: Portao, auto: boolean, corteManual: number) {
  if (!auto) return corteManual;
  return limitar(Math.max(p.piso + FOLGA_DO_AUTOMATICO, p.voz - ABAIXO_DA_VOZ), CORTE_AUTOMATICO_MIN, CORTE_AUTOMATICO_MAX);
}

/**
 * Um passo do portão. MUDA o objeto em vez de devolver outro: roda centenas de vezes por
 * segundo dentro do processador de áudio, onde criar objeto é criar lixo no meio do som.
 */
export function avancar(p: Portao, nivelDb: number, dtMs: number, auto: boolean, corteManual: number) {
  // Sobe na hora e desce devagar: o começo de uma sílaba não pode esperar, e o nível não
  // pode despencar no vão entre duas.
  p.nivel = nivelDb > p.nivel ? nivelDb : p.nivel + (nivelDb - p.nivel) * Math.min(1, dtMs / 60);

  if (p.nivel < p.baldes[p.balde]) p.baldes[p.balde] = p.nivel;
  p.baldeMs += dtMs;
  if (p.baldeMs >= BALDE_MS) {
    p.baldeMs = 0;
    p.balde = (p.balde + 1) % BALDES;
    p.baldes[p.balde] = Infinity;
  }
  let menor = Infinity;
  for (let i = 0; i < BALDES; i++) if (p.baldes[i] < menor) menor = p.baldes[i];
  p.piso = menor === Infinity ? PISO_INICIAL : menor;

  // A voz sobe em 150 ms, e não num bloco: um estalo não pode virar "a sua voz".
  if (p.nivel > p.voz) p.voz += (p.nivel - p.voz) * Math.min(1, dtMs / 150);
  else p.voz = Math.max(PISO_DA_REGUA, p.voz - (VOZ_ESQUECE_DB_POR_S * dtMs) / 1000);

  const corte = corteVigente(p, auto, corteManual);
  if (p.nivel > corte) {
    p.aberto = true;
    p.abaixoHaMs = 0;
  } else if (p.nivel < corte - HISTERESE) {
    p.abaixoHaMs += dtMs;
    if (p.abaixoHaMs >= SEGURAR_MS) p.aberto = false;
  }
}
