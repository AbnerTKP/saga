/**
 * A simulação da luta: um quadro de cada vez, a partir dos botões dos dois lados.
 *
 * Ela roda IGUAL nos dois computadores e é refeita quando o botão do outro chega atrasado (ver
 * `rede.ts`), então três regras valem para tudo aqui dentro:
 * - só número inteiro no estado (posição em 1/64 de pixel), nada de `Math.random`, relógio ou
 *   conta com vírgula acumulada — é o que garante o mesmo resultado nas duas máquinas;
 * - o estado é um objeto simples que `clonar` copia campo a campo, porque a rede guarda uma
 *   cópia por quadro;
 * - o que o desenho e o som precisam saber de um golpe (a faísca, o tremor) fica ESCRITO no
 *   estado (`impacto*`), e não disparado como evento: refazer um quadro não pode soltar a faísca
 *   duas vezes.
 */
import {
  BOTAO, SUB, type Acao, type ConfigDaLuta, type Entrada, type EstadoDaLuta, type Fase, type Lutador, type Projetil,
} from './tipos.ts';
import {
  CUSTO_DO_SUMIR, DANO_NA_DEFESA, ESCALA_DO_COMBO, FICHAS, GRAVIDADE, JANELA_DO_DUPLO_TOQUE, KI_CARREGANDO, KI_INICIAL,
  KI_MAXIMO, KI_POR_ACERTO, KI_POR_APANHAR, PARADA, TEMPO_DO_ROUND, TRANSFORMACAO, ESCALA_DE_VELOCIDADE, ehGolpeDeCorpo, type Altura, type Ficha, type Golpe,
  type Poder,
} from './fichas.ts';
import { ESCALA, MUNDO, TELA } from './medidas.ts';

const px = (v: number) => Math.round(v * SUB);
/** Medida solta de espaço (na medida do desenho) e de velocidade, já na escala dos lutadores. */
const esp = (v: number) => px(v * ESCALA);
const vel = (v: number) => px(v * ESCALA_DE_VELOCIDADE);
/** Transformado anda mais rápido. */
const rapidez = (l: Lutador) => (l.forma === 1 ? TRANSFORMACAO.velocidade : 1);

const GRAV = px(GRAVIDADE);
const PAREDE_ESQUERDA = px(16);
const PAREDE_DIREITA = px(MUNDO - 16);
/** Os dois nunca a mais que isto um do outro: a câmera tem de caber os dois. */
const DISTANCIA_MAXIMA = px(TELA.largura - 40);
export const DURACAO = { apresentacao: 110, nocaute: 100, tempo: 60, fimDoRound: 120 };
const QUADROS = { caido: 40, levantando: 24, pouso: 4, sumir: 14, investida: 14, recuo: 16 };
/** Depois de tantos rounds empatados, a luta acaba empatada: senão dois teimosos não terminam nunca. */
const ROUNDS_NO_MAXIMO = 5;

/** Ordem fixa das ações: o número entra na impressão digital do estado. */
const ACOES: Acao[] = [
  'entrada', 'parado', 'andando', 'recuando', 'investida', 'recuo', 'agachado', 'pulando', 'pouso', 'defendendo',
  'defendendoBaixo', 'soco1', 'soco2', 'soco3', 'chute1', 'chute2', 'socoBaixo', 'rasteira', 'socoAereo', 'chuteAereo',
  'rajada', 'especial', 'super', 'carregando', 'sumindo', 'apanhando', 'apanhandoBaixo', 'voando', 'caido', 'levantando',
  'vitoria', 'derrota', 'transformando',
];
const FASES: Fase[] = ['apresentacao', 'luta', 'nocaute', 'tempo', 'fimDoRound', 'fimDaLuta'];
const NUMERO_DA_ACAO = new Map(ACOES.map((a, i) => [a, i]));

/** Onde cada um começa o round. */
const INICIO_X = [px(MUNDO / 2 - 80), px(MUNDO / 2 + 80)];

function novoLutador(id: Lutador['id'], cor: 0 | 1, lado: 0 | 1): Lutador {
  const ficha = FICHAS[id];
  return {
    id, cor, forma: 0, formaDesde: -1, x: INICIO_X[lado], y: 0, vx: 0, vy: 0, lado: lado === 0 ? 1 : -1,
    acao: 'entrada', quadro: 0, vida: ficha.vida, vidaAtrasada: ficha.vida, ki: KI_INICIAL,
    atordoado: 0, invencivel: 0, acertou: false, encadear: null, combo: 0, vitorias: 0,
    anterior: 0, toqueFrente: 99, toqueTras: 99,
    impactoEm: -1, impactoX: 0, impactoY: 0, impactoTipo: 0,
  };
}

