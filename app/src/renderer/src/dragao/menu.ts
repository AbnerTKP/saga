/**
 * A navegação das telas do Dragão Quadrado, sem tela: que tecla é que comando, para onde o cursor
 * anda, o que o título e o fim oferecem, e o que a escolha de lutador mostra a partir da arena. O
 * desenho mora em `interface.ts`; quem junta os dois com o servidor é a `TelaDaLuta`.
 */
import type { DadosDaEscolha, PainelDaEscolha } from './interface.ts';
import { IDS_DOS_CENARIOS, IDS_DOS_LUTADORES, type IdDoCenario, type IdDoLutador } from './tipos.ts';

export type Comando = 'cima' | 'baixo' | 'esquerda' | 'direita' | 'confirmar' | 'voltar' | 'convidar' | 'opcoes' | 'testar';

/**
 * As teclas dos menus, pelo `code` como as da luta. Na luta só o Esc vale — J e K lá são soco e
 * chute, e o O é o especial: por isso quem chama decide se está num menu ou na luta.
 */
const TECLAS: Record<string, Comando> = {
  ArrowUp: 'cima', KeyW: 'cima', ArrowDown: 'baixo', KeyS: 'baixo',
  ArrowLeft: 'esquerda', KeyA: 'esquerda', ArrowRight: 'direita', KeyD: 'direita',
  Enter: 'confirmar', NumpadEnter: 'confirmar', Space: 'confirmar', KeyJ: 'confirmar',
  Escape: 'voltar', Backspace: 'voltar', KeyK: 'voltar',
  KeyC: 'convidar', KeyO: 'opcoes', KeyT: 'testar',
};
export const comandoDaTecla = (code: string): Comando | null => TECLAS[code] ?? null;

const COLUNAS = 3;

/** O cursor na grade 3x3: anda nas quatro direções e dá a volta nas bordas. */
export function andarNaGrade(id: IdDoLutador, c: Comando): IdDoLutador {
  const n = IDS_DOS_LUTADORES.length, linhas = Math.ceil(n / COLUNAS);
  const i = Math.max(0, IDS_DOS_LUTADORES.indexOf(id));
  let x = i % COLUNAS, y = Math.floor(i / COLUNAS);
  if (c === 'esquerda') x = (x + COLUNAS - 1) % COLUNAS;
  else if (c === 'direita') x = (x + 1) % COLUNAS;
  else if (c === 'cima') y = (y + linhas - 1) % linhas;
  else if (c === 'baixo') y = (y + 1) % linhas;
  else return id;
  return IDS_DOS_LUTADORES[Math.min(n - 1, y * COLUNAS + x)];
}

/** Anda numa lista pulando o que não se escolhe (os grupos do convite). Sem nada que se possa, fica. */
export function andarNaLista(i: number, delta: 1 | -1, total: number, pode: (i: number) => boolean = () => true): number {
  for (let k = 1; k <= total; k++) {
    const j = (((i + delta * k) % total) + total) % total;
    if (pode(j)) return j;
  }
  return i;
}

export const cenarioAoLado = (c: IdDoCenario, passo: 1 | -1): IdDoCenario =>
  IDS_DOS_CENARIOS[(IDS_DOS_CENARIOS.indexOf(c) + passo + IDS_DOS_CENARIOS.length) % IDS_DOS_CENARIOS.length];

/** O volume anda de 10 em 10%, e nunca sai de 0 a 100. */
export const volumeAoLado = (v: number, passo: 1 | -1) => Math.round(Math.max(0, Math.min(1, v + passo * 0.1)) * 10) / 10;

// ———— o título ————

export type ResumoDeArena = { id: number; estado: 'arena' | 'lutando' | 'fim'; anfitriao: number; lutadores: (number | null)[] };
export type ItemDoTitulo = { rotulo: string; acao: 'lutar' | 'arena' | 'opcoes' | 'sair'; arena?: number };

/**
 * O menu do título. A sua arena, se houver, é voltar a ela; senão LUTAR abre uma. A arena de outra
 * pessoa aparece logo abaixo — entrar, se há lugar; assistir, se está lutando ou cheia.
 */
