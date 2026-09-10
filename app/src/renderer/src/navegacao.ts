/**
 * O que um clique numa sala faz — entrar na voz, trocar o que está na tela, ou os dois.
 *
 * Parecia não ter regra nenhuma: clicar numa sala abria a sala. Só que entrar numa CALL e
 * trocar o que você está LENDO são duas coisas diferentes, e o app passou a deixar as
 * duas acontecerem ao mesmo tempo — dá para estar na voz de "Geral" com os olhos numa
 * sala de texto, com a faixa da call no alto e a live no quadro flutuante. Nesse mundo,
 * entrar noutra call arrastava a pessoa para fora da conversa que ela estava lendo, no
 * meio de uma frase.
 *
 * É a mesma ideia de "trocar de servidor não desliga a voz", vista do outro lado: olhar
 * não é sair, e entrar não é parar de ler. Quem quer ver a call tem o "Abrir palco" na
 * faixa do alto, que é um gesto que se faz de propósito.
 */
import type { TipoDeSala } from './api';

type Sala = { id: number; tipo: TipoDeSala };

export type Clique = {
  /** Trocar o que está na tela para esta sala. */
  abrir: boolean;
  /** Entrar (ou trocar) a voz para esta sala. */
  entrar: boolean;
};

export function oQueFazerAoClicar(
  clicada: Sala,
  lendo: Sala | null,
  vozAtual: number | null,
): Clique {
  // Sala de texto é só leitura: abrir é passar a ler e escrever nela.
  if (clicada.tipo !== 'voz') return { abrir: true, entrar: false };

  // Já se está na voz dela: não há o que entrar, então o clique só pode querer VER.
  // Sem isto, clicar na sala em que você já está não faria absolutamente nada — que é
  // como o app se comportava quando comparava salas pelo nome.
  if (vozAtual === clicada.id) return { abrir: true, entrar: false };

  // Lendo uma conversa: entra na voz e continua lendo. A faixa do alto passa a mostrar
  // a call nova, e é por ela que se vai ao palco.
  return { abrir: lendo?.tipo !== 'texto', entrar: true };
}
