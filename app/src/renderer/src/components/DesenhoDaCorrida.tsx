import { equipeDoCarro, pontoNaPista, type Pista } from '../corrida';

/**
 * O desenho da corrida: o carro visto de cima e a pista. O carro existe duas vezes — em SVG,
 * para os cartões do grid e o menu, e em canvas, para a pista a sessenta quadros — e as duas
 * saem das MESMAS medidas abaixo, senão o carro que se escolhe não seria o que se pilota.
 *
 * O carro aponta para +x e tem 36 de comprimento: asa traseira em -18, bico em +15.
 */
const PECAS = {
  rodas: [[-15, -9.5, 7, 4.5], [-15, 5, 7, 4.5], [7, -9.5, 6, 4.5], [7, 5, 6, 4.5]],
  asaTraseira: [-18, -7.5, 4, 15],
  asaDianteira: [14.5, -8.5, 3.5, 17],
  faixa: [-12, -1.1, 13, 2.2],
} as const;

/** O carro em SVG, de lado a lado do quadro, apontando para a direita. */
export function CarroDesenho({ carro, largura = 116, angulo = 0 }: { carro: string; largura?: number; angulo?: number }) {
  const e = equipeDoCarro(carro);
  return (
    <svg width={largura} height={largura / 2} viewBox="-20 -10 40 20" aria-hidden="true" style={{ flex: 'none', overflow: 'visible' }}>
      <g transform={`rotate(${angulo})`}>
        <ellipse cx="0" cy="1.5" rx="17" ry="8" fill="rgba(0,0,0,.2)" />
        {PECAS.rodas.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="1.5" fill="#15171b" />)}
        <path d="M-13,-5.5 C-6,-6.5 2,-6 5,-3 L5,3 C2,6 -6,6.5 -13,5.5 Z" fill={e.pri} />
        <path d="M5,-2.6 L15,-1.2 L15,1.2 L5,2.6 Z" fill={e.pri} />
        <rect x={PECAS.faixa[0]} y={PECAS.faixa[1]} width={PECAS.faixa[2]} height={PECAS.faixa[3]} fill={e.acc} opacity=".9" />
        <rect x={PECAS.asaTraseira[0]} y={PECAS.asaTraseira[1]} width={PECAS.asaTraseira[2]} height={PECAS.asaTraseira[3]} rx="1" fill={e.sec} />
        <rect x={PECAS.asaDianteira[0]} y={PECAS.asaDianteira[1]} width={PECAS.asaDianteira[2]} height={PECAS.asaDianteira[3]} rx="1" fill={e.sec} />
        <ellipse cx="-1" cy="0" rx="3.4" ry="2.4" fill="#0d0f12" />
        <circle cx="-1.4" cy="0" r="1.6" fill={e.acc === '#1b1d21' ? e.sec : e.acc} />
      </g>
    </svg>
  );
}

const retangulo = (ctx: CanvasRenderingContext2D, [x, y, w, h]: readonly number[], raio: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, raio);
  ctx.fill();
};

