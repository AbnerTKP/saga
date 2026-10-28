/**
 * A Navinha: o jogo dos fliperamas da Garagem (o dono, 27/10/2026: "uns video games fixos
 * independente do tema, fliperamas no caso com minigame de navizinha simples").
 *
 * É o de fliperama de sempre, de tela em pé: a sua nave embaixo, uma formação de bichos em cima que
 * balança de um lado para o outro e solta um ou outro num mergulho, tiro dos dois lados, três vidas,
 * e cada onda limpa traz outra mais rápida. Aqui mora só a regra, num campo de `CAMPO` pixels, com o
 * acaso vindo de fora (`sortear`) para o teste ser repetível; o desenho é do `desenhoDaNavinha.ts` e o
 * som, do `somDaGaragem.ts`.
 *
 * Quem bebeu demais joga torto: com a barriga em `TONTO`, a nave escorrega sozinha de um lado para o
 * outro (`tonto`). É a mesma barriga da garagem.
 */

export const CAMPO = { w: 144, h: 176 };
const NAVE_Y = CAMPO.h - 14;
const NAVE_VEL = 92;
const TIRO_VEL = 190;
const TIRO_INIMIGO_VEL = 74;
const RECARGA = 0.24;
const TIROS_NA_TELA = 2;
export const VIDAS = 3;
/** Quanto a nave pisca invencível depois de voltar. */
const PROTEGIDA = 2;
/** Da explosão da nave até ela voltar. */
const VOLTA = 1.4;
const COLUNAS = 7;
const FILEIRAS = 4;

export type Bicho = {
  /** 0 é o comandante (fileira de cima), 1 a guarda, 2 o soldado. */
  tipo: 0 | 1 | 2;
  /** O lugar na formação, para onde ele volta depois do mergulho. */
  col: number; fil: number;
  x: number; y: number;
  vida: number;
  mergulho: { t: number; x0: number; y0: number; lado: 1 | -1; atirou: number } | null;
  piscando: number;
};
export type Tiro = { x: number; y: number; vy: number; meu: boolean };
export type Explosao = { x: number; y: number; t: number; grande: boolean };
export type EventoDaNavinha = 'tiro' | 'acertou' | 'explodiu' | 'morreu' | 'onda' | 'fim' | 'comecou';
export type FaseDaNavinha = 'esperando' | 'jogando' | 'entreOndas' | 'fim';

export type Comandos = { esq: boolean; dir: boolean; atirar: boolean; /** O mouse em cima do campo: a nave vai até ele. */ mirarX: number | null };

export const PONTOS: Record<Bicho['tipo'], number> = { 0: 150, 1: 80, 2: 50 };
/** Mergulhando, o bicho vale o dobro. */
const NO_MERGULHO = 2;

export class Navinha {
  fase: FaseDaNavinha = 'esperando';
  pontos = 0;
  vidas = VIDAS;
  onda = 1;
  nave = { x: CAMPO.w / 2, viva: true, volta: 0, protegida: 0 };
  bichos: Bicho[] = [];
  tiros: Tiro[] = [];
  explosoes: Explosao[] = [];
  eventos: EventoDaNavinha[] = [];
  /** O relógio do jogo, para o balanço da formação e o piscar. */
  t = 0;
  private recarga = 0;
  private proximoMergulho = 2.5;
  private entreOndas = 0;
  private balanco = 0;
  private atirouAntes = false;
  /** Há quanto tempo a partida acabou: o "fim de jogo" fica na tela pelo menos um segundo. */
  private noFim = 0;
  /** A barriga cheia: a nave escorrega. */
  tonto = false;

  private readonly sortear: () => number;
  constructor(sortear: () => number = Math.random) { this.sortear = sortear; }

  /** Começa (ou recomeça) do zero. */
  comecar() {
    this.fase = 'jogando';
    this.pontos = 0; this.vidas = VIDAS; this.onda = 1;
    this.nave = { x: CAMPO.w / 2, viva: true, volta: 0, protegida: PROTEGIDA };
    this.tiros = []; this.explosoes = [];
    this.montarOnda();
    this.eventos.push('comecou');
  }

