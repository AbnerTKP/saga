/**
 * O Catan do lado do app: o que viaja do servidor e o que dá para decidir sem tela.
 *
 * A regra mora no servidor (`server/catan.mjs`): ele rola os dados, embaralha e diz a cada
 * leitura o que você pode fazer — onde cabe aldeia, que estrada vale, a taxa do banco. Aqui só
 * há o que a TELA precisa: onde fica cada peça, como se conta o que aconteceu, e quando tocar.
 */

export type Recurso = 'madeira' | 'tijolo' | 'la' | 'trigo' | 'minerio';
export const RECURSOS: Recurso[] = ['madeira', 'tijolo', 'la', 'trigo', 'minerio'];
export type Terreno = 'floresta' | 'pasto' | 'campo' | 'colina' | 'montanha' | 'deserto';
export type CorDoCatan = 'vermelho' | 'azul' | 'laranja' | 'branco';
export type CartaDeDesenvolvimento = 'cavaleiro' | 'ponto' | 'estradas' | 'fartura' | 'monopolio';
export type Monte = Record<Recurso, number>;
export type Fase = 'inicio' | 'rolar' | 'acoes' | 'descartar' | 'ladrao' | 'estradas' | 'fim';

export const NOME_DO_RECURSO: Record<Recurso, string> = { madeira: 'madeira', tijolo: 'tijolo', la: 'lã', trigo: 'trigo', minerio: 'minério' };
export const NOME_DA_CARTA: Record<CartaDeDesenvolvimento, string> = {
  cavaleiro: 'Cavaleiro', ponto: 'Ponto de vitória', estradas: 'Construção de estradas', fartura: 'Ano de fartura', monopolio: 'Monopólio',
};
export const O_QUE_A_CARTA_FAZ: Record<CartaDeDesenvolvimento, string> = {
  cavaleiro: 'Move o ladrão e rouba uma carta. Três fazem o maior exército.',
  ponto: 'Um ponto, escondido até você vencer.',
  estradas: 'Duas estradas de graça.',
  fartura: 'Duas cartas quaisquer do banco.',
  monopolio: 'Todos te dão todas as cartas de um recurso.',
};
/** A cor de cada jogador. É desenho de jogo, não da casa: a mesma do tabuleiro impresso. */
export const COR_DO_JOGADOR: Record<CorDoCatan, string> = { vermelho: '#d8453b', azul: '#3f7fe0', laranja: '#e8912d', branco: '#eef0f3' };
export const CUSTOS: Record<'estrada' | 'aldeia' | 'cidade' | 'desenvolvimento', Recurso[]> = {
  estrada: ['madeira', 'tijolo'],
  aldeia: ['madeira', 'tijolo', 'la', 'trigo'],
  cidade: ['trigo', 'trigo', 'minerio', 'minerio', 'minerio'],
  desenvolvimento: ['la', 'trigo', 'minerio'],
};

export type PessoaNoCatan = { id: number; nome: string; foto: string | null; idExibido: string | null };

export type Pode = {
  rolar?: true;
  passar?: true;
  trocar?: true;
  comprar?: true;
  pararEstradas?: true;
  responder?: true;
  aldeias?: string[];
  estradas?: string[];
  cidades?: string[];
  /** Terreno → quem dá para roubar ali. */
  ladrao?: Record<string, number[]>;
  descartar?: number;
  jogar?: CartaDeDesenvolvimento[];
  banco?: Monte;
};

export type Evento =
  | { t: 'comecou'; rodada: number }
  | { t: 'aldeia' | 'cidade'; j: number; rodada: number }
  | { t: 'estrada'; j: number; gratis?: true; rodada: number }
  | { t: 'recebeu'; j: number; recursos: Monte; rodada: number }
  | { t: 'rolou'; j: number; dados: [number, number]; rodada: number }
  | { t: 'produziu'; numero: number; ganhos: Record<string, Partial<Monte>>; faltou: Recurso[]; rodada: number }
  | { t: 'descartou'; j: number; quantas: number; rodada: number }
  | { t: 'ladrao'; j: number; hex: string; rodada: number }
  | { t: 'roubou'; j: number; de: number; recurso?: Recurso; rodada: number }
  | { t: 'comprou'; j: number; carta?: CartaDeDesenvolvimento; rodada: number }
  | { t: 'jogou'; j: number; carta: CartaDeDesenvolvimento; recurso?: Recurso; total?: number; recursos?: Monte; rodada: number }
  | { t: 'banco'; j: number; da: Recurso; quer: Recurso; taxa: number; rodada: number }
  | { t: 'ofereceu'; j: number; da: Monte; quer: Monte; rodada: number }
  | { t: 'trocou'; j: number; com: number; deu: Monte; recebeu: Monte; rodada: number }
  | { t: 'maiorEstrada' | 'maiorExercito'; j: number | null; de: number | null; rodada: number }
  | { t: 'saiu'; j: number; rodada: number }
  | { t: 'venceu'; j: number; porAbandono?: true; rodada: number };