/** O mesmo carro, no canvas, já com a transformação da pista aplicada. */
export function desenharCarro(ctx: CanvasRenderingContext2D, carro: string, x: number, y: number, angulo: number, voce: boolean) {
  const e = equipeDoCarro(carro);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angulo);
  if (voce) {
    ctx.beginPath();
    ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(63,127,224,.22)';
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#6ba3f5';
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 17, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#15171b';
  for (const r of PECAS.rodas) retangulo(ctx, r, 1.5);
  ctx.fillStyle = e.pri;
  ctx.beginPath();
  ctx.moveTo(-13, -5.5);
  ctx.bezierCurveTo(-6, -6.5, 2, -6, 5, -3);
  ctx.lineTo(5, 3);
  ctx.bezierCurveTo(2, 6, -6, 6.5, -13, 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(5, -2.6); ctx.lineTo(15, -1.2); ctx.lineTo(15, 1.2); ctx.lineTo(5, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = e.acc;
  retangulo(ctx, PECAS.faixa, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = e.sec;
  retangulo(ctx, PECAS.asaTraseira, 1);
  retangulo(ctx, PECAS.asaDianteira, 1);
  ctx.fillStyle = '#0d0f12';
  ctx.beginPath();
  ctx.ellipse(-1, 0, 3.4, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = e.acc === '#1b1d21' ? e.sec : e.acc;
  ctx.beginPath();
  ctx.arc(-1.4, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Onde a pista cabe no quadro: a matriz que leva o mundo da pista para a tela, com uma margem.
 *
 * A pista é deitada e o quadro nem sempre é: numa janela estreita, com a coluna da
 * classificação ao lado, ele fica em pé, e a pista deitada virava um desenho pequeno no meio
 * de um quadro vazio. Então ela GIRA um quarto de volta quando assim cabe maior. Só o desenho
 * gira — o volante é do carro, esquerda é esquerda dele, e a física nem fica sabendo.
 */
export function enquadrarPista(pista: Pista, largura: number, altura: number, margem = 36) {
  const { x, y, w, h } = pista.limites;
  const meia = pista.largura / 2 + 8;
  const L = largura - 2 * margem, A = altura - 2 * margem;
  const deitada = Math.min(L / (w + 2 * meia), A / (h + 2 * meia));
  const empe = Math.min(L / (h + 2 * meia), A / (w + 2 * meia));
  const girar = empe > deitada * 1.08;
  const s = girar ? empe : deitada;
  const cx = x + w / 2, cy = y + h / 2, sx = largura / 2, sy = altura / 2;
  // [a, b, c, d, e, f] do canvas: X = a·x + c·y + e, Y = b·x + d·y + f.
  const matriz: [number, number, number, number, number, number] = girar
    ? [0, s, -s, 0, sx + cy * s, sy - cx * s]
    : [s, 0, 0, s, sx - cx * s, sy - cy * s];
  return { escala: s, girar, matriz };
}

/**
 * A pista da casa, que foi a escolhida: fundo escuro pontilhado, asfalto no cinza dos
 * cartões, zebras nos azuis da logo. Desenhada uma vez por tamanho de quadro, num canvas à
 * parte — ela não muda, e redesenhar setecentos trechos a cada quadro seria jogar CPU fora.
 */
export function desenharPista(pista: Pista, largura: number, altura: number, dpr: number): HTMLCanvasElement {
  const tela = document.createElement('canvas');
  tela.width = Math.round(largura * dpr);
  tela.height = Math.round(altura * dpr);
  const ctx = tela.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#14161b';
  ctx.fillRect(0, 0, largura, altura);
  ctx.fillStyle = '#252a33';
  for (let px = 12; px < largura; px += 24) {
    for (let py = 12; py < altura; py += 24) ctx.fillRect(px - 1, py - 1, 2, 2);
  }

  ctx.transform(...enquadrarPista(pista, largura, altura).matriz);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const n = pista.pontos.length;
  const tracar = (de: number, ate: number, fechar: boolean) => {
    ctx.beginPath();
    for (let k = de; k <= ate; k++) {
      const [x, y] = pista.pontos[((k % n) + n) % n];
      if (k === de) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (fechar) ctx.closePath();
  };

  // Zebra nas curvas: onde a direção gira rápido. Branca por baixo e azul tracejado por cima.
  const curva = pista.pontos.map((b, i) => {
    const a = pista.pontos[(i - 1 + n) % n], c = pista.pontos[(i + 1) % n];
    let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) > 0.045;
  });
  for (let i = 0; i < n;) {
    if (!curva[i]) { i++; continue; }
    let j = i;
    while (j < n && curva[j]) j++;
    ctx.lineCap = 'butt';
    tracar(i - 3, j + 3, false);
    ctx.lineWidth = pista.largura + 14;
    ctx.setLineDash([]);
    ctx.strokeStyle = '#f4f7fb';
    ctx.stroke();
    ctx.setLineDash([9, 9]);
    ctx.strokeStyle = '#3f7fe0';
    ctx.stroke();
    ctx.setLineDash([]);
    i = j;
  }

  tracar(0, n - 1, true);
  ctx.lineWidth = pista.largura + 5;
  ctx.strokeStyle = '#313745';
  ctx.stroke();
  ctx.lineWidth = pista.largura;
  ctx.strokeStyle = '#272c36';
  ctx.stroke();

  // As caixas do grid: um colchete por lugar, atrás da linha.
  ctx.strokeStyle = 'rgba(139,147,163,.55)';
  ctx.lineWidth = 2;
  for (let lugar = 0; lugar < 8; lugar++) {
    const fila = Math.floor(lugar / 2);
    const lado = lugar % 2 === 0 ? -pista.largura * 0.22 : pista.largura * 0.22;
    const p = pontoNaPista(pista, pista.largada - 34 - fila * 52 - (lugar % 2) * 20 + 22, lado);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angulo);
    ctx.beginPath();
    ctx.moveTo(-4, -11); ctx.lineTo(4, -11); ctx.lineTo(4, 11); ctx.lineTo(-4, 11);
    ctx.stroke();
    ctx.restore();
  }

  // A linha de chegada, quadriculada.
  const linha = pontoNaPista(pista, pista.largada);
  ctx.save();
  ctx.translate(linha.x, linha.y);
  ctx.rotate(linha.angulo);
  const lado = 6;
  for (let fila = 0; fila < 2; fila++) {
    for (let k = 0; k * lado < pista.largura; k++) {
      ctx.fillStyle = (k + fila) % 2 === 0 ? '#f4f7fb' : '#14161b';
      ctx.fillRect(-lado + fila * lado, -pista.largura / 2 + k * lado, lado, lado);
    }
  }
  ctx.restore();
  return tela;
}