export function criarLuta(config: ConfigDaLuta): EstadoDaLuta {
  const [a, b] = config.lutadores;
  return {
    config,
    quadro: 0,
    fase: 'apresentacao',
    faseQuadro: 0,
    round: 1,
    tempo: TEMPO_DO_ROUND * 60,
    lutadores: [novoLutador(a, 0, 0), novoLutador(b, a === b ? 1 : 0, 1)],
    projeteis: [],
    proximoProjetil: 1,
    congelado: 0,
    clarao: 0,
    claraoDe: -1,
    vencedorDoRound: -1,
    vencedor: -1,
    sorteio: (config.semente >>> 0) || 1,
  };
}

export function clonar(e: EstadoDaLuta): EstadoDaLuta {
  return {
    ...e,
    lutadores: [{ ...e.lutadores[0] }, { ...e.lutadores[1] }],
    projeteis: e.projeteis.map((p) => ({ ...p })),
  };
}

/** Impressão digital de 32 bits de tudo o que decide a luta: dois computadores com a mesma impressão estão vendo a mesma luta. */
export function impressao(e: EstadoDaLuta): number {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    h ^= n | 0;
    h = Math.imul(h, 0x01000193);
    h ^= (n / 4294967296) | 0;
    h = Math.imul(h, 0x01000193);
  };
  mix(e.quadro); mix(FASES.indexOf(e.fase)); mix(e.faseQuadro); mix(e.round); mix(e.tempo);
  mix(e.congelado); mix(e.clarao); mix(e.claraoDe); mix(e.vencedorDoRound); mix(e.vencedor); mix(e.sorteio);
  for (const l of e.lutadores) {
    mix(l.x); mix(l.y); mix(l.vx); mix(l.vy); mix(l.lado); mix(NUMERO_DA_ACAO.get(l.acao) ?? -1); mix(l.quadro);
    mix(l.vida); mix(l.vidaAtrasada); mix(l.ki); mix(l.atordoado); mix(l.invencivel); mix(l.acertou ? 1 : 0);
    mix(l.encadear ? NUMERO_DA_ACAO.get(l.encadear) ?? -1 : -1); mix(l.combo); mix(l.vitorias); mix(l.anterior);
    mix(l.toqueFrente); mix(l.toqueTras); mix(l.impactoEm); mix(l.impactoTipo); mix(l.forma); mix(l.formaDesde);
  }
  mix(e.projeteis.length);
  for (const p of e.projeteis) {
    mix(p.id); mix(p.dono); mix(p.x); mix(p.y); mix(p.vx); mix(p.ponta); mix(p.resta); mix(p.quadro); mix(p.batidas); mix(p.proximaBatida);
  }
  return h >>> 0;
}

/** A câmera: o meio dos dois, presa ao mundo. Em pixels inteiros. */
export function camera(e: EstadoDaLuta): number {
  const meio = (e.lutadores[0].x + e.lutadores[1].x) / 2 / SUB;
  return Math.max(0, Math.min(MUNDO - TELA.largura, Math.round(meio - TELA.largura / 2)));
}

// ---- perguntas sobre um lutador ---------------------------------------------------------------

const NO_AR = new Set<Acao>(['pulando', 'socoAereo', 'chuteAereo', 'voando']);
const LIVRE = new Set<Acao>(['parado', 'andando', 'recuando', 'agachado']);
const ATORDOADO = new Set<Acao>(['apanhando', 'apanhandoBaixo', 'defendendo', 'defendendoBaixo']);
const PODE_DEFENDER = new Set<Acao>(['parado', 'recuando', 'agachado', 'defendendo', 'defendendoBaixo', 'pouso']);
const RAIOS = new Set<Projetil['tipo']>(['onda', 'espiral', 'laser']);

export const estaNoAr = (l: Lutador) => l.y > 0 || NO_AR.has(l.acao);
const agachado = (l: Lutador) => l.acao === 'agachado' || l.acao === 'defendendoBaixo' || l.acao === 'apanhandoBaixo'
  || l.acao === 'socoBaixo' || l.acao === 'rasteira';

function poderDa(ficha: Ficha, acao: Acao): Poder | null {
  if (acao === 'rajada') return ficha.rajada;
  if (acao === 'especial') return ficha.especial;
  if (acao === 'super') return ficha.super;
  return null;
}

/** Quanto tempo quem solta um poder fica na pose: o raio inteiro, ou um instante para a bola. */
const segurando = (p: Poder) => (RAIOS.has(p.tipo) ? p.duracao : 12);

/** Em que parte do golpe (ou do poder) o lutador está. */
export function faseDoGolpe(l: Lutador): 'inicio' | 'ativo' | 'volta' | null {
  const ficha = FICHAS[l.id];
  if (ehGolpeDeCorpo(l.acao)) {
    const g = ficha.golpes[l.acao];
    return l.quadro < g.inicio ? 'inicio' : l.quadro < g.inicio + g.ativo ? 'ativo' : 'volta';
  }
  const p = poderDa(ficha, l.acao);
  if (!p) return null;
  return l.quadro < p.inicio ? 'inicio' : l.quadro < p.inicio + segurando(p) ? 'ativo' : 'volta';
}

