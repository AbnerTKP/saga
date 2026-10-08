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

/** O tempo de cada vez: quem abre a mesa escolhe, antes de começar. */
export type SegundosDaVez = 30 | 60;
export const TEMPOS_DA_VEZ: { segundos: SegundosDaVez; rotulo: string }[] = [
  { segundos: 30, rotulo: '30 segundos' },
  { segundos: 60, rotulo: '1 minuto' },
];
/** Quanto a troca fica aberta para resposta — fixo no servidor. */
export const PRAZO_DA_TROCA = 15_000;
/** Quanto se tem para montar a troca, da hora em que a janela abre — fixo no servidor. */
export const PRAZO_DA_MONTAGEM = 20_000;

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
  /** O relógio jogou por `j`: a `fase` é onde a vez (ou o descarte) estava quando o tempo acabou. */
  | { t: 'tempo'; j: number; fase: Exclude<Fase, 'fim'>; rodada: number }
  /** Os 15 s da troca de `j` passaram sem ninguém aceitar nem propor outra: ela fechou. */
  | { t: 'ofertaVenceu'; j: number; rodada: number }
  /** Os 20 s de `j` montar a troca passaram sem oferta: a janela fechou. */
  | { t: 'montagemVenceu'; j: number; rodada: number }
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
    /** Falso depois dos 15 s: ninguém mais responde, e quem ofereceu ainda fecha com quem aceitou. */
    aberta: boolean;
    /** Instante (relógio do servidor) em que acabam os 15 s; null em partida sem relógio. */
    prazo: number | null;
    /** Enquanto ela espera resposta, o relógio da vez está parado. Servidor antigo não manda. */
    parada?: boolean;
  } | null;
  /**
   * Quem está na vez abriu a janela de troca: até `prazo` para montar, com o relógio da vez
   * parado. Servidor antigo não manda — aí não há montagem nenhuma.
   */
  montagem?: { prazo: number } | null;
  /**
   * O relógio da vez. Os prazos são INSTANTES do relógio do servidor, comparáveis com o `agora`
   * da mesa — nunca com o relógio deste computador (ver `tempoRestante`).
   */
  relogio: {
    segundos: SegundosDaVez;
    /** Quando acaba a vez de `vez`; null durante o descarte do 7 e no fim. */
    prazo: number | null;
    /** Quando acaba o descarte do 7, para todos que devem; só na fase 'descartar'. */
    descarte: number | null;
    /** O que sobrava da vez, parado — enquanto os outros descartam no 7, ou durante a troca. */
    pausa: number | null;
    /** Quantas trocas desta vez já pararam o relógio. */
    trocas?: number;
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
  /** O tempo de cada vez, escolhido por quem abriu a mesa. */
  segundos: SegundosDaVez;
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
  | { tipo: 'rolar' | 'passar' | 'comprar' | 'cavaleiro' | 'estradas' | 'pararEstradas' | 'cancelarOferta' | 'montarTroca' | 'desistirDaTroca' }
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
  | { acao: 'jogar'; jogada: Jogada }
  | { acao: 'tempo'; segundos: SegundosDaVez };

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
    case 'tempo': {
      // O que vem depois (rolou, produziu, a aldeia…) entra no registro como jogada comum; aqui só
      // o que o relógio fez de diferente.
      const fez: Record<Exclude<Fase, 'fim'>, string> = {
        inicio: 'o jogo pôs a peça num lugar sorteado',
        rolar: 'o jogo rolou os dados',
        acoes: 'a vez passou',
        ladrao: 'o jogo moveu o ladrão',
        estradas: 'as estradas de graça pararam ali',
        descartar: 'o jogo devolveu as cartas',
      };
      return `${Q(e.j)} ficou sem tempo, e ${fez[e.fase] ?? 'a vez passou'}.`;
    }
    case 'ofertaVenceu': return `${e.j === eu ? 'Sua troca' : `A troca de ${nome(e.j)}`} fechou: ninguém quis.`;
    case 'montagemVenceu': return `${e.j === eu ? 'Seu tempo' : `O tempo de ${nome(e.j)}`} para montar a troca acabou.`;
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

// --- o relógio --------------------------------------------------------------------

/**
 * Quanto falta para `prazo`, em ms. O prazo é um instante do relógio do SERVIDOR; a mesa traz o
 * `agora` dele em cada resposta, e entre uma resposta e a seguinte a tela desconta o que passou
 * aqui (`passou`) — o mesmo do xadrez, senão a contagem andaria aos saltos, de busca em busca. O
 * relógio deste computador nunca é comparado com o do servidor: os dois podem estar minutos
 * desencontrados.
 */
export function tempoRestante(prazo: number | null | undefined, agoraDoServidor: number, passou: number): number | null {
  if (prazo === null || prazo === undefined) return null;
  return Math.max(0, prazo - agoraDoServidor - Math.max(0, passou));
}

/** Os segundos que a tela mostra: com 14,2 s faltando, "15" — e o 0 só quando acabou mesmo. */
export const segundosQueFaltam = (ms: number) => Math.ceil(Math.max(0, ms) / 1000);

/** Os últimos segundos da sua vez tiquetaqueiam: estes. */
export const TIQUE_A_PARTIR_DE = 5;

/**
 * Se a contagem acabou de virar um dos últimos segundos (5, 4, 3, 2, 1) — então tiquetaqueia.
 * A primeira leitura (`antes` null) não tique: abrir a tela com 3 s faltando não é o 3 chegando.
 */
export function deveTicar(antes: number | null, agora: number | null): boolean {
  if (antes === null || agora === null) return false;
  const s = segundosQueFaltam(agora);
  return s < segundosQueFaltam(antes) && s >= 1 && s <= TIQUE_A_PARTIR_DE;
}

/**
 * O prazo que corre contra VOCÊ agora: o do descarte, se o 7 te pediu cartas; senão o da vez, se
 * ela é sua. De quem só assiste, ou fora da vez, nenhum.
 */
export function meuPrazo(p: Partida): number | null {
  const eu = p.eu;
  if (eu === null || !p.relogio || p.fase === 'fim' || p.jogadores[eu]?.fora) return null;
  if (p.fase === 'descartar') return p.jogadores[eu].descartar > 0 ? p.relogio.descarte : null;
  // Montando a troca, o que corre contra você são os 20 s dela; a vez está parada.
  if (p.vez === eu && p.montagem) return p.montagem.prazo;
  return p.vez === eu ? p.relogio.prazo : null;
}

/** "0:23": o que sobrava da vez, parado durante o 7 ou a troca. Sem pausa, null. */
export function vezParada(p: Partida): string | null {
  const ms = p.relogio?.pausa;
  if (ms === null || ms === undefined) return null;
  const s = segundosQueFaltam(ms);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// --- a vez na tela ------------------------------------------------------------------

/** "Juninho", "Juninho e Gustavo", "Tava1, Juninho e Gustavo". */
const juntar = (nomes: string[]) => (nomes.length <= 1 ? nomes[0] ?? '' : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`);

export type FaixaDaVez = {
  /** De quem é a faixa: a cor, a foto e a barra são desta pessoa. */
  j: number;
  titulo: string;
  detalhe: string;
  /** É com você agora: a faixa acende. */
  minha: boolean;
  /** O prazo que a faixa conta (relógio do servidor); sem relógio, nenhum. */
  prazo: number | null;
  /** O tempo inteiro desse prazo, em ms: a barra esvazia a partir dele. */
  total: number;
};

/**
 * A faixa acima do tabuleiro (a opção A, 04/10/2026): de quem é a vez, o que falta fazer, e o
 * relógio que corre. No 7, o relógio que corre é o do descarte, e "com você" é dever cartas —
 * não a vez de quem rolou. Na partida acabada, faixa nenhuma.
 */
export function faixaDaVez(p: Partida, nome: (j: number) => string): FaixaDaVez | null {
  if (p.fase === 'fim') return null;
  const eu = p.eu;
  if (p.fase === 'descartar') {
    const devo = eu !== null ? p.jogadores[eu].descartar : 0;
    const devendo = p.jogadores.map((j, k) => (j.descartar > 0 && k !== eu ? nome(k) : null)).filter((x): x is string => !!x);
    return {
      j: p.vez,
      titulo: devo > 0 ? `Saiu 7: devolva ${devo} ${devo === 1 ? 'carta' : 'cartas'}` : 'Saiu 7',
      detalhe: devo > 0 ? 'Escolha as cartas que voltam ao banco' : `Esperando ${juntar(devendo)} devolver cartas`,
      minha: devo > 0,
      prazo: p.relogio?.descarte ?? null,
      total: (p.relogio?.segundos ?? 60) * 1000,
    };
  }
  const minha = eu !== null && p.vez === eu;
  // A troca para a vez (pedido do dono, 06/10/2026): a faixa conta o tempo dela, e diz quanto a
  // vez guardou para depois.
  const parada = vezParada(p);
  const guardada = parada ? `a vez está parada em ${parada}` : null;
  if (p.fase === 'acoes' && p.montagem) {
    return {
      j: p.vez,
      titulo: minha ? 'Monte a sua troca' : `${nome(p.vez)} está montando uma troca`,
      detalhe: guardada ? `Escolha as cartas · ${guardada}` : 'Escolha as cartas',
      minha,
      prazo: p.montagem.prazo,
      total: PRAZO_DA_MONTAGEM,
    };
  }
  const o = p.oferta;
  if (p.fase === 'acoes' && o?.aberta && o.parada && o.prazo !== null) {
    const devoResposta = eu !== null && !minha && !!p.pode.responder && !o.respostas[eu];
    return {
      j: p.vez,
      titulo: minha ? 'Esperando as respostas da troca' : devoResposta ? `${nome(p.vez)} quer trocar com você` : `Troca de ${nome(p.vez)}`,
      detalhe: guardada ? `Aceitar ou recusar · ${guardada}` : 'Aceitar ou recusar',
      minha: devoResposta,
      prazo: o.prazo,
      total: PRAZO_DA_TROCA,
    };
  }
  const n = p.estradasGratis;
  const detalhe: Record<Exclude<Fase, 'fim' | 'descartar'>, [string, string]> = {
    inicio: p.inicio?.falta === 'estrada' ? ['Ponha a estrada, saindo da aldeia', 'Pondo a estrada'] : ['Clique num cruzamento para pôr a aldeia', 'Pondo uma aldeia'],
    rolar: ['Role os dados para começar', 'Vai rolar os dados'],
    acoes: ['Troque, construa ou passe a vez', 'Construindo e trocando'],
    ladrao: ['Mova o ladrão', 'Movendo o ladrão'],
    estradas: [`Ponha ${n} ${n === 1 ? 'estrada' : 'estradas'} de graça`, 'Pondo estradas de graça'],
  };
  return {
    j: p.vez,
    titulo: minha ? 'Sua vez' : `Vez de ${nome(p.vez)}`,
    detalhe: detalhe[p.fase][minha ? 0 : 1],
    minha,
    prazo: p.relogio?.prazo ?? null,
    total: (p.relogio?.segundos ?? 60) * 1000,
  };
}

/**
 * O aviso no meio do tabuleiro: de quem é a vez que ACABOU de começar. A vez que muda de mão, e
 * também o fim da colocação — quem pôs a última aldeia é quem rola primeiro, e sem isto a
 * partida começaria sem aviso. Na primeira leitura, nenhum: abrir a tela não é a vez começar.
 */
export function vezQueComecou(antes: Partida | null, agora: Partida): number | null {
  if (!antes || agora.fase === 'fim') return null;
  const comecou = antes.fase === 'inicio' && agora.fase !== 'inicio';
  return agora.vez !== antes.vez || comecou ? agora.vez : null;
}

/**
 * As cartas que chegaram à sua mão entre duas leituras — o "+1 lã" das cartas grandes. Só o que
 * subiu: na troca, o que saiu não aparece, e o que entrou sim. Na primeira leitura, nada.
 */
export function cartasQueChegaram(antes: Monte | null | undefined, agora: Monte | null | undefined): Partial<Monte> {
  if (!antes || !agora) return {};
  const chegou: Partial<Monte> = {};
  for (const r of RECURSOS) if (agora[r] > antes[r]) chegou[r] = agora[r] - antes[r];
  return chegou;
}

// --- os sons ------------------------------------------------------------------------

export type SomDoCatan = 'suaVez' | 'vezDeOutro' | 'tique' | 'troca' | 'estrada' | 'aldeia' | 'cidade' | 'carta' | 'ganhou' | 'ladrao';

/**
 * Os eventos que chegaram desde a leitura anterior. O registro não tem número de evento, e o do
 * servidor guarda só os últimos 200 — então o que é novo se acha pelo ENCAIXE: os três últimos
 * de antes, na mesma ordem, dentro do de agora; o que vem depois deles é novo. Três, e não um,
 * porque dois eventos iguais seguidos existem (duas estradas da carta de estradas). Sem encaixe
 * nenhum, nada é novo: uma salva de sons de um registro que não se reconhece é pior que silêncio.
 */
export function eventosNovos(antes: Evento[], agora: Evento[]): Evento[] {
  if (antes.length === 0) return agora;
  const k = Math.min(3, antes.length);
  const cauda = antes.slice(-k).map((e) => JSON.stringify(e));
  for (let i = agora.length - 1; i >= k - 1; i--) {
    let encaixa = true;
    for (let d = 0; d < k && encaixa; d++) encaixa = JSON.stringify(agora[i - d]) === cauda[k - 1 - d];
    if (encaixa) return agora.slice(i + 1);
  }
  return [];
}

/** Na ordem em que tocam, quando várias coisas chegam na mesma leitura. */
const ORDEM_DOS_SONS: SomDoCatan[] = ['suaVez', 'troca', 'ganhou', 'ladrao', 'cidade', 'aldeia', 'estrada', 'carta', 'vezDeOutro'];

/**
 * O que tocar entre duas leituras da partida, na tela dela. A vez que muda (a sua, mais alto; a
 * dos outros, um toque baixo), o 7 que te pede cartas, a oferta de troca que chega para você, as
 * construções e as cartas compradas de QUALQUER um — dá para ouvir alguém construindo olhando o
 * chat — e as cartas que renderam para você. Na primeira leitura, nada: abrir a tela não é
 * acontecer. Cada som uma vez só, por mais que a leitura traga três estradas.
 */
export function oQueTocarNaPartida(antes: Partida | null, agora: Partida): SomDoCatan[] {
  if (!antes) return [];
  const sons = new Set<SomDoCatan>();
  const eu = agora.eu;
  const jogo = eu !== null && !agora.jogadores[eu]?.fora;
  if (agora.fase !== 'fim') {
    if (agora.vez !== antes.vez) sons.add(jogo && agora.vez === eu ? 'suaVez' : 'vezDeOutro');
    if (jogo && agora.jogadores[eu].descartar > 0 && !(antes.jogadores[eu]?.descartar > 0)) sons.add('suaVez');
    const o = agora.oferta;
    if (jogo && o?.aberta && agora.vez !== eu) {
      const a = antes.oferta;
      const mesma = !!a?.aberta && (o.prazo !== null
        ? a.prazo === o.prazo
        : JSON.stringify([a.da, a.quer]) === JSON.stringify([o.da, o.quer]));
      if (!mesma) sons.add('troca');
    }
  }
  // O ladrão que mudou de terreno corre até lá, com os passos (a corrida é de todos, como as peças).
  if (agora.ladrao !== antes.ladrao) sons.add('ladrao');
  for (const e of eventosNovos(antes.historico, agora.historico)) {
    if (e.t === 'estrada' || e.t === 'aldeia' || e.t === 'cidade') sons.add(e.t);
    else if (e.t === 'comprou') sons.add('carta');
    else if (jogo && e.t === 'produziu' && somaDoMonte(e.ganhos[String(eu)]) > 0) sons.add('ganhou');
    else if (jogo && e.t === 'recebeu' && e.j === eu && somaDoMonte(e.recursos) > 0) sons.add('ganhou');
  }
  return ORDEM_DOS_SONS.filter((s) => sons.has(s));
}

// --- o que chegou ao tabuleiro (06/10/2026) ---------------------------------------------------

/** Uma peça que acabou de ser posta: a aldeia, a cidade (que é a aldeia trocada) ou a estrada. */
export type Chegada =
  | { chave: string; tipo: 'aldeia' | 'cidade'; j: number; v: string }
  | { chave: string; tipo: 'estrada'; j: number; a: string };

/** A chave de uma peça no tabuleiro: a aldeia que vira cidade é OUTRA peça, e cai de novo. */
export const chaveDaConstrucao = (c: { v: string; tipo: 'aldeia' | 'cidade' }) => `c:${c.v}:${c.tipo}`;
export const chaveDaEstrada = (e: { a: string }) => `e:${e.a}`;

/**
 * O que foi posto no tabuleiro entre duas leituras — o que a tela faz cair do alto, com a poeira,
 * para todo mundo ver ONDE foi (pedido do dono, 06/10/2026). Na primeira leitura, nada: abrir a
 * tela não é construir.
 */
export function pecasQueChegaram(antes: Pick<Partida, 'construcoes' | 'estradas'> | null, agora: Pick<Partida, 'construcoes' | 'estradas'>): Chegada[] {
  if (!antes) return [];
  const tinha = new Set([...antes.construcoes.map(chaveDaConstrucao), ...antes.estradas.map(chaveDaEstrada)]);
  const chegou: Chegada[] = [];
  for (const e of agora.estradas) if (!tinha.has(chaveDaEstrada(e))) chegou.push({ chave: chaveDaEstrada(e), tipo: 'estrada', j: e.j, a: e.a });
  for (const c of agora.construcoes) if (!tinha.has(chaveDaConstrucao(c))) chegou.push({ chave: chaveDaConstrucao(c), tipo: c.tipo, j: c.j, v: c.v });
  return chegou;
}

// --- a mesa em volta (06/10/2026) -------------------------------------------------------------

/** Onde cada um senta na mesa, visto da sua cadeira. */
export type Lugar = 'baixo' | 'esquerda' | 'cima' | 'direita';

/**
 * A cadeira de cada jogador na mesa em volta, como no UNO: você embaixo e os outros na ordem da
 * vez, girando para a sua esquerda — quem joga depois de você senta à esquerda. Com quatro,
 * esquerda, cima e direita; com três, esquerda e direita (o lugar de cima fica vazio e o tabuleiro
 * cresce para ele); com dois, o outro em frente. Quem só assiste vê o jogador 0 embaixo.
 */
export function lugaresEmVolta(n: number, eu: number | null): Lugar[] {
  const ordem: Lugar[] = n >= 4 ? ['baixo', 'esquerda', 'cima', 'direita'] : n === 3 ? ['baixo', 'esquerda', 'direita'] : ['baixo', 'cima'];
  const minha = eu ?? 0;
  return Array.from({ length: n }, (_, j) => ordem[(j - minha + n) % n] ?? 'cima');
}

export type Construcao = 'estrada' | 'aldeia' | 'cidade' | 'desenvolvimento';

/**
 * O que a cola de custos acende. Na SUA vez, nas ações, exatamente o que os botões deixam fazer
 * (`pode`): a cola acesa com o botão apagado — cartas na mão, mas nenhum lugar onde a cidade caiba
 * — parecia defeito. Fora dela, o que as suas cartas já pagam, com peça (ou carta no baralho)
 * sobrando, para você saber o que fará quando a vez chegar. Para quem só assiste, nada (null): a
 * cola fica inteira, sem acender nem apagar.
 */
export function oQueDaParaConstruir(p: Pick<Partida, 'eu' | 'mao' | 'jogadores' | 'baralho'> & Partial<Pick<Partida, 'vez' | 'fase' | 'pode'>>): Record<Construcao, boolean> | null {
  const eu = p.eu;
  if (eu === null || !p.mao || !p.jogadores[eu] || p.jogadores[eu].fora) return null;
  if (p.vez === eu && p.fase === 'acoes' && p.pode) {
    return {
      estrada: !!p.pode.estradas?.length, aldeia: !!p.pode.aldeias?.length,
      cidade: !!p.pode.cidades?.length, desenvolvimento: !!p.pode.comprar,
    };
  }
  const pecas = p.jogadores[eu].pecas;
  return {
    estrada: pecas.estrada > 0 && temTudo(p.mao, CUSTOS.estrada),
    aldeia: pecas.aldeia > 0 && temTudo(p.mao, CUSTOS.aldeia),
    cidade: pecas.cidade > 0 && temTudo(p.mao, CUSTOS.cidade),
    desenvolvimento: p.baralho > 0 && temTudo(p.mao, CUSTOS.desenvolvimento),
  };
}

/** Os pontos que cada coisa da cola vale, como na carta do jogo de tabuleiro. */
export const PONTOS_DA_CONSTRUCAO: Record<Construcao, string> = { estrada: '0', aldeia: '1', cidade: '2', desenvolvimento: '?' };

/** Uma linha do placar: a posição, os pontos e de onde eles vêm. */
export type LinhaDoPlacar = {
  j: number; posicao: number; pontos: number;
  aldeias: number; cidades: number; maiorEstrada: boolean; maiorExercito: boolean;
  /** As cartas de ponto que QUEM PERGUNTA pode ver: as suas, ou as de todo mundo no fim. */
  cartasDePonto: number;
};

/**
 * O placar da mesa (pedido do dono, 07/10/2026: "o ranking separado, com a pontuação de cada um"):
 * do mais pontos ao menos, empatados na mesma posição e na ordem da vez, e cada pontuação aberta
 * no que a compõe. Os pontos são os da `vista`: os dos outros sem as cartas de ponto escondidas,
 * os seus com elas — o mesmo número do disco de cada lugar.
 */
export function placar(p: Pick<Partida, 'jogadores' | 'construcoes' | 'maiorEstrada' | 'maiorExercito' | 'eu' | 'cartas'>): LinhaDoPlacar[] {
  const linhas = p.jogadores.map((jogador, j) => {
    const minhas = j === p.eu ? (p.cartas ?? []).map((c) => c.tipo) : (jogador.cartasDeDesenvolvimento ?? []);
    return {
      j, posicao: 0, pontos: jogador.pontos,
      aldeias: p.construcoes.filter((c) => c.j === j && c.tipo === 'aldeia').length,
      cidades: p.construcoes.filter((c) => c.j === j && c.tipo === 'cidade').length,
      maiorEstrada: p.maiorEstrada?.j === j, maiorExercito: p.maiorExercito?.j === j,
      cartasDePonto: minhas.filter((c) => c === 'ponto').length,
    };
  });
  const ordem = [...linhas].sort((a, b) => b.pontos - a.pontos || a.j - b.j);
  ordem.forEach((l, i) => { l.posicao = i > 0 && ordem[i - 1].pontos === l.pontos ? ordem[i - 1].posicao : i + 1; });
  return ordem;
}

/** De onde vêm os pontos, em português: "2 aldeias, 1 cidade e a maior estrada". */
export function textoDosPontos(l: LinhaDoPlacar): string {
  const partes = [
    l.aldeias ? `${l.aldeias} ${l.aldeias === 1 ? 'aldeia' : 'aldeias'}` : '',
    l.cidades ? `${l.cidades} ${l.cidades === 1 ? 'cidade' : 'cidades'}` : '',
    l.maiorEstrada ? 'a maior estrada' : '',
    l.maiorExercito ? 'o maior exército' : '',
    l.cartasDePonto ? `${l.cartasDePonto} ${l.cartasDePonto === 1 ? 'carta de ponto' : 'cartas de ponto'}` : '',
  ].filter(Boolean);
  if (!partes.length) return 'Nenhum ponto ainda';
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}