export type JogadorNaPartida = {
  cor: CorDoCatan;
  cartas: number;
  desenvolvimento: number;
  cavaleiros: number;
  estrada: number;
  pontos: number;
  pecas: { estrada: number; aldeia: number; cidade: number };
  fora: boolean;
  descartar: number;
  /** Só no fim: a mão e as cartas de todo mundo. */
  mao?: Monte;
  cartasDeDesenvolvimento?: CartaDeDesenvolvimento[];
};

export type Partida = {
  hexes: { q: number; r: number; terreno: Terreno; numero: number | null }[];
  portos: { tipo: '3:1' | Recurso; cruzamentos: [string, string] }[];
  ladrao: string;
  construcoes: { v: string; j: number; tipo: 'aldeia' | 'cidade' }[];
  estradas: { a: string; j: number }[];
  jogadores: JogadorNaPartida[];
  maiorEstrada: { j: number; tamanho: number } | null;
  maiorExercito: { j: number; tamanho: number } | null;
  banco: Monte;
  baralho: number;
  fase: Fase;
  vez: number;
  rodada: number;
  inicio: { falta: 'aldeia' | 'estrada'; segunda: boolean } | null;
  dados: [number, number] | null;
  /** Quantas vezes os dados rolaram: muda a cada rolagem, mesmo quando sai o mesmo número. */
  rolagens: number;
  contagem: Record<string, number>;
  estradasGratis: number;
  oferta: {
    da: Monte; quer: Monte;
    respostas: Record<string, 'aceita' | 'recusa' | 'contra'>;
    contras: Record<string, { da: Monte; quer: Monte }>;
  } | null;
  historico: Evento[];
  vencedor: number | null;
  /** A sua posição na mesa, ou null para quem assiste. */
  eu: number | null;
  mao: Monte | null;
  cartas: { tipo: CartaDeDesenvolvimento; nova: boolean }[] | null;
  pode: Pode;
};

export type MesaDoCatan = {
  id: number;
  estado: 'lobby' | 'jogando' | 'fim';
  anfitriao: PessoaNoCatan;
  lugares: PessoaNoCatan[];
  chamados: PessoaNoCatan[];
  recusaram: number[];
  /** Na ordem da partida: a posição j é a pessoa `jogadores[j]`. */
  jogadores: PessoaNoCatan[] | null;
  partida: Partida | null;
  plateia: PessoaNoCatan[];
  eu: 'anfitriao' | 'sentado' | 'chamado' | 'jogador' | 'plateia';
  agora: number;
};

export type ResumoDaMesaDoCatan = {
  id: number;
  estado: 'lobby' | 'jogando' | 'fim';
  anfitriao: number;
  jogadores: number[];
  vez: number | null;
  fase: Fase | null;
  devem: number[];
};
export type ConviteDeCatan = {
  mesa: number; servidor?: number; servidorNome?: string | null;
  de: PessoaNoCatan; sentados: PessoaNoCatan[];
};
export type CatanNoServidor = { mesas: ResumoDaMesaDoCatan[]; convites: ConviteDeCatan[] };

export type Jogada =
  | { tipo: 'rolar' | 'passar' | 'comprar' | 'cavaleiro' | 'estradas' | 'pararEstradas' | 'cancelarOferta' }
  | { tipo: 'aldeia' | 'cidade'; v: string }
  | { tipo: 'estrada'; a: string }
  | { tipo: 'descartar'; recursos: Partial<Monte> }
  | { tipo: 'ladrao'; hex: string; vitima?: number }
  | { tipo: 'fartura'; recursos: [Recurso, Recurso] }
  | { tipo: 'monopolio'; recurso: Recurso }
  | { tipo: 'banco'; da: Recurso; quer: Recurso }
  | { tipo: 'oferecer' | 'contraproposta'; da: Partial<Monte>; quer: Partial<Monte> }
  | { tipo: 'responder'; resposta: 'aceita' | 'recusa' }
  | { tipo: 'fecharTroca'; com: number; contra?: boolean };

export type AcaoNaMesaDoCatan =
  | { acao: 'chamar' | 'cancelarConvite' | 'tirar'; alvo: number }
  | { acao: 'aceitar' | 'recusar' | 'levantar' | 'comecar' | 'desistir' | 'jogarDeNovo' | 'fechar' }
  | { acao: 'jogar'; jogada: Jogada };

// --- geometria ----------------------------------------------------------------
// Os nomes das peças SÃO posições (ver `server/catan.mjs`): o cruzamento "x,y" está em x meias-
// larguras e y meios-raios do centro. Com o raio do hexágono valendo 1:

