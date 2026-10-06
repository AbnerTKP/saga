/**
 * Os ícones dos botões de construir do Catan — estrada, aldeia e cidade —, na cor de quem joga.
 *
 * Moram à parte do tabuleiro (`desenhoDoCatan.ts`) porque são desenho de BOTÃO, lidos a ~24 px:
 * a peça do tabuleiro é feita para ser vista de cima, entre outras, e no botão ela precisa dizer
 * sozinha o que se constrói. Devolve um `<svg>` inteiro, pronto para `dangerouslySetInnerHTML`.
 *
 * Por enquanto são as próprias peças do tabuleiro; o desenho novo (pedido do dono, 06/10/2026)
 * entra aqui quando ele escolher.
 */
import { casa, estrada } from './desenhoDoCatan';

export type Construcao = 'estrada' | 'aldeia' | 'cidade';

export function iconeDeConstruir(tipo: Construcao, cor: string): string {
  switch (tipo) {
    case 'estrada': return `<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">${estrada([8, 30], [52, 10], cor, 70)}</svg>`;
    case 'aldeia': return `<svg viewBox="-30 -34 60 60" xmlns="http://www.w3.org/2000/svg">${casa(0, 0, cor, 70, false)}</svg>`;
    case 'cidade': return `<svg viewBox="-34 -38 68 68" xmlns="http://www.w3.org/2000/svg">${casa(0, 0, cor, 70, true)}</svg>`;
  }
}