/** O corpo que apanha, em pixels do mundo: [x0, y0, x1, y1] com y para cima. */
export function caixaDoCorpo(l: Lutador): [number, number, number, number] {
  const c = FICHAS[l.id].corpo;
  const x = l.x / SUB, y = l.y / SUB;
  const altura = agachado(l) ? c.alturaAgachado : l.acao === 'caido' ? Math.round(14 * ESCALA) : estaNoAr(l) ? Math.round(c.altura * 0.8) : c.altura;
  return [x - c.meiaLargura, y, x + c.meiaLargura, y + altura];
}

/** A caixa do golpe de corpo que está ATIVO agora, em pixels do mundo; null fora do ativo. */
export function caixaDoGolpe(l: Lutador): [number, number, number, number] | null {
  if (!ehGolpeDeCorpo(l.acao) || faseDoGolpe(l) !== 'ativo') return null;
  const [a, b, c, d] = FICHAS[l.id].golpes[l.acao].caixa;
  const x = l.x / SUB, y = l.y / SUB;
  return l.lado === 1 ? [x + a, y + b, x + c, y + d] : [x - c, y + b, x - a, y + d];
}

const cruza = (p: number[], q: number[]) => p[0] < q[2] && q[0] < p[2] && p[1] < q[3] && q[1] < p[3];

// ---- o quadro --------------------------------------------------------------------------------

export function avancar(e: EstadoDaLuta, entradas: readonly [Entrada, Entrada]) {
  e.quadro++;
  if (e.congelado > 0) { e.congelado--; return; }
  if (e.clarao > 0) { e.clarao--; if (e.clarao === 0) e.claraoDe = -1; return; }
  e.faseQuadro++;

  switch (e.fase) {
    case 'apresentacao':
      for (const l of e.lutadores) { l.acao = 'entrada'; l.quadro++; }
      if (e.faseQuadro >= DURACAO.apresentacao) {
        mudarFase(e, 'luta');
        for (const l of e.lutadores) mudar(l, 'parado');
      }
      return;
    case 'luta':
      passo(e, entradas);
      if (e.congelado === 0 && e.clarao === 0) e.tempo = Math.max(0, e.tempo - 1);
      if (e.lutadores.some((l) => l.vida <= 0)) {
        mudarFase(e, 'nocaute');
        for (const l of e.lutadores) if (l.vida <= 0 && l.acao !== 'voando' && l.acao !== 'caido') derrubar(l, 1);
      } else if (e.tempo === 0) {
        mudarFase(e, 'tempo');
      }
      return;
    case 'nocaute':
      passo(e, [0, 0]);
      if (e.faseQuadro >= DURACAO.nocaute) {
        const [a, b] = e.lutadores;
        terminarRound(e, a.vida <= 0 && b.vida <= 0 ? 2 : a.vida <= 0 ? 1 : 0);
      }
      return;
    case 'tempo':
      passo(e, [0, 0]);
      if (e.faseQuadro >= DURACAO.tempo) {
        const [a, b] = e.lutadores;
        // Em proporção da vida máxima: o Picolé tem mais vida que a Geladeira.
        const pa = a.vida * FICHAS[b.id].vida, pb = b.vida * FICHAS[a.id].vida;
        terminarRound(e, pa === pb ? 2 : pa > pb ? 0 : 1);
      }
      return;
    case 'fimDoRound':
      passo(e, [0, 0]);
      if (e.faseQuadro >= DURACAO.fimDoRound) proximoRound(e);
      return;
    case 'fimDaLuta':
      passo(e, [0, 0]);
      return;
  }
}

function mudarFase(e: EstadoDaLuta, fase: Fase) {
  e.fase = fase;
  e.faseQuadro = 0;
}

function terminarRound(e: EstadoDaLuta, vencedor: 0 | 1 | 2) {
  e.vencedorDoRound = vencedor;
  mudarFase(e, 'fimDoRound');
  e.lutadores.forEach((l, i) => {
    if (vencedor === i) { l.vitorias++; if (l.acao !== 'voando' && l.acao !== 'caido') mudar(l, 'vitoria'); }
    else if (l.acao !== 'voando' && l.acao !== 'caido') mudar(l, 'derrota');
    l.vx = 0;
  });
}