const R3 = Math.sqrt(3);
export type Ponto = { x: number; y: number };

export const centroDoHex = (q: number, r: number): Ponto => ({ x: R3 * (q + r / 2), y: 1.5 * r });
export const chaveDoHex = (q: number, r: number) => `${q},${r}`;
export function lerHex(chave: string): { q: number; r: number } {
  const [q, r] = chave.split(',').map(Number);
  return { q, r };
}
export function pontoDoCruzamento(v: string): Ponto {
  const [x, y] = v.split(',').map(Number);
  return { x: (x * R3) / 2, y: y / 2 };
}
export function pontasDaAresta(a: string): [Ponto, Ponto] {
  const [v, w] = a.split('|');
  return [pontoDoCruzamento(v), pontoDoCruzamento(w)];
}

// --- contas ---------------------------------------------------------------------

export const somaDoMonte = (m: Partial<Monte> | null | undefined) => RECURSOS.reduce((s, r) => s + (m?.[r] ?? 0), 0);
export const monteVazio = (): Monte => ({ madeira: 0, tijolo: 0, la: 0, trigo: 0, minerio: 0 });
export const temTudo = (mao: Monte | null, custo: Recurso[]) => {
  if (!mao) return false;
  const falta = monteVazio();
  for (const r of custo) falta[r]++;
  return RECURSOS.every((r) => mao[r] >= falta[r]);
};

