// Até onde cada sala de texto já foi lida.
//
// Fica no computador de quem lê, não no servidor: cada um lê no seu, e guardar isso no
// banco pediria uma tabela nova para um problema que ninguém tem. O servidor só recebe os
// marcadores na busca de salas e devolve quanto falta ler.

export type Marcadores = Record<number, number>;

/**
 * Dois marcadores, guardados separados: as salas de um lado, as conversas privadas do
 * outro. Juntos, a sala 3 e a conversa 3 seriam a mesma chave — e ler uma marcaria a
 * outra como lida.
 */
export const ONDE = {
  salas: 'cantinho.leituras',
  conversas: 'cantinho.leiturasConversas',
} as const;

const CHAVE = ONDE.salas;

/** "3:40,7:0" — o formato que a busca de salas entende. */
export const paraParametro = (m: Marcadores): string =>
  Object.entries(m)
    .filter(([sala, id]) => Number(sala) > 0 && Number(id) > 0)
    .map(([sala, id]) => `${sala}:${id}`)
    .join(',');

/**
 * O marcador só anda para a frente. Uma busca antiga que chegue atrasada não pode
 * "desler" o que já foi lido, e é isso que acontece se aceitarmos qualquer valor.
 */
export function marcarLido(m: Marcadores, sala: number, id: number): Marcadores {
  if (!(sala > 0) || !(id > 0) || (m[sala] ?? 0) >= id) return m;
  return { ...m, [sala]: id };
}

/** Texto guardado vira marcadores. Lixo vira nada — nunca exceção. */
export function deTexto(texto: string | null): Marcadores {
  try {
    const cru = JSON.parse(texto ?? '');
    if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return {};
    const limpo: Marcadores = {};
    for (const [sala, id] of Object.entries(cru)) {
      if (Number(sala) > 0 && typeof id === 'number' && id > 0) limpo[Number(sala)] = id;
    }
    return limpo;
  } catch {
    return {};
  }
}

// O acesso ao armazenamento pode lançar sozinho (janela anônima, site bloqueado), e o
// aviso de mensagem nova não é motivo para derrubar a tela.
export function lerGuardado(chave: string = CHAVE): Marcadores {
  try {
    return deTexto(localStorage.getItem(chave));
  } catch {
    return {};
  }
}

export function guardar(m: Marcadores, chave: string = CHAVE): void {
  try {
    localStorage.setItem(chave, JSON.stringify(m));
  } catch {
    /* sem marcador guardado o aviso volta na próxima abertura; não é motivo para quebrar */
  }
}
