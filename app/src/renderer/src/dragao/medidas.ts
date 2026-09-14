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
