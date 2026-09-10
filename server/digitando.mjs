// Quem está escrevendo agora, numa sala de texto.
//
// Não vai para o banco, e é isso que torna a coisa possível. O app avisa a cada poucos
// segundos enquanto alguém digita, e escrita no SQLite nesse ritmo já custou caro aqui:
// `vista_em` era gravado a cada pedido e o servidor passava a escrever 3,5 MB/s, com a
// máquina 40% do tempo esperando disco. Isto aqui é lembrança de segundos — cabe na
// memória do processo, e o pior que acontece num reinício é a frase sumir da tela.
//
// Também não há empurrão nenhum: quem está lendo o chat já pergunta de 2 em 2 segundos
// se chegou mensagem, e a resposta dessa pergunta carrega quem está digitando. Foi por
// isso que "está digitando" ficou anos na lista do que não dava para fazer — mas o que
// não dava era o empurrão, não o recado.

/**
 * Quanto tempo um aviso vale.
 *
 * Tem de ser MAIOR que o intervalo com que o app avisa (3 s) somado ao da busca (2 s):
 * curto demais, a frase apaga e volta no meio de alguém escrevendo, que é a piscada que
 * fazia isto não valer a pena. Longo demais, ela fica na tela depois de a pessoa ter
 * desistido — por isso quem manda a mensagem some da lista na hora, sem esperar vencer.
 */
export const VALIDADE = 7000;

/**
 * Um registro por processo. É fábrica, e não um módulo com estado solto, para o teste
 * poder criar o seu sem herdar o que outro caso deixou.
 */
export function criarRegistroDeDigitacao({ validade = VALIDADE } = {}) {
  /** salaId -> (usuarioId -> { nome, ate }) */
  const salas = new Map();

  const limpar = (naSala, agora) => {
    for (const [id, quem] of naSala) if (quem.ate <= agora) naSala.delete(id);
  };

  return {
    /** Fulano está escrevendo nesta sala. Chamar de novo só estende o prazo. */
    avisar(salaId, { id, nome }, agora = Date.now()) {
      if (!salaId || !id) return;
      let naSala = salas.get(salaId);
      if (!naSala) { naSala = new Map(); salas.set(salaId, naSala); }
      naSala.set(id, { nome, ate: agora + validade });
    },

    /** Mandou a mensagem: para de aparecer na hora, senão a frase sobreviveria ao envio. */
    parou(salaId, usuarioId) {
      salas.get(salaId)?.delete(usuarioId);
    },

    /**
     * Quem está digitando nesta sala agora, fora quem perguntou — ninguém precisa ser
     * avisado de que está digitando. Em ordem de nome, para a lista não se reembaralhar
     * a cada busca.
     */
    quemEsta(salaId, { exceto, agora = Date.now() } = {}) {
      const naSala = salas.get(salaId);
      if (!naSala) return [];
      limpar(naSala, agora);
      if (naSala.size === 0) { salas.delete(salaId); return []; }
      return [...naSala]
        .filter(([id]) => id !== exceto)
        .map(([id, quem]) => ({ id, nome: quem.nome }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
    },

    /** Só para o teste: quantas salas estão guardadas agora. */
    get tamanho() { return salas.size; },
  };
}
