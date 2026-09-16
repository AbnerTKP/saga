/**
 * Que microfone, saída de som e câmera usar: a escolha feita na Saga, o "Padrão do sistema" e o
 * que fazer quando um aparelho chega ou some. Testado; quem decide QUANDO trocar é o `useRoom`, e
 * quem mostra é a tela de configurações.
 */
import type { Room } from 'livekit-client';

export type TipoDeAparelho = 'audioinput' | 'audiooutput' | 'videoinput';
export type Aparelho = { deviceId: string; groupId?: string; label: string };

/** O prefixo antigo fica: é o de todas as chaves do app (ver CLAUDE.md). */
export const CHAVE_DOS_APARELHOS = 'cantinho.aparelhos';

/**
 * Ids que não são um aparelho, e sim um apelido do sistema para "o que estiver como padrão" — o
 * `communications` é o do Windows. Na lista eles viram uma opção só, "Padrão do sistema".
 */
const APELIDOS = new Set(['default', 'communications']);
export const ehApelido = (id: string | undefined) => !id || APELIDOS.has(id);

/** O que está guardado: só ids de aparelho de verdade, e só dos tipos que existem. */
export function escolhasGuardadas(texto: string | null): Partial<Record<TipoDeAparelho, string>> {
  let bruto: unknown;
  try { bruto = texto ? JSON.parse(texto) : null; } catch { bruto = null; }
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
  const saida: Partial<Record<TipoDeAparelho, string>> = {};
  for (const tipo of ['audioinput', 'audiooutput', 'videoinput'] as const) {
    const id = o[tipo];
    if (typeof id === 'string' && !ehApelido(id)) saida[tipo] = id;
  }
  return saida;
}

/** A escolha nova, pronta para guardar: o padrão do sistema é não guardar nada. */
export function comEscolha(texto: string | null, tipo: TipoDeAparelho, valor: string): string {
  const escolhas = escolhasGuardadas(texto);
  if (ehApelido(valor)) delete escolhas[tipo];
  else escolhas[tipo] = valor;
  return JSON.stringify(escolhas);
}

/** No seletor, o padrão do sistema é o valor vazio — venha ele como `default` ou como nada. */
export const valorNoSeletor = (ativo: string | undefined) => (ehApelido(ativo) ? '' : ativo!);

/**
 * O que pedir ao LiveKit para um valor do seletor. O vazio pedido como id EXATO não é aparelho
 * nenhum: medido, o microfone morria ao escolher "Padrão do sistema". Para som, o padrão é o
 * `default`; câmera não tem `default`, e vai sem exigir id.
 */
export function idParaTrocar(tipo: TipoDeAparelho, valor: string): { id: string; exato: boolean } {
  if (!ehApelido(valor)) return { id: valor, exato: true };
  return tipo === 'videoinput' ? { id: '', exato: false } : { id: 'default', exato: true };
}

/**
 * A lista do seletor sem os apelidos, e o nome do aparelho que o sistema usa como padrão — o
 * Chromium o põe no rótulo do `default` ("Padrão - Microfone do MacBook Pro").
 */
export function opcoesDoSeletor(aparelhos: Aparelho[]): { lista: Aparelho[]; nomeDoPadrao: string | null } {
  const padrao = aparelhos.find((a) => a.deviceId === 'default');
  const nome = padrao?.label.replace(/^\s*(padrão|default)\s*-\s*/i, '').trim();
  return { lista: aparelhos.filter((a) => !ehApelido(a.deviceId)), nomeDoPadrao: nome || null };
}

export type DecisaoDoMicrofone = { trocarPara: string } | { reabrirNoPadrao: true } | null;

/**
 * O que fazer com o microfone quando os aparelhos mudam, ao entrar na call e ao abri-lo:
 *
 * - **o escolhido na Saga está conectado e não é o que está em uso** → trocar para ele. É o que faz
 *   a escolha valer de novo quando o aparelho volta, e depois de fechar e abrir a Saga;
 * - **o microfone segue o padrão do sistema, e o padrão virou outro aparelho** → reabrir no
 *   padrão. O `default` aberto continua preso ao aparelho de quando abriu; o sinal de que o
 *   sistema trocou é o grupo do `default` na lista ser outro que o da faixa aberta.
 *
 * O escolhido que não está conectado não decide nada: quem cai para o padrão quando ele some é o
 * LiveKit, ao ver a faixa acabar.
 */
export function decidirMicrofone(o: {
  escolhido: string | undefined;
  ativo: string | undefined;
  disponiveis: Aparelho[];
  /** O grupo do aparelho da faixa aberta; nulo sem faixa. */
  grupoDaFaixa: string | null;
}): DecisaoDoMicrofone {
  const conectado = !!o.escolhido && o.disponiveis.some((a) => a.deviceId === o.escolhido);
  if (conectado) return o.ativo === o.escolhido ? null : { trocarPara: o.escolhido! };
  if (!ehApelido(o.ativo) || !o.grupoDaFaixa) return null;
  const grupoDoPadrao = o.disponiveis.find((a) => a.deviceId === 'default')?.groupId;
  return grupoDoPadrao && grupoDoPadrao !== o.grupoDaFaixa ? { reabrirNoPadrao: true } : null;
}

/**
 * Troca o aparelho em uso. O LiveKit fecha o microfone (ou a câmera) de antes ANTES de abrir o
 * novo; se abrir o novo falhar — ocupado por outro programa, desconectado no meio —, a pessoa fica
 * muda sem saber. Então a troca que falha volta ao padrão do sistema, e o erro segue para quem
 * pediu mostrar. A saída de som não fecha nada ao trocar, e não precisa disso.
 */
export async function trocarAparelho(room: Pick<Room, 'switchActiveDevice'>, tipo: TipoDeAparelho, valor: string) {
  const { id, exato } = idParaTrocar(tipo, valor);
  try {
    await room.switchActiveDevice(tipo, id, exato);
  } catch (e) {
    if (tipo !== 'audiooutput' && !ehApelido(valor)) {
      const padrao = idParaTrocar(tipo, '');
      await room.switchActiveDevice(tipo, padrao.id, padrao.exato).catch(() => undefined);
    }
    throw e;
  }
}