function proximoRound(e: EstadoDaLuta) {
  const [a, b] = e.lutadores;
  const alvo = e.config.roundsParaVencer;
  if (a.vitorias >= alvo || b.vitorias >= alvo || e.round >= ROUNDS_NO_MAXIMO) {
    e.vencedor = a.vitorias >= alvo && b.vitorias >= alvo ? 2 : a.vitorias >= alvo ? 0 : b.vitorias >= alvo ? 1 : 2;
    mudarFase(e, 'fimDaLuta');
    return;
  }
  e.round++;
  e.tempo = TEMPO_DO_ROUND * 60;
  e.projeteis = [];
  e.vencedorDoRound = -1;
  mudarFase(e, 'apresentacao');
  e.lutadores.forEach((l, i) => {
    const ficha = FICHAS[l.id];
    Object.assign(l, {
      x: INICIO_X[i], y: 0, vx: 0, vy: 0, lado: i === 0 ? 1 : -1, vida: ficha.vida, vidaAtrasada: ficha.vida,
      atordoado: 0, invencivel: 0, acertou: false, encadear: null, combo: 0, impactoTipo: 0,
      // round novo começa na forma de sempre: a transformação é conquista do round
      forma: 0,
    });
    mudar(l, 'entrada');
  });
}

function mudar(l: Lutador, acao: Acao) {
  l.acao = acao;
  l.quadro = 0;
  l.acertou = false;
  l.encadear = null;
}

function derrubar(l: Lutador, direcao: number) {
  mudar(l, 'voando');
  l.vy = esp(4.2);
  l.vx = direcao * vel(2.2);
  l.y = Math.max(l.y, 1);
  l.atordoado = 0;
}

function passo(e: EstadoDaLuta, entradas: readonly [Entrada, Entrada]) {
  const lutando = e.fase === 'luta';
  for (let i = 0; i < 2; i++) {
    const l = e.lutadores[i];
    const ent = lutando ? entradas[i] : 0;
    decidir(e, i as 0 | 1, ent);
    l.anterior = ent;
  }
  for (const l of e.lutadores) mover(e, l);
  empurrarCorpos(e);
  for (let i = 0; i < 2; i++) acertarComCorpo(e, i as 0 | 1, lutando ? entradas[1 - i] : 0);
  moverProjeteis(e, lutando ? entradas : [0, 0]);
  for (const l of e.lutadores) {
    if (l.invencivel > 0) l.invencivel--;
    // Transformado, o ki escoa; zerou, volta ao normal. Só lutando: a apresentação não gasta.
    if (l.forma === 1 && lutando && e.quadro % TRANSFORMACAO.escoamento === 0) {
      l.ki = Math.max(0, l.ki - 1);
      if (l.ki === 0) { l.forma = 0; l.formaDesde = e.quadro; }
    }
    const emCombo = ATORDOADO.has(l.acao) || l.acao === 'voando' || l.acao === 'caido';
    if (!emCombo) l.combo = 0;
    if (l.vidaAtrasada < l.vida) l.vidaAtrasada = l.vida;
    else if (!emCombo && l.vidaAtrasada > l.vida) l.vidaAtrasada = Math.max(l.vida, l.vidaAtrasada - 4);
  }
}