/** "2 trigo e 1 lã". */
export function textoDoMonte(m: Partial<Monte>): string {
  const partes = RECURSOS.filter((r) => (m[r] ?? 0) > 0).map((r) => `${m[r]} ${NOME_DO_RECURSO[r]}`);
  if (partes.length <= 1) return partes[0] ?? 'nada';
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

/** Os terrenos que renderam com os dados que acabaram de sair — para acendê-los no tabuleiro. */
export function hexesQueProduziram(p: Partida): Set<string> {
  const ultimo = p.historico.at(-1);
  const rolagem = [...p.historico].reverse().find((e) => e.t === 'rolou');
  if (!p.dados || !rolagem || !ultimo) return new Set();
  const soma = p.dados[0] + p.dados[1];
  if (soma === 7) return new Set();
  return new Set(p.hexes.filter((h) => h.numero === soma && chaveDoHex(h.q, h.r) !== p.ladrao).map((h) => chaveDoHex(h.q, h.r)));
}

/**
 * Uma linha do "Acontecendo". `nome(j)` é o nome de quem está na posição j; `eu` é a sua
 * posição, que vira "você".
 */
export function textoDoEvento(e: Evento, nome: (j: number) => string, eu: number | null): string | null {
  const q = (j: number) => (j === eu ? 'você' : nome(j));
  const Q = (j: number) => (j === eu ? 'Você' : nome(j));
  switch (e.t) {
    case 'comecou': return 'Todos colocaram: a partida começou.';
    case 'aldeia': return `${Q(e.j)} construiu uma aldeia.`;
    case 'cidade': return `${Q(e.j)} fez uma cidade.`;
    case 'estrada': return `${Q(e.j)} fez uma estrada${e.gratis ? ' de graça' : ''}.`;
    case 'recebeu': return somaDoMonte(e.recursos) ? `${Q(e.j)} recebeu ${textoDoMonte(e.recursos)}.` : null;
    case 'rolou': return `${Q(e.j)} tirou ${e.dados[0] + e.dados[1]}.`;
    case 'produziu': {
      const ganhos = Object.entries(e.ganhos).map(([j, m]) => `${q(Number(j))} ${textoDoMonte(m)}`);
      const faltou = e.faltou.length ? ` O banco não tinha ${e.faltou.map((r) => NOME_DO_RECURSO[r]).join(' nem ')} para todos.` : '';
      return ganhos.length ? `Renderam: ${ganhos.join('; ')}.${faltou}` : `Ninguém ganhou nada.${faltou}`;
    }
    case 'descartou': return `${Q(e.j)} devolveu ${e.quantas} ${e.quantas === 1 ? 'carta' : 'cartas'}.`;
    case 'ladrao': return `${Q(e.j)} moveu o ladrão.`;
    case 'roubou': return `${Q(e.j)} roubou ${e.recurso ? `1 ${NOME_DO_RECURSO[e.recurso]}` : 'uma carta'} de ${q(e.de)}.`;
    case 'comprou': return `${Q(e.j)} comprou uma carta de desenvolvimento${e.carta && e.j === eu ? ` (${NOME_DA_CARTA[e.carta]})` : ''}.`;
    case 'jogou':
      if (e.carta === 'monopolio' && e.recurso) return `${Q(e.j)} jogou Monopólio: levou ${e.total ?? 0} ${NOME_DO_RECURSO[e.recurso]}.`;
      if (e.carta === 'fartura' && e.recursos) return `${Q(e.j)} jogou Ano de fartura: ${textoDoMonte(e.recursos)}.`;
      return `${Q(e.j)} jogou ${NOME_DA_CARTA[e.carta]}.`;
    case 'banco': return `${Q(e.j)} trocou ${e.taxa} ${NOME_DO_RECURSO[e.da]} por 1 ${NOME_DO_RECURSO[e.quer]} no banco.`;
    case 'ofereceu': return `${Q(e.j)} ofereceu ${textoDoMonte(e.da)} por ${textoDoMonte(e.quer)}.`;
    case 'trocou': return `${Q(e.j)} trocou ${textoDoMonte(e.deu)} por ${textoDoMonte(e.recebeu)} com ${q(e.com)}.`;
    case 'maiorEstrada':
      if (e.j === null) return `${e.de === null ? 'Ninguém' : Q(e.de)} perdeu a maior estrada${e.de === null ? '' : ', e ninguém ficou com ela'}.`;
      return `${Q(e.j)} ${e.de === null ? 'fez' : 'tomou'} a maior estrada.`;
    case 'maiorExercito':
      return e.j === null ? null : `${Q(e.j)} ${e.de === null ? 'formou' : 'tomou'} o maior exército.`;
    case 'saiu': return `${Q(e.j)} saiu da partida.`;
    case 'venceu': return e.porAbandono ? `${Q(e.j)} venceu: os outros saíram.` : `${Q(e.j)} venceu a partida!`;
  }
  return null;
}

/** O que a partida está esperando, dito para quem olha: vai no alto da tela. */
export function oQueEspera(p: Partida, nome: (j: number) => string): { texto: string; minha: boolean } {
  const eu = p.eu;
  const daVez = p.vez === eu;
  const quem = daVez ? null : nome(p.vez);
  if (p.fase === 'fim') return { texto: p.vencedor === null ? 'partida encerrada' : `${p.vencedor === eu ? 'você venceu' : `${nome(p.vencedor)} venceu`}`, minha: false };
  if (p.fase === 'descartar') {
    const devo = eu !== null && p.jogadores[eu].descartar > 0;
    return { texto: devo ? `saiu 7: devolva ${p.jogadores[eu].descartar} cartas` : 'saiu 7: esperando os descartes', minha: devo };
  }
  const texto: Record<Exclude<Fase, 'fim' | 'descartar'>, [string, string]> = {
    inicio: [p.inicio?.falta === 'estrada' ? 'sua vez: ponha a estrada' : 'sua vez: ponha uma aldeia', `${quem} está colocando`],
    rolar: ['sua vez: role os dados', `vez de ${quem}`],
    acoes: ['sua vez', `vez de ${quem}`],
    ladrao: ['mova o ladrão', `${quem} está movendo o ladrão`],
    estradas: [`ponha ${p.estradasGratis} ${p.estradasGratis === 1 ? 'estrada' : 'estradas'} de graça`, `${quem} está pondo estradas`],
  };
  const [minha, dele] = texto[p.fase];
  return { texto: daVez ? minha : dele, minha: daVez };
}

/**
 * O que tocar quando a mesa muda, visto da busca de salas — é o som que avisa quem saiu da tela
 * do jogo para ler o chat. `vez`: passou a ser a sua (ou você deve um descarte). `fim`: acabou.
 * Na primeira leitura não toca nada: abrir o app não é acontecer.
 */
export function oQueTocarNoCatan(
  antes: ResumoDaMesaDoCatan | null,
  agora: ResumoDaMesaDoCatan | null,
  euId: number,
): 'vez' | 'fim' | null {
  if (!antes || !agora || antes.id !== agora.id) return null;
  if (antes.estado === 'jogando' && agora.estado === 'fim') return 'fim';
  if (agora.estado !== 'jogando') return null;
  const chamado = (m: ResumoDaMesaDoCatan) => m.estado === 'jogando' && (m.vez === euId || m.devem.includes(euId));
  return chamado(agora) && !chamado(antes) ? 'vez' : null;
}

/** A mesa que é sua: a partida em que você joga; senão a que espera com você sentado; senão a que acabou. */
export function minhaMesaDoCatan(mesas: ResumoDaMesaDoCatan[], euId: number): ResumoDaMesaDoCatan | null {
  const estou = (m: ResumoDaMesaDoCatan) => m.jogadores.includes(euId);
  return mesas.find((m) => m.estado === 'jogando' && estou(m))
    ?? mesas.find((m) => m.estado === 'lobby' && estou(m))
    ?? mesas.find((m) => m.estado === 'fim' && estou(m))
    ?? null;
}
