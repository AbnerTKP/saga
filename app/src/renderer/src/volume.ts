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