/** O que o lutador faz neste quadro: segue a ação em curso ou começa outra pelos botões. */
function decidir(e: EstadoDaLuta, i: 0 | 1, ent: Entrada) {
  const l = e.lutadores[i];
  const o = e.lutadores[1 - i];
  const ficha = FICHAS[l.id];
  const apertou = ent & ~l.anterior;
  const frente = l.lado === 1 ? BOTAO.DIREITA : BOTAO.ESQUERDA;
  const tras = l.lado === 1 ? BOTAO.ESQUERDA : BOTAO.DIREITA;
  l.quadro++;
  if (l.toqueFrente < 99) l.toqueFrente++;
  if (l.toqueTras < 99) l.toqueTras++;
  const duploFrente = (apertou & frente) !== 0 && l.toqueFrente <= JANELA_DO_DUPLO_TOQUE;
  const duploTras = (apertou & tras) !== 0 && l.toqueTras <= JANELA_DO_DUPLO_TOQUE;
  if (apertou & frente) l.toqueFrente = 0;
  if (apertou & tras) l.toqueTras = 0;

  // ---- o que está em curso
  if (ehGolpeDeCorpo(l.acao)) {
    const g = ficha.golpes[l.acao];
    const aereo = l.acao === 'socoAereo' || l.acao === 'chuteAereo';
    if (g.encadeia && l.quadro >= g.inicio) {
      const botao = l.acao.startsWith('soco') ? BOTAO.SOCO : BOTAO.CHUTE;
      if (apertou & botao) l.encadear = g.encadeia;
    }
    if (l.quadro < g.inicio && g.avanca && !aereo) l.vx = px(g.avanca) * l.lado;
    else if (!aereo) l.vx = Math.trunc(l.vx * 3 / 4);
    if (l.encadear && l.acertou && l.quadro >= g.inicio + g.ativo) { mudar(l, l.encadear); return; }
    if (l.quadro >= g.inicio + g.ativo + g.volta) {
      if (aereo) { l.acao = 'pulando'; l.acertou = false; }
      else mudar(l, (ent & BOTAO.BAIXO) ? 'agachado' : 'parado');
    }
    return;
  }
  const poder = poderDa(ficha, l.acao);
  if (poder) {
    l.vx = 0;
    if (l.quadro === poder.inicio) soltar(e, i, poder, l.acao === 'super');
    if (l.quadro >= poder.inicio + segurando(poder) + poder.volta) mudar(l, 'parado');
    return;
  }
  switch (l.acao) {
    case 'entrada': mudar(l, 'parado'); break;
    case 'apanhando': case 'apanhandoBaixo': case 'defendendo': case 'defendendoBaixo':
      if (--l.atordoado <= 0) mudar(l, agachado(l) ? 'agachado' : 'parado');
      return;
    case 'pulando': golpeNoAr(l, ent); return; // o pouso é do chão (em mover)
    case 'voando': return;
    case 'caido':
      if (e.fase === 'luta' && l.quadro >= QUADROS.caido) { mudar(l, 'levantando'); l.invencivel = QUADROS.levantando + 6; }
      return;
    case 'levantando':
      if (l.quadro >= QUADROS.levantando) mudar(l, 'parado');
      return;
    case 'pouso':
      if (l.quadro >= QUADROS.pouso) mudar(l, 'parado');
      return;
    case 'sumindo':
      if (l.quadro === Math.floor(QUADROS.sumir / 2)) {
        // reaparece nas costas do outro, sem sair do mundo
        l.x = Math.max(PAREDE_ESQUERDA, Math.min(PAREDE_DIREITA, o.x - o.lado * esp(30)));
        l.y = 0;
        l.lado = o.x >= l.x ? 1 : -1;
      }
      if (l.quadro >= QUADROS.sumir) mudar(l, 'parado');
      return;
    case 'investida':
      l.vx = px(ficha.investida * rapidez(l)) * l.lado;
      if (l.quadro >= QUADROS.investida) mudar(l, 'parado');
      else if (apertou & (BOTAO.SOCO | BOTAO.CHUTE)) break; // a investida vira golpe
      else return;
      break;
    case 'recuo':
      l.vx = -vel(3) * l.lado;
      if (l.quadro >= QUADROS.recuo) mudar(l, 'parado');
      return;
    case 'vitoria': case 'derrota':
      l.vx = 0;
      return;
    case 'transformando':
      l.vx = 0;
      if (l.quadro >= TRANSFORMACAO.duracao) {
        l.forma = 1;
        l.formaDesde = e.quadro;
        mudar(l, 'parado');
        // o estouro: um clarão curto em que só ele se mexe, como o da super
        e.clarao = 24;
        e.claraoDe = i;
      }
      return;
    case 'carregando':
      l.vx = 0;
      if ((ent & BOTAO.CARREGAR) && !(apertou & ~BOTAO.CARREGAR)) {
        l.ki = Math.min(KI_MAXIMO, l.ki + KI_CARREGANDO);
        return;
      }
      mudar(l, 'parado');
      break;
  }
  if (e.fase !== 'luta') { if (LIVRE.has(l.acao) || l.acao === 'investida') mudar(l, 'parado'); l.vx = 0; return; }
  if (!LIVRE.has(l.acao) && l.acao !== 'investida' && l.acao !== 'carregando') return;

  // ---- livre: os botões começam a próxima coisa
  const baixo = (ent & BOTAO.BAIXO) !== 0;
  l.lado = o.x >= l.x ? 1 : -1;
  if ((apertou & BOTAO.TRANSFORMAR) && l.forma === 0 && l.ki >= TRANSFORMACAO.kiMinimo) {
    l.ki -= TRANSFORMACAO.custo;
    mudar(l, 'transformando');
    l.vx = 0;
    // o grito não é interrompido: nenhum golpe nem raio acerta quem está se transformando
    l.invencivel = TRANSFORMACAO.duracao + 2;
    return;
  }
  if ((apertou & BOTAO.SUMIR) && l.ki >= CUSTO_DO_SUMIR) {
    l.ki -= CUSTO_DO_SUMIR;
    mudar(l, 'sumindo');
    l.invencivel = QUADROS.sumir + 2;
    l.vx = 0;
    return;
  }
  if (apertou & BOTAO.ESPECIAL) {
    if (baixo && l.ki >= ficha.super.custo) {
      l.ki -= ficha.super.custo;
      mudar(l, 'super');
      e.clarao = 45;
      e.claraoDe = i;
      return;
    }
    if (l.ki >= ficha.especial.custo) { l.ki -= ficha.especial.custo; mudar(l, 'especial'); return; }
  }
  if ((apertou & BOTAO.RAJADA) && l.ki >= ficha.rajada.custo) {
    const minhas = e.projeteis.filter((p) => p.dono === i && p.tipo === 'rajada').length;
    if (minhas < 2) { l.ki -= ficha.rajada.custo; mudar(l, 'rajada'); return; }
  }
  if (apertou & BOTAO.SOCO) { mudar(l, baixo ? 'socoBaixo' : 'soco1'); return; }
  if (apertou & BOTAO.CHUTE) { mudar(l, baixo ? 'rasteira' : 'chute1'); return; }
  if ((ent & BOTAO.CARREGAR) && !baixo) { if (l.acao !== 'carregando') mudar(l, 'carregando'); l.vx = 0; return; }
  if (ent & BOTAO.CIMA) {
    mudar(l, 'pulando');
    l.vy = px(ficha.pulo);
    l.vx = (ent & frente) ? vel(2) * l.lado : (ent & tras) ? -vel(2) * l.lado : 0;
    l.y = 1;
    return;
  }
  if (duploFrente) { mudar(l, 'investida'); return; }
  if (duploTras) { mudar(l, 'recuo'); return; }
  const quer: Acao = baixo ? 'agachado' : (ent & frente) ? 'andando' : (ent & tras) ? 'recuando' : 'parado';
  if (quer !== l.acao) mudar(l, quer);
  l.vx = quer === 'andando' ? px(ficha.andar * rapidez(l)) * l.lado : quer === 'recuando' ? -px(ficha.recuar * rapidez(l)) * l.lado : Math.trunc(l.vx / 2);
}

