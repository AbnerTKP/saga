/**
 * O teclado da luta: tecla vira botão. Setas ou WASD andam, pulam e agacham; J, K e L batem e
 * soltam ki; I carrega; O é o especial (com ↓, a super); U some.
 *
 * Pelo `code` da tecla, e não pela letra: num teclado francês o W está noutro lugar, e o que
 * importa é a posição da mão.
 */
import { BOTAO } from './tipos.ts';

export const TECLAS: Record<string, number> = {
  ArrowUp: BOTAO.CIMA, KeyW: BOTAO.CIMA,
  ArrowDown: BOTAO.BAIXO, KeyS: BOTAO.BAIXO,
  ArrowLeft: BOTAO.ESQUERDA, KeyA: BOTAO.ESQUERDA,
  ArrowRight: BOTAO.DIREITA, KeyD: BOTAO.DIREITA,
  KeyJ: BOTAO.SOCO, KeyK: BOTAO.CHUTE, KeyL: BOTAO.RAJADA,
  KeyI: BOTAO.CARREGAR, KeyO: BOTAO.ESPECIAL, KeyU: BOTAO.SUMIR,
};

/** A legenda dos controles, na ordem em que se aprende. */
export const LEGENDA: [string, string][] = [
  ['Setas ou WASD', 'andar, pular, agachar'],
  ['segurar para trás', 'defender'],
  ['J', 'soco'], ['K', 'chute'], ['L', 'rajada de ki'], ['I (segurar)', 'carregar ki'],
  ['O', 'especial (1 barra)'], ['↓ + O', 'super (3 barras)'], ['U', 'sumir (meia barra)'],
];

/** Botões segurados a partir das teclas apertadas. */
export function botoesDe(apertadas: Iterable<string>): number {
  let b = 0;
  for (const code of apertadas) b |= TECLAS[code] ?? 0;
  return b;
}

const escrevendo = (alvo: EventTarget | null) => {
  const el = alvo as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
};

/**
 * Ouve o teclado da janela enquanto a luta está na tela. Escrevendo num campo, a tecla é do
 * campo; e trocar de janela solta tudo — senão o lutador seguiria andando sozinho com a seta
 * que ficou "apertada" do outro lado.
 */
export function ouvirTeclado(janela: Window) {
  const apertadas = new Set<string>();
  const baixo = (e: KeyboardEvent) => {
    if (!(e.code in TECLAS) || escrevendo(e.target)) return;
    e.preventDefault();
    apertadas.add(e.code);
  };
  const cima = (e: KeyboardEvent) => { apertadas.delete(e.code); };
  const soltar = () => apertadas.clear();
  janela.addEventListener('keydown', baixo);
  janela.addEventListener('keyup', cima);
  janela.addEventListener('blur', soltar);
  return {
    botoes: () => botoesDe(apertadas),
    parar() {
      janela.removeEventListener('keydown', baixo);
      janela.removeEventListener('keyup', cima);
      janela.removeEventListener('blur', soltar);
    },
  };
}
