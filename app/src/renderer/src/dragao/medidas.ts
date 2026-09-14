/**
 * As medidas da luta. A tela é pequena de propósito — 384x216, ampliada sem suavizar —, porque
 * é o tamanho que faz um lutador de uns 65 pixels parecer desenhado à mão e não encolhido.
 */
export const TELA = { largura: 384, altura: 216 };
/** A linha do chão na tela, onde pisa a âncora dos lutadores. */
export const CHAO = 198;
/**
 * A largura do mundo em que se luta, em pixels: a câmera anda de 0 a MUNDO - TELA.largura. Os
 * quatro cenários são desenhados nesta largura, e a simulação prende os lutadores dentro dela.
 */
export const MUNDO = 640;
/**
 * O tamanho dos lutadores na tela: os personagens são escritos em "unidades" (o Goiaba tem uns 62
 * de altura) e desenhados nesta escala. Foi 1,5 na v0.54, quando o boneco de esqueleto precisava
 * de pixels para rosto e mão; com o sprite do zip ampliado 3x o lutador ocupava quase metade da
 * tela, e o dono achou "enorme". Hoje o zip vai 2x e a escala é 1: 62 pixels. A simulação mede em
 * pixels da tela: as fichas já vêm nesta escala.
 */
export const ESCALA = 1;
