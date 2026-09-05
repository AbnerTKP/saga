/**
 * Qualidades de transmissão e quem alcança cada uma.
 *
 * 1080p em qualquer taxa, e 60 quadros em qualquer resolução, são do Vorcaro Turbo.
 * Quem não tem fica em 720p a 30 — que é o suficiente para mostrar uma tela, e o que
 * menos pesa no servidor, já que ele reenvia a transmissão para cada pessoa da sala.
 */
export type Qualidade = '720p30' | '1080p30' | '720p60' | '1080p60';

export const QUALIDADE_LIVRE: Qualidade = '720p30';

export const TODAS: Qualidade[] = ['720p30', '1080p30', '720p60', '1080p60'];

export const COMO_SE_LE: Record<Qualidade, string> = {
  '720p30': '720p · 30 quadros — a mais leve',
  '1080p30': '1080p · 30 quadros — nítida, para slide e leitura',
  '720p60': '720p · 60 quadros — fluida, para jogo e vídeo',
  '1080p60': '1080p · 60 quadros — a melhor, e a mais pesada',
};

/** Só o 720p30 é livre; o resto pede Turbo. */
export const ehDoTurbo = (q: Qualidade) => q !== QUALIDADE_LIVRE;

export const qualidadesDe = (turbo: boolean): Qualidade[] =>
  turbo ? TODAS : [QUALIDADE_LIVRE];

/**
 * A qualidade que vale de fato. Quem perde o Turbo com 1080p60 guardado não continua
 * transmitindo nela — cai para o que pode, em vez de falhar ou passar batido.
 */
export const qualidadeValida = (escolhida: unknown, turbo: boolean): Qualidade => {
  const q = TODAS.includes(escolhida as Qualidade) ? (escolhida as Qualidade) : QUALIDADE_LIVRE;
  return turbo || !ehDoTurbo(q) ? q : QUALIDADE_LIVRE;
};