/** Golpe no ar: começa pelo botão apertado durante o pulo; o resto é física. */
function golpeNoAr(l: Lutador, ent: Entrada) {
  const apertou = ent & ~l.anterior;
  if (l.acao !== 'pulando') return;
  if (apertou & BOTAO.SOCO) { l.acao = 'socoAereo'; l.quadro = 0; l.acertou = false; }
  else if (apertou & BOTAO.CHUTE) { l.acao = 'chuteAereo'; l.quadro = 0; l.acertou = false; }
}

function mover(e: EstadoDaLuta, l: Lutador) {
  if (estaNoAr(l)) {
    l.x += l.vx;
    l.y += l.vy;
    l.vy -= GRAV;
    if (l.y <= 0) {
      l.y = 0;
      l.vy = 0;
      if (l.acao === 'voando') { mudar(l, 'caido'); l.vx = 0; }
      else { mudar(l, e.fase === 'luta' ? 'pouso' : 'parado'); l.vx = 0; }
    }
  } else {
    l.x += l.vx;
    if (ATORDOADO.has(l.acao) || l.acao === 'caido' || l.acao === 'levantando') l.vx = Math.trunc(l.vx * 7 / 8);
  }
  l.x = Math.max(PAREDE_ESQUERDA, Math.min(PAREDE_DIREITA, l.x));
}

function empurrarCorpos(e: EstadoDaLuta) {
  const [a, b] = e.lutadores;
  // Longe demais: os dois voltam para o meio, cada um metade.
  const d = b.x - a.x;
  if (Math.abs(d) > DISTANCIA_MAXIMA) {
    const sobra = Math.trunc((Math.abs(d) - DISTANCIA_MAXIMA) / 2) + 1;
    const s = Math.sign(d);
    a.x += s * sobra;
    b.x -= s * sobra;
  }
  if (a.acao === 'sumindo' || b.acao === 'sumindo' || a.acao === 'caido' || b.acao === 'caido') return;
  const ca = caixaDoCorpo(a), cb = caixaDoCorpo(b);
  if (!(ca[1] < cb[3] && cb[1] < ca[3])) return; // um passou por cima do outro
  const minimo = px(FICHAS[a.id].corpo.meiaLargura + FICHAS[b.id].corpo.meiaLargura);
  const dist = Math.abs(b.x - a.x);
  if (dist >= minimo) return;
  // mesmo lugar: quem está à esquerda na tela vai para a esquerda (pelo lado para onde olha)
  const s = b.x !== a.x ? Math.sign(b.x - a.x) : a.lado;
  const falta = minimo - dist;
  let va = -Math.ceil(falta / 2) * s, vb = Math.floor(falta / 2) * s;
  if (a.x + va < PAREDE_ESQUERDA || a.x + va > PAREDE_DIREITA) { vb += -va; va = 0; }
  if (b.x + vb < PAREDE_ESQUERDA || b.x + vb > PAREDE_DIREITA) { va -= vb; vb = 0; }
  a.x = Math.max(PAREDE_ESQUERDA, Math.min(PAREDE_DIREITA, a.x + va));
  b.x = Math.max(PAREDE_ESQUERDA, Math.min(PAREDE_DIREITA, b.x + vb));
}

/** Pode apanhar agora? Caído, levantando e sumindo não apanham. */
const vulneravel = (l: Lutador) => l.invencivel === 0 && l.acao !== 'caido' && l.acao !== 'sumindo';

