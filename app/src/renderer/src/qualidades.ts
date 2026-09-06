/**
 * Qualidades de transmissão e quem alcança cada uma.
 *
 * 1080p em qualquer taxa, e 60 quadros em qualquer resolução, são do Berserk.
 * Quem não tem fica em 720p a 30 — que é o suficiente para mostrar uma tela, e o que
 * menos pesa no servidor, já que ele reenvia a transmissão para cada pessoa da sala.
 */
export type Qualidade = '720p30' | '1080p30' | '720p60' | '1080p60';

export const QUALIDADE_LIVRE: Qualidade = '720p30';

export const TODAS: Qualidade[] = ['720p30', '1080p30', '720p60', '1080p60'];

export const COMO_SE_LE: Record<Qualidade, string> = {
  '720p30': '720p · 30 quadros — nitidez em primeiro lugar',
  '1080p30': '1080p · 30 quadros — a mais nítida, para slide, leitura e filme',
  '720p60': '720p · 60 quadros — fluidez em primeiro lugar, para jogo',
  '1080p60': '1080p · 60 quadros — a mais fluida, e a mais pesada',
};

/**
 * O que fica intocado quando a cena aperta — e é preciso escolher, porque não cabem os
 * dois. Medido no servidor de verdade, com alguém assistindo, numa cena pesada:
 *
 * | pedido        | protegendo quadros | protegendo nitidez |
 * |---------------|--------------------|--------------------|
 * | 1080p, 8 Mbps | 960x540 a 59       | 1920x1080          |
 * | 1080p, 16 Mbps| 960x540 a 59       | —                  |
 *
 * Dobrar o teto de banda não devolve um pixel: a 60 quadros, 1080p de cena pesada não
 * cabe, e o codificador resolve o conflito jogando fora a metade que a gente não disse
 * que importava. Era essa a "imagem de 360p" — e caía em TODAS as quatro opções, que é
 * por que trocar de opção não adiantava nada.
 *
 * Voltar da queda também é lento (medido: ~20 s de cena leve para sair de 540p e chegar
 * a 1080p, aos saltos), e cena de jogo alterna pesada e leve o tempo todo — então na
 * prática a transmissão vive lá embaixo. Protegendo a nitidez, a subida é imediata: 5 s.
 *
 * Quem escolheu 30 quadros já disse que quer nitidez; quem escolheu 60 já disse que quer
 * fluidez. É só honrar o que o menu diz.
 */
export type Prioridade = 'nitidez' | 'fluidez';

export const prioridadeDe = (q: Qualidade): Prioridade =>
  q.endsWith('60') ? 'fluidez' : 'nitidez';

/** Só o 720p30 é livre; o resto pede Berserk. */
export const ehDoBerserk = (q: Qualidade) => q !== QUALIDADE_LIVRE;

export const qualidadesDe = (berserk: boolean): Qualidade[] =>
  berserk ? TODAS : [QUALIDADE_LIVRE];

/**
 * A qualidade que vale de fato. Quem perde o Berserk com 1080p60 guardado não continua
 * transmitindo nela — cai para o que pode, em vez de falhar ou passar batido.
 */
export const qualidadeValida = (escolhida: unknown, berserk: boolean): Qualidade => {
  const q = TODAS.includes(escolhida as Qualidade) ? (escolhida as Qualidade) : QUALIDADE_LIVRE;
  return berserk || !ehDoBerserk(q) ? q : QUALIDADE_LIVRE;
};
