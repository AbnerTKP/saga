import { useEffect, useRef } from 'react';

/**
 * Esc fecha o que está aberto.
 *
 * Todo painel do app tinha uma saída só: acertar o X, um quadrado de 28 px no canto. Se
 * alguma coisa fica por cima dele — um quadro flutuante, um aviso, uma camada empilhada
 * errado —, o painel deixa de ter saída, e quem está do outro lado só vê "o botão não
 * funciona". Uma segunda porta que não depende de acertar pixel nenhum é o conserto
 * barato disso, e é o gesto que todo mundo já tem na mão.
 *
 * Com dois painéis abertos (a busca de GIF por cima do editor de imagem), Esc fecha só o
 * DE CIMA. Por isso a pilha: quem monta por último é quem responde, e cada um sai da
 * pilha ao desmontar. Sem ela, os dois fechariam de uma vez.
 */
const pilha: object[] = [];

export function useFecharComEsc(onClose: () => void) {
  // A ação vive numa referência para o efeito não depender dela: `onClose` costuma ser
  // uma função criada na hora, e depender dela empurraria o painel para o topo da pilha
  // a cada desenho — o de baixo passaria a fechar na frente do de cima.
  const acao = useRef(onClose);
  acao.current = onClose;

  useEffect(() => {
    const meu = {};
    pilha.push(meu);
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pilha[pilha.length - 1] !== meu) return;
      e.preventDefault();
      acao.current();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => {
      const onde = pilha.indexOf(meu);
      if (onde >= 0) pilha.splice(onde, 1);
      window.removeEventListener('keydown', aoTeclar);
    };
  }, []);
}