/** O outro está segurando para trás — para trás DELE, que é para longe de quem bate. */
function defende(def: Lutador, entradaDoDefensor: Entrada, deOndeVem: number, altura: Altura): boolean {
  if (!PODE_DEFENDER.has(def.acao) || def.y > 0) return false;
  // o golpe vem da esquerda (+1): trás, para quem apanha, é a direita
  const tras = deOndeVem > 0 ? BOTAO.DIREITA : BOTAO.ESQUERDA;
  if (!(entradaDoDefensor & tras)) return false;
  const baixo = (entradaDoDefensor & BOTAO.BAIXO) !== 0;
  if (altura === 'baixo') return baixo;
  if (altura === 'alto' || altura === 'aereo') return !baixo;
  return true;
}

type Batida = {
  dano: number; atordoa: number; defendido: number; altura: Altura; empurra: number; derruba: boolean; forte: boolean; ki: boolean;
  /** Parada de impacto própria: as batidas do meio de um raio congelam pouco, senão a onda sai engasgada. */
  parada?: number;
};

/** Um golpe chegou em `def`, vindo de `deOndeVem` (+1: de quem está à esquerda). Devolve se foi defendido. */
function bater(e: EstadoDaLuta, atq: Lutador, def: Lutador, entradaDoDefensor: Entrada, deOndeVem: number, b: Batida, onde: [number, number]): boolean {
  const defendido = defende(def, entradaDoDefensor, deOndeVem, b.altura);
  def.impactoEm = e.quadro;
  def.impactoX = Math.round(onde[0]);
  def.impactoY = Math.round(onde[1]);
  if (defendido) {
    const baixo = (entradaDoDefensor & BOTAO.BAIXO) !== 0;
    if (def.acao !== 'defendendo' && def.acao !== 'defendendoBaixo') mudar(def, baixo ? 'defendendoBaixo' : 'defendendo');
    def.atordoado = b.defendido;
    def.vida = Math.max(b.ki ? 1 : 0, def.vida - (b.ki ? Math.floor(b.dano / DANO_NA_DEFESA) : 0));
    def.vx = deOndeVem * px(b.empurra);
    def.impactoTipo = 3;
    e.congelado = Math.max(e.congelado, PARADA.defendido);
    return true;
  }
  const escala = ESCALA_DO_COMBO[Math.min(def.combo, ESCALA_DO_COMBO.length - 1)];
  // transformado bate mais forte (em inteiros: 125%)
  const forca = atq.forma === 1 ? Math.round(TRANSFORMACAO.dano * 100) : 100;
  def.vida = Math.max(0, def.vida - Math.max(1, Math.floor(b.dano * escala * forca / 10000)));
  def.combo++;
  atq.ki = Math.min(KI_MAXIMO, atq.ki + KI_POR_ACERTO);
  def.ki = Math.min(KI_MAXIMO, def.ki + KI_POR_APANHAR);
  def.impactoTipo = b.forte ? 2 : 1;
  e.congelado = Math.max(e.congelado, b.parada ?? (b.forte ? PARADA.forte : PARADA.golpe));
  // Poder que o defensor soltava se desfaz: quem apanha perde o raio.
  e.projeteis = e.projeteis.filter((p) => !(p.dono === e.lutadores.indexOf(def) && RAIOS.has(p.tipo)));
  if (b.derruba || def.y > 0 || def.vida <= 0) {
    derrubar(def, deOndeVem);
  } else {
    const baixo = agachado(def);
    mudar(def, baixo ? 'apanhandoBaixo' : 'apanhando');
    def.atordoado = b.atordoa;
    def.vx = deOndeVem * px(b.empurra);
  }
  // Contra a parede, quem bateu é que recua.
  if (def.x <= PAREDE_ESQUERDA + px(2) || def.x >= PAREDE_DIREITA - px(2)) atq.vx = -deOndeVem * px(b.empurra);
  return false;
}

function acertarComCorpo(e: EstadoDaLuta, i: 0 | 1, entradaDoOutro: Entrada) {
  const atq = e.lutadores[i];
  const def = e.lutadores[1 - i];
  const caixa = caixaDoGolpe(atq);
  if (!caixa || atq.acertou || !vulneravel(def)) return;
  const corpo = caixaDoCorpo(def);
  if (!cruza(caixa, corpo)) return;
  atq.acertou = true;
  const g: Golpe = FICHAS[atq.id].golpes[atq.acao as keyof Ficha['golpes']];
  const deOndeVem = def.x >= atq.x ? 1 : -1;
  const onde: [number, number] = [(Math.max(caixa[0], corpo[0]) + Math.min(caixa[2], corpo[2])) / 2, (Math.max(caixa[1], corpo[1]) + Math.min(caixa[3], corpo[3])) / 2];
  bater(e, atq, def, entradaDoOutro, deOndeVem, {
    dano: g.dano, atordoa: g.atordoa, defendido: g.defendido, altura: g.altura, empurra: g.empurra,
    derruba: !!g.derruba, forte: !!g.forte, ki: false,
  }, onde);
}

