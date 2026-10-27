import { useMemo } from 'react';

type Px = [number, number, number, number, string];

/** Um anel de pixel: a roda das motos em miniatura. */
function roda(cx: number, cy: number, r: number): Px[] {
  const out: Px[] = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d <= r + 0.3 && d > r - 1.4) out.push([cx + x, cy + y, 1, 1, '#18181c']);
  }
  out.push([cx, cy, 1, 1, '#c9ced6']);
  return out;
}

/**
 * A capa da Garagem no menu de jogos: a mesma garagem em miniatura — o tijolo, o telão com o pôr do
 * sol, o chão xadrez, a Harley e a Sahara. Em pixel e em SVG, sem imagem guardada, como a do Catan
 * sai do próprio desenho dele. Nada de bolo: para todo mundo, é só uma garagem.
 */
export function CapaDaGaragem() {
  const pixels = useMemo(() => {
    const p: Px[] = [[0, 0, 96, 36, '#43201a']];
    const tons = ['#6b3326', '#73382a', '#653023', '#7a3d2d'];
    for (let lin = 0; lin < 6; lin++) for (let col = -1; col < 7; col++) {
      p.push([col * 16 + (lin % 2 ? 8 : 0) + 1, lin * 6 + 1, 15, 5, tons[(lin * 3 + col * 7 + 12) % 4]]);
    }
    p.push([0, 35, 96, 2, '#2a1a14']);
    for (let y = 37; y < 56; y += 5) for (let x = 0; x < 96; x += 8) p.push([x, y, 8, 5, (x / 8 + (y - 37) / 5) % 2 === 0 ? '#a39c90' : '#423d48']);
    // o telão com a moto andando no pôr do sol
    p.push([29, 5, 38, 20, '#0b0b0e'], [30, 6, 36, 6, '#2e2556'], [30, 12, 36, 5, '#ff8a5c'], [30, 17, 36, 7, '#2b2b31']);
    p.push([58, 8, 3, 3, '#ffd27a'], [34, 20, 4, 1, '#f2e6a0'], [44, 20, 4, 1, '#f2e6a0'], [54, 20, 4, 1, '#f2e6a0']);
    p.push([45, 15, 6, 2, '#1d1d22'], [46, 13, 2, 2, '#1d1d22'], [44, 17, 2, 2, '#111'], [50, 17, 2, 2, '#111']);
    // a Harley
    p.push(...roda(14, 49, 5), ...roda(32, 49, 5));
    p.push([8, 47, 16, 1, '#c9ced6'], [18, 44, 7, 4, '#9aa1ab'], [20, 40, 10, 3, '#1d1d22'], [21, 41, 8, 1, '#f28c28']);
    p.push([11, 41, 9, 2, '#3b2a20'], [29, 37, 1, 12, '#c9ced6'], [27, 36, 5, 1, '#c9ced6'], [32, 40, 2, 2, '#fff3b0']);
    // a Sahara
    p.push(...roda(66, 49, 5), ...roda(84, 49, 5));
    p.push([71, 41, 8, 6, '#2b2b31'], [74, 37, 9, 3, '#d7263d'], [80, 36, 14, 2, '#1b1b1f'], [83, 38, 11, 3, '#f2f2f2']);
    p.push([90, 34, 5, 2, '#d7263d'], [70, 35, 1, 14, '#d4a73a'], [66, 38, 7, 1, '#f2f2f2'], [68, 33, 5, 4, '#f2f2f2'], [68, 35, 2, 1, '#fff3b0']);
    return p;
  }, []);
  return (
    <svg className="capa-da-garagem" viewBox="0 0 96 56" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" aria-hidden="true">
      {pixels.map(([x, y, w, h, cor], i) => <rect key={i} x={x} y={y} width={w} height={h} fill={cor} />)}
    </svg>
  );
}
