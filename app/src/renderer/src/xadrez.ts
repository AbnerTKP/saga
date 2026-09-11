/**
 * O tabuleiro como a tela o vê: o que há em cada casa, para onde a peça escolhida pode ir,
 * o que cada lado já tomou, o relógio e a lista de lances.
 *
 * A REGRA do xadrez não mora aqui. Ela é do servidor (`server/xadrez.mjs`), que manda junto
 * da mesa os lances que valem para quem está na vez — a tela só desenha esses lances e
 * pergunta. Duas cópias da regra, uma em cada ponta, discordariam no primeiro caso raro
 * (en passant, roque atravessando xeque), e quem perderia a partida seria quem confiou na
 * tela.
 */

export type Lado = 'w' | 'b';
export type Promocao = 'q' | 'r' | 'b' | 'n';
export type LanceLegal = { de: string; para: string; promocao: Promocao | null; san: string };

const ARQUIVOS = 'abcdefgh';

/** As 64 casas, de a8 a h1, com a letra da peça — maiúscula é branca — ou null. */
export function lerCasas(fen: string): (string | null)[] {
  const casas: (string | null)[] = [];
  for (const ch of fen.split(' ')[0] ?? '') {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') for (let i = 0; i < Number(ch); i++) casas.push(null);
    else casas.push(ch);
  }
  // Uma posição quebrada vira tabuleiro vazio, e não uma tela quebrada.
  return casas.length === 64 ? casas : Array<string | null>(64).fill(null);
}

export const nomeDaCasa = (i: number) => `${ARQUIVOS[i % 8]}${8 - Math.floor(i / 8)}`;
export const indiceDaCasa = (nome: string) => (8 - Number(nome[1])) * 8 + ARQUIVOS.indexOf(nome[0]);
export const casaClara = (i: number) => (Math.floor(i / 8) + (i % 8)) % 2 === 0;
export const ladoDaPeca = (letra: string): Lado => (letra === letra.toUpperCase() ? 'w' : 'b');

/** A ordem de desenhar as casas: quem joga de pretas vê as pretas embaixo. */
export function ordemDasCasas(embaixo: Lado): number[] {
  const casas = Array.from({ length: 64 }, (_, i) => i);
  return embaixo === 'w' ? casas : casas.reverse();
}

/**
 * Para onde a peça de `de` pode ir, uma vez cada casa: as quatro promoções de um peão
 * chegam do servidor como quatro lances para a MESMA casa, e a tela desenha um ponto só.
 */
export function destinosDe(legais: LanceLegal[], de: string): { para: string; captura: boolean }[] {
  const vistos = new Map<string, boolean>();
  for (const l of legais) {
    if (l.de === de && !vistos.has(l.para)) vistos.set(l.para, l.san.includes('x'));
  }
  return [...vistos].map(([para, captura]) => ({ para, captura }));
}

/** Se ir de `de` a `para` pede escolher a peça da promoção. */
export const pedePromocao = (legais: LanceLegal[], de: string, para: string) =>
  legais.some((l) => l.de === de && l.para === para && l.promocao !== null);

const FIGURA: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞' };

/**
 * O lance em partes, para desenhar a letra da peça como o desenho dela: "Nf3" vira ♞f3. A
 * letra vem em inglês do servidor, porque é a notação; em português "C" de cavalo não diz
 * nada a quem não aprendeu assim, e o desenho diz para todo mundo.
 */
export function partesDoLance(san: string): { figura: boolean; texto: string }[] {
  return san.split(/([KQRBN])/).filter(Boolean)
    .map((p) => (FIGURA[p] ? { figura: true, texto: FIGURA[p] } : { figura: false, texto: p }));
}

/** Os lances de dois em dois, numerados como se anota: "1. e4 e5". */
export function emPares(lances: { san: string }[]): { numero: number; brancas: string; pretas: string | null }[] {
  const pares: { numero: number; brancas: string; pretas: string | null }[] = [];
  for (let i = 0; i < lances.length; i += 2) {
    pares.push({ numero: i / 2 + 1, brancas: lances[i].san, pretas: lances[i + 1]?.san ?? null });
  }
  return pares;
}

type Tipo = 'q' | 'r' | 'b' | 'n' | 'p';
const TIPOS: Tipo[] = ['q', 'r', 'b', 'n', 'p'];
const NO_INICIO: Record<Tipo, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };
const DESENHO: Record<Tipo, string> = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

/**
 * O que cada lado já tomou do outro, contado do TABULEIRO e não da lista de lances. Peça a
 * mais que no início é promoção: o peão que virou dama não foi tomado por ninguém, e sem
 * descontá-lo ele apareceria como captura do adversário.
 */
export function tomadas(casas: (string | null)[]): { pelasBrancas: string; pelasPretas: string } {
  const faltamDe = (lado: Lado) => {
    const n: Record<Tipo, number> = { q: 0, r: 0, b: 0, n: 0, p: 0 };
    for (const c of casas) {
      const tipo = c?.toLowerCase() as Tipo | undefined;
      if (c && tipo && tipo in n && ladoDaPeca(c) === lado) n[tipo]++;
    }
    const promovidos = TIPOS.filter((t) => t !== 'p').reduce((s, t) => s + Math.max(0, n[t] - NO_INICIO[t]), 0);
    return TIPOS
      .map((t) => DESENHO[t].repeat(Math.max(0, NO_INICIO[t] - n[t] - (t === 'p' ? promovidos : 0))))
      .join('');
  };
  return { pelasBrancas: faltamDe('b'), pelasPretas: faltamDe('w') };
}