  private montarOnda() {
    this.bichos = [];
    for (let fil = 0; fil < FILEIRAS; fil++) {
      for (let col = 0; col < COLUNAS; col++) {
        // O comandante só nas quatro do meio: a formação fica com cara de nave-mãe.
        if (fil === 0 && (col === 0 || col === COLUNAS - 1 || col === 3)) continue;
        const tipo = (fil === 0 ? 0 : fil === 1 ? 1 : 2) as Bicho['tipo'];
        const { x, y } = this.lugar(col, fil);
        this.bichos.push({ tipo, col, fil, x, y: y - 60 - fil * 8, vida: tipo === 0 ? 2 : 1, mergulho: null, piscando: 0 });
      }
    }
    this.proximoMergulho = Math.max(0.8, 2.6 - this.onda * 0.25);
  }

  /** Onde fica cada lugar da formação agora (ela balança). */
  lugar(col: number, fil: number) {
    return { x: CAMPO.w / 2 + (col - (COLUNAS - 1) / 2) * 16 + Math.sin(this.balanco) * 10, y: 24 + fil * 13 };
  }

  passo(dt: number, c: Comandos) {
    this.t += dt;
    for (const e of this.explosoes) e.t += dt;
    this.explosoes = this.explosoes.filter((e) => e.t < (e.grande ? 0.9 : 0.45));
    if (this.fase === 'esperando' || this.fase === 'fim') {
      if (this.fase === 'fim') this.noFim += dt;
      const apertou = c.atirar && !this.atirouAntes && (this.fase === 'esperando' || this.noFim > 1);
      this.atirouAntes = c.atirar;
      if (apertou) this.comecar();
      return;
    }
    this.balanco += dt * (0.9 + this.onda * 0.12);

    // a nave
    const n = this.nave;
    if (n.viva) {
      let vx = (c.dir ? 1 : 0) - (c.esq ? 1 : 0);
      if (c.mirarX !== null && !c.esq && !c.dir) {
        const d = c.mirarX - n.x;
        vx = Math.abs(d) < 1.5 ? 0 : Math.sign(d) * Math.min(1, Math.abs(d) / 10);
      }
      n.x += vx * NAVE_VEL * dt;
      if (this.tonto) n.x += Math.sin(this.t * 2.3) * 26 * dt;
      n.x = Math.max(7, Math.min(CAMPO.w - 7, n.x));
      n.protegida = Math.max(0, n.protegida - dt);
      this.recarga -= dt;
      const meus = this.tiros.filter((k) => k.meu).length;
      if (c.atirar && this.recarga <= 0 && meus < TIROS_NA_TELA && this.fase === 'jogando') {
        this.tiros.push({ x: n.x, y: NAVE_Y - 6, vy: -TIRO_VEL, meu: true });
        this.recarga = RECARGA;
        this.eventos.push('tiro');
      }
    } else {
      n.volta -= dt;
      if (n.volta <= 0) {
        if (this.vidas <= 0) { this.fase = 'fim'; this.noFim = 0; this.eventos.push('fim'); this.atirouAntes = true; return; }
        n.viva = true; n.x = CAMPO.w / 2; n.protegida = PROTEGIDA;
      }
    }
    this.atirouAntes = c.atirar;

    // a onda acabou: um respiro, e a próxima
    if (this.fase === 'entreOndas') {
      this.entreOndas -= dt;
      if (this.entreOndas <= 0) { this.fase = 'jogando'; this.montarOnda(); }
    } else if (!this.bichos.length) {
      this.fase = 'entreOndas'; this.entreOndas = 1.6; this.onda += 1; this.eventos.push('onda');
    }

    // os bichos
    const velMergulho = 0.55 + this.onda * 0.05;
    for (const b of this.bichos) {
      b.piscando = Math.max(0, b.piscando - dt);
      const casa = this.lugar(b.col, b.fil);
      if (!b.mergulho) {
        // chegando à formação no começo da onda, e depois balançando com ela
        b.x += (casa.x - b.x) * Math.min(1, dt * 4);
        b.y += (casa.y - b.y) * Math.min(1, dt * 3);
        continue;
      }
      const m = b.mergulho;
      m.t += dt * velMergulho;
      if (m.t < 1) {
        // a curva: sai para o lado, desce em S na direção de onde a nave estava, e passa por baixo
        const k = m.t;
        b.x = m.x0 + m.lado * Math.sin(k * Math.PI * 2) * 34 + (n.x - m.x0) * k * 0.6;
        b.y = m.y0 + (CAMPO.h + 20 - m.y0) * k * k;
        if (m.atirou < 2 && k > 0.25 + m.atirou * 0.25 && b.y < NAVE_Y - 30) {
          m.atirou += 1;
          this.tiros.push({ x: b.x, y: b.y + 4, vy: TIRO_INIMIGO_VEL + this.onda * 6, meu: false });
        }
      } else {
        // saiu por baixo: volta por cima para o lugar dele
        b.mergulho = null;
        b.y = -10;
      }
    }

    // quem mergulha agora
    if (this.fase === 'jogando' && n.viva) {
      this.proximoMergulho -= dt;
      if (this.proximoMergulho <= 0) {
        const parados = this.bichos.filter((b) => !b.mergulho);
        const emVoo = this.bichos.length - parados.length;
        if (parados.length && emVoo < 1 + Math.floor(this.onda / 2)) {
          const b = parados[Math.floor(this.sortear() * parados.length)];
          b.mergulho = { t: 0, x0: b.x, y0: b.y, lado: this.sortear() < 0.5 ? -1 : 1, atirou: 0 };
        }
        this.proximoMergulho = Math.max(0.7, 2.4 - this.onda * 0.22) * (0.6 + this.sortear() * 0.8);
      }
      // um tiro de vez em quando da formação parada
      if (this.sortear() < dt * (0.25 + this.onda * 0.1)) {
        const parados = this.bichos.filter((b) => !b.mergulho);
        if (parados.length) {
          const b = parados[Math.floor(this.sortear() * parados.length)];
          this.tiros.push({ x: b.x, y: b.y + 4, vy: TIRO_INIMIGO_VEL, meu: false });
        }
      }
    }

    // os tiros
    for (const k of this.tiros) k.y += k.vy * dt;
    this.tiros = this.tiros.filter((k) => k.y > -6 && k.y < CAMPO.h + 6);

    // quem acertou quem
    for (const k of this.tiros.filter((k) => k.meu)) {
      const b = this.bichos.find((b) => Math.abs(b.x - k.x) < 6 && Math.abs(b.y - k.y) < 5);
      if (!b) continue;
      k.y = -99;
      b.vida -= 1;
      if (b.vida > 0) { b.piscando = 0.25; this.eventos.push('acertou'); continue; }
      this.pontos += PONTOS[b.tipo] * (b.mergulho ? NO_MERGULHO : 1);
      this.explosoes.push({ x: b.x, y: b.y, t: 0, grande: false });
      this.bichos = this.bichos.filter((o) => o !== b);
      this.eventos.push('explodiu');
    }
    if (n.viva && n.protegida <= 0) {
      const tiro = this.tiros.find((k) => !k.meu && Math.abs(k.x - n.x) < 5 && Math.abs(k.y - NAVE_Y) < 5);
      const trombou = this.bichos.find((b) => b.mergulho && Math.abs(b.x - n.x) < 9 && Math.abs(b.y - NAVE_Y) < 7);
      if (tiro || trombou) {
        if (tiro) tiro.y = 999;
        if (trombou) { this.bichos = this.bichos.filter((o) => o !== trombou); this.explosoes.push({ x: trombou.x, y: trombou.y, t: 0, grande: false }); }
        this.morrer();
      }
    }
    this.tiros = this.tiros.filter((k) => k.y > -6 && k.y < CAMPO.h + 6);
  }

  private morrer() {
    const n = this.nave;
    n.viva = false; n.volta = VOLTA;
    this.vidas -= 1;
    this.explosoes.push({ x: n.x, y: NAVE_Y, t: 0, grande: true });
    // os tiros dos bichos somem: voltar debaixo de uma chuva seria morrer de novo sem chance
    this.tiros = this.tiros.filter((k) => k.meu);
    this.eventos.push('morreu');
  }

  get naveY() { return NAVE_Y; }

  colher(): EventoDaNavinha[] {
    const e = this.eventos;
    this.eventos = [];
    return e;
  }
}

/** O placar com a sua partida, se ela entra: os cinco maiores, do maior para o menor. */
export function entraNoPlacar(placar: readonly { pontos: number }[], pontos: number, tamanho = 5) {
  if (pontos <= 0) return false;
  return placar.length < tamanho || pontos > placar[placar.length - 1].pontos;
}
