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
  /** O corte, em dBFS: abaixo dele nada sai para a call. */
  corte: number;
};

/**
 * Já nasce ligado, e forte. Quem ouve a casa dos outros não é quem precisa mexer em
 * ajuste — é o outro. Um padrão desligado só funcionaria para quem abrisse a tela.
 */
export const AJUSTES_PADRAO: AjustesDoMicrofone = { supressao: 'forte', corte: -50 };

/** O prefixo antigo fica: é o de todas as chaves do app (ver CLAUDE.md). */
export const CHAVE_DO_MICROFONE = 'cantinho.microfone';

const SUPRESSOES: Supressao[] = ['desligada', 'padrao', 'forte'];

/** A régua da barra: de −100 dB (nada) a 0 dB (o máximo que o microfone entrega). */
export const PISO_DA_REGUA = -100;

/**
 * Lê o que ficou guardado. Chave vazia, lixo ou pedaço faltando voltam ao padrão. O `auto`
 * de quem ligou o "Ajustar sozinha" fica no `localStorage` e é ignorado: ver `avancar`.
 */
export function ajustesGuardados(texto: string | null): AjustesDoMicrofone {
  let bruto: unknown;
  try { bruto = texto ? JSON.parse(texto) : null; } catch { bruto = null; }
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  return {
    supressao: SUPRESSOES.includes(o.supressao as Supressao) ? (o.supressao as Supressao) : AJUSTES_PADRAO.supressao,
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

/** Aberto, só fecha abaixo do corte menos isto: sem a histerese, voz no limite picota. */
export const HISTERESE = 4;
/** O fim de uma palavra e o respiro entre duas não podem fechar o microfone. */
export const SEGURAR_MS = 300;

export type Portao = {
  aberto: boolean;
  /** Há quanto tempo o som está abaixo do ponto de fechar. */
  abaixoHaMs: number;
  /** O nível suavizado, que é o que decide e o que a barra mostra. */
  nivel: number;
};

export function novoPortao(): Portao {
  return { aberto: false, abaixoHaMs: 0, nivel: PISO_DA_REGUA };
}

/**
 * Um passo do portão. MUDA o objeto em vez de devolver outro: roda centenas de vezes por
 * segundo dentro do processador de áudio, onde criar objeto é criar lixo no meio do som.
 *
 * O corte é FIXO. Existiu um "Ajustar sozinha" (setembro a outubro de 2026), que punha o
 * corte acima do barulho da casa e até 14 dB abaixo da sua fala lembrada, subindo até −20
 * dB — e era ele que "mutava a pessoa sozinha". Medido nesta mesma conta (08/10/2026):
 * depois de uma risada alta, a fala normal passava 7% nos 30 s seguintes e 0% no minuto
 * seguinte, e a voz a −24 dB com o jogo saindo pela caixa a −34 passava 15%. Sem ícone de
 * mudo nenhum: quem falava não tinha como saber. Com o corte fixo em −50 dB, 100% nos dois.
 * O preço é a TV e o teclado nas pausas, que o automático tirava; voz cortada é pior.
 */
export function avancar(p: Portao, nivelDb: number, dtMs: number, corte: number) {
  // Sobe na hora e desce devagar: o começo de uma sílaba não pode esperar, e o nível não
  // pode despencar no vão entre duas.
  p.nivel = nivelDb > p.nivel ? nivelDb : p.nivel + (nivelDb - p.nivel) * Math.min(1, dtMs / 60);

  if (p.nivel > corte) {
    p.aberto = true;
    p.abaixoHaMs = 0;
  } else if (p.nivel < corte - HISTERESE) {
    p.abaixoHaMs += dtMs;
    if (p.abaixoHaMs >= SEGURAR_MS) p.aberto = false;
  }
}
