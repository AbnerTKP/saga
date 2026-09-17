/**
 * O `volume` de um elemento de áudio no navegador só aceita de 0 a 1 — qualquer valor
 * fora disso lança exceção. Todo volume passa por aqui, num lugar só, porque o reforço
 * acima de 100% que existiu por uma versão derrubava a tela inteira em vez de
 * simplesmente não funcionar: a exceção estourava dentro de um efeito do React.
 *
 * Se um dia houver reforço de verdade acima de 100%, ele não virá daqui — precisa de um
 * ganho no WebAudio, porque o elemento de áudio não faz isso.
 */
export const VOLUME = (v: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));

/**
 * O volume que estava guardado. Nada, texto vazio ou lixo viram 100%.
 *
 * O cuidado tem nome: `Number('')` é ZERO, e zero aqui é silêncio. Chave vazia no
 * localStorage acontece, e ela calaria o soundboard inteiro sem erro nenhum — do tipo de
 * defeito que ninguém liga à causa. O padrão seguro é ouvir, não emudecer.
 */
export const volumeGuardado = (bruto: string | null): number => {
  if (bruto === null || bruto.trim() === '') return 1;
  const n = Number(bruto);
  return Number.isFinite(n) ? VOLUME(n) : 1;
};

/**
 * O alto-falante da live: cortar guarda o volume de antes, e devolver volta a ELE — não a
 * 100%, que seria um susto para quem tinha abaixado. Sem nada que valha guardado, volta a
 * 100%: devolver o som e continuar mudo pareceria botão quebrado.
 */
export function alternarMudo(volume: number, guardado: number): { volume: number; guardado: number } {
  const agora = VOLUME(volume);
  if (agora > 0) return { volume: 0, guardado: agora };
  const antes = VOLUME(guardado);
  return antes > 0 ? { volume: antes, guardado: antes } : { volume: 1, guardado: 1 };
}

/**
 * O volume de cada pessoa, guardado neste computador pela identidade dela (`u` + o id da conta,
 * que não muda). Vivia só na memória: quem abaixava um amigo alto o ouvia alto de novo a cada
 * vez que fechava e abria a Saga. Lixo, número fora de 0 a 1 e chave vazia não viram volume.
 */
export function volumesGuardados(texto: string | null): Map<string, number> {
  let bruto: unknown;
  try { bruto = texto ? JSON.parse(texto) : null; } catch { bruto = null; }
  const saida = new Map<string, number>();
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return saida;
  for (const [quem, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (quem && typeof v === 'number' && Number.isFinite(v)) saida.set(quem, VOLUME(v));
  }
  return saida;
}

/** Para guardar: 100% é o padrão e não ocupa lugar, então quem volta a 100% sai da lista. */
export function textoDosVolumes(volumes: Map<string, number>): string {
  const o: Record<string, number> = {};
  for (const [quem, v] of volumes) if (VOLUME(v) !== 1) o[quem] = Math.round(VOLUME(v) * 1000) / 1000;
  return JSON.stringify(o);
}

