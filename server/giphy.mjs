// Busca no Giphy. A chave mora no .env do servidor: dentro do app, qualquer pessoa que
// abrisse o instalador teria acesso a ela e poderia queimar a cota do grupo.
import { ErroDeConta } from './contas.mjs';

const BASE = 'https://api.giphy.com/v1/gifs';

/**
 * De onde aceitamos baixar um GIF. Sem esta lista, o endereço vem de quem pede e o
 * servidor viraria um buscador de URLs a mando de terceiros — inclusive de endereços
 * internos da própria máquina.
 */
const HOSTS_PERMITIDOS = /^(media\d*|i)\.giphy\.com$/;

export function enderecoDeGiphyValido(url) {
  try {
    const u = new URL(String(url ?? ''));
    return u.protocol === 'https:' && HOSTS_PERMITIDOS.test(u.hostname);
  } catch {
    return false;
  }
}

/** Só o que a tela precisa: o resto da resposta do Giphy é enorme e inútil aqui. */
const enxugar = (g) => ({
  id: g.id,
  titulo: g.title || '',
  // Prévia leve para a grade, e o arquivo de verdade para quando escolherem.
  previa: g.images?.fixed_width_small?.url ?? g.images?.preview_gif?.url ?? null,
  arquivo: g.images?.fixed_width?.url ?? g.images?.original?.url ?? null,
});

export async function buscarGifs({ chave, termo, limite = 24 }) {
  if (!chave) {
    throw new ErroDeConta('A busca de GIF não está configurada neste servidor.', 503);
  }
  const busca = String(termo ?? '').trim();
  const params = new URLSearchParams({
    api_key: chave,
    limit: String(Math.min(50, Math.max(1, Number(limite) || 24))),
    rating: 'pg-13',
    lang: 'pt',
  });
  if (busca) params.set('q', busca);

  const r = await fetch(`${BASE}/${busca ? 'search' : 'trending'}?${params}`, {
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);

  if (!r) throw new ErroDeConta('Não consegui falar com o Giphy.', 502);
  if (r.status === 401 || r.status === 403) {
    throw new ErroDeConta('A chave do Giphy deste servidor foi recusada.', 502);
  }
  if (!r.ok) throw new ErroDeConta(`O Giphy respondeu ${r.status}.`, 502);

  const dados = await r.json().catch(() => ({}));
  return (dados.data ?? []).map(enxugar).filter((g) => g.arquivo);
}

/** Baixa o GIF escolhido para guardarmos: assim ele sobrevive a sumir do Giphy. */
export async function baixarGif(url, limite) {
  if (!enderecoDeGiphyValido(url)) {
    throw new ErroDeConta('Esse endereço não é do Giphy.', 400);
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) throw new ErroDeConta('Não consegui baixar esse GIF.', 502);

  const bruto = Buffer.from(await r.arrayBuffer());
  if (bruto.length > limite) throw new ErroDeConta('Esse GIF é grande demais.', 413);
  return bruto;
}
