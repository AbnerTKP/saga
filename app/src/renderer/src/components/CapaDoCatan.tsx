import { useMemo } from 'react';
import { casa, defs, poli, terreno } from '../desenhoDoCatan';

/**
 * A capa do Catan no menu de jogos e no cartão de convite: três terrenos do próprio tabuleiro
 * (floresta, campo e montanha) com uma aldeia no encontro deles. Sai do mesmo desenho da partida,
 * e não de uma imagem guardada, porque são três hexágonos — montar é instantâneo.
 */
export function CapaDoCatan({ className }: { className?: string }) {
  const html = useMemo(() => {
    const s = 30, r3 = Math.sqrt(3);
    const pos: [string, number, number][] = [['floresta', 0, 0], ['campo', s * r3, 0], ['montanha', (s * r3) / 2, s * 1.5]];
    let out = defs();
    pos.forEach(([t, x, y], i) => {
      out += `<polygon points="${poli(x, y + s * 0.05, s)}" fill="rgba(0,0,0,.35)"/>`;
      out += `<g transform="translate(${x} ${y}) scale(${s * 0.97})">${terreno(t as 'floresta', 40 + i)}</g>`;
      out += `<polygon points="${poli(x, y, s * 0.985)}" fill="none" stroke="#f3e6c4" stroke-width="2"/>`;
    });
    out += casa((s * r3) / 2, s * 0.5, '#d8453b', s * 1.4, false);
    return out;
  }, []);
  const s = 30, r3 = Math.sqrt(3);
  return (
    <svg className={className} viewBox={`${-s * 0.95} ${-s * 1.05} ${s * r3 * 2 + s * 0.2} ${s * 3.6}`} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}
