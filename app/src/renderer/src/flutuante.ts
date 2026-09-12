/**
 * Onde o quadro da live pousa dentro da janela, e o que acontece quando se puxa uma quina.
 *
 * Ele vivia chumbado no canto de baixo à direita (`right: 16px; bottom: 84px`), e chumbado
 * ele tapa justamente o que estiver ali: o fim da conversa, o campo de escrever, a lista da
 * direita. Arrastar resolve isso, mas guardar a posição como um par de pixels não resolve:
 * quem encostou o quadro na direita e depois esticou a janela veria o quadro ficar no meio
 * do nada, porque o que ele quis dizer foi "colado na direita", e não "a 900 px da
 * esquerda".
 *
 * Por isso o que se guarda é um POUSO: a distância do canto mais PRÓXIMO, com o lado
 * junto. Colado embaixo à direita continua colado embaixo à direita depois de a janela
 * mudar de tamanho, de trocar de monitor ou de reabrir o app.
 *
 * Puro e testado: é o tipo de conta que erra calado — tirar da posição velha desloca a
 * nova, e a quina que se puxa decide qual das outras três fica parada.
 */

export type Quina = 'nw' | 'ne' | 'sw' | 'se';

/** O espaço de que o quadro dispõe — o palco, sem a barra lateral. */
export type Area = { largura: number; altura: number };

/** Onde o quadro está agora, em pixels a partir do canto de cima à esquerda da área. */
export type Caixa = { x: number; y: number; largura: number };

/** Onde o quadro FICA, contado do canto mais próximo. É isto que se guarda. */
export type Pouso = {
  /** Distância da borda esquerda, ou da direita quando `deDireita`. */
  dx: number;
  /** Distância da borda de cima, ou da de baixo quando `deBaixo`. */
  dy: number;
  deDireita: boolean;
  deBaixo: boolean;
  largura: number;
};

/** Abaixo disto os botões do meio não cabem, e controle espremido ninguém acerta. */
export const LARGURA_MIN = 200;
/** Acima disto não é mais um quadro de canto: é a live, e para isso existe o palco. */
export const LARGURA_MAX = 760;
/** A barra de controles é a alça de arrastar, e ela não encolhe junto com a imagem. */
export const BARRA = 44;
/** Distância em que o quadro cola na borda ao ser solto. */
export const IMA = 28;
/** O respiro entre o quadro colado e a borda da área. */
export const MARGEM = 16;

/** Onde ele nasce: o canto de baixo à direita, como sempre foi. Os 84 px de baixo são a
    barra de escrever do chat, que ele nunca deve tapar. */
export const PADRAO: Pouso = { dx: MARGEM, dy: 84, deDireita: true, deBaixo: true, largura: 320 };

/** 16:9 de imagem mais a barra. A largura é quem manda: a altura sai dela. */
export const alturaDe = (largura: number): number => Math.round((largura * 9) / 16) + BARRA;

/** A largura possível nesta área — numa janela estreita o teto é a própria janela. */
export function limitarLargura(largura: number, area: Area): number {
  const teto = Math.max(LARGURA_MIN, Math.min(LARGURA_MAX, area.largura - MARGEM * 2));
  return Math.round(Math.min(teto, Math.max(LARGURA_MIN, largura)));
}

/** Prende a caixa dentro da área, sem colar em nada. É o que vale enquanto se arrasta. */
export function prender(caixa: Caixa, area: Area): Caixa {
  const largura = limitarLargura(caixa.largura, area);
  const altura = alturaDe(largura);
  const limite = (v: number, tamanho: number, disponivel: number) =>
    Math.round(Math.min(Math.max(v, 0), Math.max(0, disponivel - tamanho)));
  return { x: limite(caixa.x, largura, area.largura), y: limite(caixa.y, altura, area.altura), largura };
}

/**
 * Solta o quadro: prende dentro da área, escolhe o canto mais próximo e cola na borda
 * quando parou perto dela. O canto escolhido é o que vai ser guardado.
 */
export function aoSoltar(caixa: Caixa, area: Area): Pouso {
  const { x, y, largura } = prender(caixa, area);
  const altura = alturaDe(largura);
  const direita = area.largura - (x + largura);
  const baixo = area.altura - (y + altura);
  const deDireita = direita < x;
  const deBaixo = baixo < y;
  const cola = (d: number) => (d < MARGEM + IMA ? MARGEM : Math.round(d));
  return { dx: cola(deDireita ? direita : x), dy: cola(deBaixo ? baixo : y), deDireita, deBaixo, largura };
}

/** Do que foi guardado para onde desenhar agora — já preso dentro da área de hoje. */
export function paraTela(pouso: Pouso, area: Area): Caixa {
  const largura = limitarLargura(pouso.largura, area);
  const altura = alturaDe(largura);
  return prender({
    x: pouso.deDireita ? area.largura - largura - pouso.dx : pouso.dx,
    y: pouso.deBaixo ? area.altura - altura - pouso.dy : pouso.dy,
    largura,
  }, area);
}

/**
 * Puxar uma quina.
 *
 * A quina OPOSTA à que se pega fica parada — é o que a mão espera de qualquer janela. E
 * como a proporção é fixa, só uma das duas direções pode mandar: manda a que o ponteiro
 * andou mais, senão arrastar na diagonal daria dois resultados diferentes para o mesmo
 * gesto.
 */
export function esticar(inicio: Caixa, quina: Quina, dx: number, dy: number, area: Area): Caixa {
  const paraDireita = quina === 'ne' || quina === 'se';
  const paraBaixo = quina === 'se' || quina === 'sw';
  const porX = inicio.largura + (paraDireita ? dx : -dx);
  const porY = ((alturaDe(inicio.largura) + (paraBaixo ? dy : -dy)) - BARRA) * (16 / 9);
  const largura = limitarLargura(Math.abs(dy) > Math.abs(dx) ? porY : porX, area);
  return prender({
    x: paraDireita ? inicio.x : inicio.x + (inicio.largura - largura),
    y: paraBaixo ? inicio.y : inicio.y + (alturaDe(inicio.largura) - alturaDe(largura)),
    largura,
  }, area);
}

const CHAVE = 'cantinho.minilive';

/**
 * O que foi guardado nesta máquina. Lixo na chave volta ao padrão em vez de derrubar a
 * tela — é a mesma lição do `Number('')` do soundboard: um valor estragado no
 * `localStorage` não pode calar (nem quebrar) o app inteiro.
 */
export function pousoGuardado(): Pouso {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return PADRAO;
    return validar(JSON.parse(cru));
  } catch {
    return PADRAO;
  }
}

export function guardarPouso(pouso: Pouso): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(pouso)); } catch { /* sem guardar, volta ao padrão */ }
}

/** Um pouso só vale se os cinco campos vierem certos; qualquer buraco cai no padrão. */
export function validar(cru: unknown): Pouso {
  if (!cru || typeof cru !== 'object') return PADRAO;
  const p = cru as Record<string, unknown>;
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const dx = numero(p.dx);
  const dy = numero(p.dy);
  const largura = numero(p.largura);
  if (dx === null || dy === null || largura === null) return PADRAO;
  if (typeof p.deDireita !== 'boolean' || typeof p.deBaixo !== 'boolean') return PADRAO;
  return {
    dx: Math.max(0, dx),
    dy: Math.max(0, dy),
    deDireita: p.deDireita,
    deBaixo: p.deBaixo,
    largura: Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, largura)),
  };
}