export type Relogio = { brancas: number; pretas: number; correndo: Lado | null };

/**
 * O que sobra no relógio de `lado` agora. O servidor manda o restante no instante da
 * resposta; entre uma resposta e a seguinte a tela desconta o que passou, senão o relógio
 * andaria aos saltos, de busca em busca.
 */
export function restante(relogio: Relogio, lado: Lado, passou: number): number {
  const base = lado === 'w' ? relogio.brancas : relogio.pretas;
  return Math.max(0, relogio.correndo === lado ? base - Math.max(0, passou) : base);
}

/** Abaixo disto o relógio fica vermelho. */
export const POUCO_TEMPO = 20_000;

/** "04:12"; nos últimos 10 s, com os décimos — é quando cada um deles decide a partida. */
export function formatarRelogio(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10_000) return `00:0${Math.floor(t / 1000)}.${Math.floor((t % 1000) / 100)}`;
  const s = Math.floor(t / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Os tempos da mesa, em segundos para cada jogador. */
export const TEMPOS: { valor: number | null; rotulo: string }[] = [
  { valor: null, rotulo: 'Sem relógio' },
  { valor: 180, rotulo: '3 min' },
  { valor: 300, rotulo: '5 min' },
  { valor: 600, rotulo: '10 min' },
  { valor: 1800, rotulo: '30 min' },
];

export type CorEscolhida = 'brancas' | 'pretas' | 'sorteio';

/** Como o tempo e as peças se leem num convite: "10 min para cada um · peças no sorteio". */
export function descreverMesa(tempo: number | null, cor: CorEscolhida): string {
  const relogio = tempo === null ? 'sem relógio' : `${Math.round(tempo / 60)} min para cada um`;
  const pecas = cor === 'sorteio' ? 'peças no sorteio' : `você joga de ${cor}`;
  return `${relogio} · ${pecas}`;
}

export type MotivoDoFim =
  | 'mate' | 'afogamento' | 'material' | 'cinquentaLances' | 'repeticao' | 'tempo' | 'desistencia' | 'empate';

const TITULO_DO_FIM: Record<MotivoDoFim, string> = {
  mate: 'Xeque-mate',
  tempo: 'Tempo esgotado',
  desistencia: 'Desistência',
  afogamento: 'Empate por afogamento',
  material: 'Empate',
  cinquentaLances: 'Empate',
  repeticao: 'Empate por repetição',
  empate: 'Empate',
};

const EMPATE: Partial<Record<MotivoDoFim, string>> = {
  afogamento: 'Não havia lance, e o rei não estava em xeque.',
  material: 'Não sobrou peça que dê xeque-mate.',
  cinquentaLances: 'Cinquenta lances de cada lado sem captura nem lance de peão.',
  repeticao: 'A mesma posição apareceu três vezes.',
  empate: 'Os dois aceitaram o empate.',
};

type Jogador = { id: number; nome: string };

/** O que se diz no fim, do ponto de vista de quem lê: quem venceu é "você" para ele mesmo. */
export function textoDoFim(
  fim: { motivo: MotivoDoFim; vencedor: number | null },
  brancas: Jogador,
  pretas: Jogador,
  euId: number,
): { titulo: string; frase: string } {
  const titulo = TITULO_DO_FIM[fim.motivo] ?? 'Fim de partida';
  const quem = (j: Jogador) => (j.id === euId ? 'Você' : j.nome);
  const venceu = fim.vencedor === brancas.id ? brancas : fim.vencedor === pretas.id ? pretas : null;
  if (!venceu) return { titulo, frase: EMPATE[fim.motivo] ?? 'Ninguém venceu.' };

  const perdeu = venceu === brancas ? pretas : brancas;
  const vitoria = `${quem(venceu)} venceu com as ${venceu === brancas ? 'brancas' : 'pretas'}.`;
  if (fim.motivo === 'tempo') {
    return { titulo, frase: `${perdeu.id === euId ? 'O seu tempo' : `O tempo de ${perdeu.nome}`} acabou. ${vitoria}` };
  }
  if (fim.motivo === 'desistencia') return { titulo, frase: `${quem(perdeu)} desistiu. ${vitoria}` };
  return { titulo, frase: vitoria };
}

/**
 * Quem está assistindo, em texto: "Rafa assistindo", "Você e Rafa assistindo", "Rafa, Bia +2
 * assistindo". Dois nomes cabem na coluna; o resto vira conta, que é o que não se sabe de
 * outro jeito. Ninguém assistindo não diz nada — a partida não é uma transmissão.
 */
export function plateiaDaPartida(plateia: Jogador[], euId: number): string | null {
  if (!plateia.length) return null;
  const nomes = [...plateia]
    .sort((a, b) => Number(b.id === euId) - Number(a.id === euId))
    .map((p) => (p.id === euId ? 'Você' : p.nome));
  if (nomes.length === 1) return `${nomes[0]} assistindo`;
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]} assistindo`;
  return `${nomes[0]}, ${nomes[1]} +${nomes.length - 2} assistindo`;
}