export function itensDoTitulo(arenas: ResumoDeArena[], euId: number, nomeDe: (id: number) => string): ItemDoTitulo[] {
  const minha = arenas.find((a) => a.anfitriao === euId || a.lutadores.includes(euId));
  const itens: ItemDoTitulo[] = [minha
    ? { rotulo: minha.estado === 'lutando' ? 'VOLTAR À SUA LUTA' : 'VOLTAR À SUA ARENA', acao: 'arena', arena: minha.id }
    : { rotulo: 'LUTAR', acao: 'lutar' }];
  const outra = arenas.find((a) => a !== minha && a.estado !== 'fim') ?? arenas.find((a) => a !== minha);
  if (outra) {
    const livre = outra.estado === 'arena' && outra.lutadores.some((l) => l === null);
    const verbo = livre ? 'ENTRAR NA ARENA DE' : 'ASSISTIR A LUTA DE';
    itens.push({ rotulo: `${verbo} ${nomeDe(outra.anfitriao)}`, acao: 'arena', arena: outra.id });
  }
  itens.push({ rotulo: 'OPÇÕES', acao: 'opcoes' }, { rotulo: 'SAIR', acao: 'sair' });
  return itens;
}

// ———— o fim ————

export type ItemDoFim = { rotulo: string; acao: 'revanche' | 'trocar' | 'sair' };

export const itensDoFim = (souLutador: boolean): ItemDoFim[] => (souLutador
  ? [{ rotulo: 'REVANCHE', acao: 'revanche' }, { rotulo: 'TROCAR LUTADOR', acao: 'trocar' }, { rotulo: 'SAIR DA ARENA', acao: 'sair' }]
  : [{ rotulo: 'SAIR', acao: 'sair' }]);

// ———— a escolha ————

export type LadoDaArenaNaTela = { pessoa: { id: number; nome: string }; lutador: IdDoLutador } | null;
export type ArenaNaTela = {
  lados: [LadoDaArenaNaTela, LadoDaArenaNaTela];
  meuLado: 0 | 1 | null;
  souAnfitriao: boolean;
  anfitriao: string;
  cenario: IdDoCenario;
  rounds: 1 | 2;
};

/** O lado que o cursor daqui controla: o seu, ou o primeiro lugar livre, se dá para sentar. */
export function ladoDoCursor(a: ArenaNaTela): 0 | 1 | null {
  if (a.meuLado !== null) return a.meuLado;
  if (!a.lados[0]) return 0;
  if (!a.lados[1]) return 1;
  return null;
}

/** O que ENTER faz na grade: escolher (sentar ou trocar), começar a luta, ou nada. */
export function aoConfirmarNaGrade(a: ArenaNaTela, cursor: IdDoLutador): 'escolher' | 'comecar' | null {
  const lado = ladoDoCursor(a);
  if (lado === null) return null;
  const sentado = a.meuLado !== null ? a.lados[a.meuLado] : null;
  if (!sentado || sentado.lutador !== cursor) return 'escolher';
  return a.souAnfitriao && a.lados[0] && a.lados[1] ? 'comecar' : null;
}