function soltar(e: EstadoDaLuta, i: 0 | 1, p: Poder, ehSuper: boolean) {
  const l = e.lutadores[i];
  const mao = l.x + l.lado * esp(20);
  const base: Projetil = {
    id: e.proximoProjetil++, dono: i, tipo: p.tipo, super: ehSuper, x: mao, y: px(p.altura), vx: 0, ponta: mao,
    direcao: l.lado, resta: p.duracao, quadro: 0, batidas: p.batidas, intervalo: p.intervalo, proximaBatida: 0,
  };
  if (p.tipo === 'rajada' || p.tipo === 'bola') base.vx = px(p.velocidade) * l.lado;
  if (p.tipo === 'laser') base.ponta = l.lado === 1 ? px(MUNDO) : 0;
  e.projeteis.push(base);
}

function moverProjeteis(e: EstadoDaLuta, entradas: readonly [Entrada, Entrada]) {
  const vivos: Projetil[] = [];
  for (const p of e.projeteis) {
    const dono = e.lutadores[p.dono];
    const alvo = e.lutadores[1 - p.dono];
    const ficha = FICHAS[dono.id];
    const poder = p.tipo === 'rajada' ? ficha.rajada : p.super ? ficha.super : ficha.especial;
    p.quadro++;
    p.resta--;
    const raio = RAIOS.has(p.tipo);
    // o raio é da pose: quem parou de soltar (apanhou, a luta acabou) perde o raio
    if (raio && dono.acao !== 'especial' && dono.acao !== 'super') continue;
    if (raio) {
      const limite = p.direcao === 1 ? px(MUNDO) : 0;
      p.ponta = p.tipo === 'laser' ? limite : p.direcao === 1 ? Math.min(limite, p.ponta + px(poder.velocidade)) : Math.max(limite, p.ponta - px(poder.velocidade));
    } else {
      p.x += p.vx;
    }
    const esp = px(poder.espessura);
    const x0 = raio ? Math.min(p.x, p.ponta) : p.x - esp;
    const x1 = raio ? Math.max(p.x, p.ponta) : p.x + esp;
    const caixa = [x0 / SUB, (p.y - esp) / SUB, x1 / SUB, (p.y + esp) / SUB];
    const corpo = caixaDoCorpo(alvo);
    if (e.fase === 'luta' && p.quadro >= p.proximaBatida && p.batidas > 0 && vulneravel(alvo) && cruza(caixa, corpo)) {
      p.batidas--;
      p.proximaBatida = p.quadro + p.intervalo;
      const ultima = p.batidas === 0;
      const deOndeVem = p.direcao;
      const onde: [number, number] = [alvo.x / SUB - p.direcao * FICHAS[alvo.id].corpo.meiaLargura, p.y / SUB];
      bater(e, dono, alvo, entradas[1 - p.dono], deOndeVem, {
        dano: poder.dano, atordoa: poder.atordoa || 18, defendido: 12, altura: 'medio', empurra: raio ? 1.2 : 2.5,
        derruba: ultima && !!poder.derruba, forte: ultima, ki: true, parada: raio && !ultima ? 2 : undefined,
      }, onde);
      // A onda para no corpo de quem apanha; a bola e a rajada acabam no acerto.
      if (!raio) continue;
      if (p.tipo === 'onda') p.ponta = alvo.x - p.direcao * px(FICHAS[alvo.id].corpo.meiaLargura);
    }
    if (p.resta <= 0) continue;
    if (!raio && (p.x < 0 || p.x > px(MUNDO))) continue;
    vivos.push(p);
  }
  // Duas coisas de ki de lados opostos se encontrando se anulam.
  for (const a of vivos) {
    for (const b of vivos) {
      if (a.dono !== 0 || b.dono !== 1 || a.resta <= 0 || b.resta <= 0) continue;
      const ax0 = RAIOS.has(a.tipo) ? Math.min(a.x, a.ponta) : a.x - esp(6), ax1 = RAIOS.has(a.tipo) ? Math.max(a.x, a.ponta) : a.x + esp(6);
      const bx0 = RAIOS.has(b.tipo) ? Math.min(b.x, b.ponta) : b.x - esp(6), bx1 = RAIOS.has(b.tipo) ? Math.max(b.x, b.ponta) : b.x + esp(6);
      if (ax0 < bx1 && bx0 < ax1 && Math.abs(a.y - b.y) < esp(24)) {
        // bola grande da super atravessa rajada pequena
        if (a.tipo === 'bola' && b.tipo === 'rajada') { b.resta = 0; continue; }
        if (b.tipo === 'bola' && a.tipo === 'rajada') { a.resta = 0; continue; }
        a.resta = 0; b.resta = 0;
      }
    }
  }
  e.projeteis = vivos.filter((p) => p.resta > 0);
}