/** A escolha de lutador desenhada a partir da arena, do cursor daqui e do piscar do botão. */
export function montarEscolha(a: ArenaNaTela, cursor: IdDoLutador, meuNome: string, piscar: boolean): Omit<DadosDaEscolha, 'aviso'> {
  const lado = ladoDoCursor(a);
  const cheia = !!(a.lados[0] && a.lados[1]);
  const painel = (i: 0 | 1): PainelDaEscolha => {
    const l = a.lados[i];
    if (i === lado) {
      if (l) return { jogador: l.pessoa.nome, lutador: cursor, rotulo: cursor === l.lutador ? 'PRONTO!' : 'ENTER TROCA', destaque: true };
      return { jogador: meuNome, lutador: cursor, rotulo: 'ENTER SENTA AQUI', destaque: true };
    }
    if (l) return { jogador: l.pessoa.nome, lutador: l.lutador, rotulo: 'PRONTO!', destaque: false };
    return { jogador: null, lutador: null, rotulo: 'LUGAR LIVRE', destaque: false };
  };
  const cursores: [IdDoLutador | null, IdDoLutador | null] = [
    lado === 0 ? cursor : a.lados[0]?.lutador ?? null,
    lado === 1 ? cursor : a.lados[1]?.lutador ?? null,
  ];
  let botao: DadosDaEscolha['botao'] = null;
  let recado: string | null = null;
  let legenda: string;
  if (a.souAnfitriao) {
    botao = cheia ? { rotulo: 'ENTER  LUTAR!', ativo: true, aceso: piscar } : { rotulo: 'C  CONVIDAR', ativo: true, aceso: false };
    legenda = cheia ? 'SETAS ESCOLHER   ENTER LUTAR   O OPÇÕES   ESC SAIR' : 'SETAS ESCOLHER   ENTER CONFIRMA   C CONVIDAR   O OPÇÕES   ESC SAIR';
  } else if (a.meuLado !== null) {
    recado = cheia ? `ESPERANDO ${a.anfitriao} COMEÇAR` : 'ESPERANDO O OUTRO LADO';
    legenda = 'SETAS ESCOLHER   ENTER CONFIRMA   O OPÇÕES   ESC SAIR';
  } else if (lado !== null) {
    recado = 'ESCOLHA E APERTE ENTER';
    legenda = 'SETAS ESCOLHER   ENTER SENTAR   O OPÇÕES   ESC SAIR';
  } else {
    recado = 'ASSISTINDO';
    legenda = 'O OPÇÕES   ESC SAIR';
  }
  return { paineis: [painel(0), painel(1)], cursores, cenario: a.cenario, rounds: a.rounds, botao, recado, legenda };
}

// ———— o convite ————

export type PessoaChamavel = { id: number; nome: string; foto: string | null; situacao: 'livre' | 'chamado' | 'recusou' | 'naArena' };
export type LinhaChamavel = { tipo: 'grupo'; rotulo: string } | ({ tipo: 'pessoa' } & PessoaChamavel);

/**
 * As linhas do convite: quem está na call primeiro, depois quem está online, cada um com a situação
 * na arena. A lista de quem se pode chamar é a de `quemChamar` (jogos.ts): as linhas só a agrupam.
 */
export function linhasDoConvite(
  grupos: { naCall: { id: number; nome: string; foto: string | null }[]; online: { id: number; nome: string; foto: string | null }[] },
  arena: { lados: [LadoDaArenaNaTela, LadoDaArenaNaTela]; chamados: number[]; recusaram: number[] },
): LinhaChamavel[] {
  const naArena = new Set(arena.lados.flatMap((l) => (l ? [l.pessoa.id] : [])));
  const situacao = (id: number): PessoaChamavel['situacao'] =>
    naArena.has(id) ? 'naArena' : arena.chamados.includes(id) ? 'chamado' : arena.recusaram.includes(id) ? 'recusou' : 'livre';
  const linhas: LinhaChamavel[] = [];
  for (const [rotulo, lista] of [['NA CALL', grupos.naCall], ['ONLINE', grupos.online]] as const) {
    if (lista.length === 0) continue;
    linhas.push({ tipo: 'grupo', rotulo });
    for (const p of lista) linhas.push({ tipo: 'pessoa', ...p, situacao: situacao(p.id) });
  }
  return linhas;
}

export const ehPessoa = (l: LinhaChamavel | undefined): l is { tipo: 'pessoa' } & PessoaChamavel => l?.tipo === 'pessoa';

/** O que ENTER faz numa pessoa do convite. */
export const aoConfirmarPessoa = (p: PessoaChamavel): 'chamar' | 'cancelarConvite' | null =>
  p.situacao === 'livre' || p.situacao === 'recusou' ? 'chamar' : p.situacao === 'chamado' ? 'cancelarConvite' : null;
