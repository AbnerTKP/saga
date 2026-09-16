/**
 * Do estado da luta para o desenho: qual pose cada lutador faz neste quadro, e o sprite dela.
 *
 * Pixel art de jogo de luta anima com POUCOS quadros bem escolhidos e segurados — preparo, golpe
 * esticado, volta —, e não com uma pose nova a cada quadro. Por isso cada pose vira um sprite
 * desenhado uma vez e guardado: a luta inteira usa algumas dezenas por lutador.
 *
 * As poses de golpe são escritas UMA vez, na medida do Goiaba, e esticadas para o corpo de cada
 * um (o Picolé tem perna e braço mais longos, o Vegetal mais curtos); parado, especial e vitória
 * saem da `vitrine` de cada personagem, que é o jeito dele. Os tempos saem das fichas: mexer no
 * início de um soco lá muda a pose aqui junto.
 */
import { SPRITE, sprite, type Membro, type Personagem, type Pose } from './boneco.ts';
import { FICHAS, ehGolpeDeCorpo } from './fichas.ts';
import { faseDoGolpe } from './luta.ts';
import { criarQuadro, girarMatiz, matizELuz, type Quadro } from './quadro.ts';
import type { P } from './raster.ts';
import type { EstadoDaLuta, IdDoLutador, Lutador } from './tipos.ts';
import * as goiabaM from './personagens/goiaba.ts';
import * as vegetalM from './personagens/vegetal.ts';
import * as picoleM from './personagens/picole.ts';
import * as geladeiraM from './personagens/geladeira.ts';
import { quadroDoPixel } from './pixel/sprites.ts';
import './pixel/todos.ts';

type Vitrine = { parado: Pose; especial: Pose; vitoria: Pose };
const PERSONAGENS: Record<IdDoLutador, { p: Personagem; vitrine: Vitrine; disparo?: Pose }> = {
  goiaba: { p: goiabaM.goiaba, vitrine: goiabaM.vitrine },
  vegetal: { p: vegetalM.vegetal, vitrine: vegetalM.vitrine },
  picole: { p: picoleM.picole, vitrine: picoleM.vitrine, disparo: picoleM.disparoDoEspecial },
  geladeira: { p: geladeiraM.geladeira, vitrine: geladeiraM.vitrine },
  // Os três que chegaram depois nasceram só de pixel: o boneco deles é o de quem têm o corpo, e só
  // serve de medida (o teste de sprites exige pixel de todos, então ele nunca é desenhado).
  goiabaSuper: { p: goiabaM.goiaba, vitrine: goiabaM.vitrine },
  vegetalSuper: { p: vegetalM.vegetal, vitrine: vegetalM.vitrine },
  goteira: { p: goiabaM.goiaba, vitrine: goiabaM.vitrine },
};

export const personagemDe = (id: IdDoLutador) => PERSONAGENS[id].p;

// ---- as poses na medida do Goiaba -----------------------------------------------------------------

const GUARDA = { bracoF: { alvo: [16, -40] as P }, bracoT: { alvo: [7, -44] as P } };
const BASE: Pose = { quadril: [-1, -23], tronco: 10, cabeca: -6, pernaF: { alvo: [11, -3] }, pernaT: { alvo: [-10, -3] }, ...GUARDA };
const com = (mudancas: Partial<Pose>): Pose => ({ ...BASE, ...mudancas });

const GENERICAS = {
  andar1: com({ quadril: [0, -22], pernaF: { alvo: [15, -3] }, pernaT: { alvo: [-6, -7] } }),
  andar2: com({ quadril: [0, -24], pernaF: { alvo: [10, -3] }, pernaT: { alvo: [-3, -3] } }),
  andar3: com({ quadril: [0, -22], pernaF: { alvo: [5, -7] }, pernaT: { alvo: [-11, -3] } }),
  andar4: com({ quadril: [0, -24], pernaF: { alvo: [9, -3] }, pernaT: { alvo: [-15, -3] } }),
  investida: com({ quadril: [2, -21], tronco: 32, cabeca: -24, pernaF: { alvo: [16, -5] }, pernaT: { alvo: [-16, -8] }, bracoF: { alvo: [6, -30] }, bracoT: { alvo: [-14, -32] } }),
  recuo: com({ quadril: [-2, -30], tronco: -8, cabeca: 6, pernaF: { ang: [40, -70] }, pernaT: { ang: [10, -60] }, peF: -20, peT: -20 }),
  agachado: com({ quadril: [0, -14], tronco: 20, cabeca: -15, pernaF: { alvo: [12, -3] }, pernaT: { alvo: [-10, -3] }, bracoF: { alvo: [16, -27] }, bracoT: { alvo: [8, -30] } }),
  pulando: com({ quadril: [0, -34], tronco: 5, cabeca: -5, pernaF: { ang: [70, -110] }, pernaT: { ang: [20, -80] }, bracoF: { alvo: [14, -50] }, bracoT: { alvo: [-6, -40] }, peF: -30, peT: -40 }),
  caindo: com({ quadril: [0, -30], tronco: 0, cabeca: 0, pernaF: { ang: [30, -30] }, pernaT: { ang: [-10, -20] }, bracoF: { ang: [120, -30] }, bracoT: { ang: [-110, 30] }, peF: -10, peT: -20 }),
  pouso: com({ quadril: [0, -17], tronco: 16, cabeca: -12, pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-12, -3] }, bracoF: { alvo: [18, -30] }, bracoT: { alvo: [-6, -28] } }),
  defesa: com({ quadril: [-3, -22], tronco: -4, cabeca: 6, bracoF: { alvo: [10, -48] }, bracoT: { alvo: [11, -42] } }),
  defesaBaixa: com({ quadril: [-2, -14], tronco: 8, cabeca: -2, pernaF: { alvo: [12, -3] }, pernaT: { alvo: [-10, -3] }, bracoF: { alvo: [10, -34] }, bracoT: { alvo: [11, -28] } }),
  socoPreparo: com({ quadril: [-2, -22], tronco: 4, bracoF: { alvo: [2, -40] }, bracoT: { alvo: [10, -44] } }),
  soco: com({ quadril: [3, -22], tronco: 22, cabeca: -18, pernaF: { alvo: [15, -3] }, pernaT: { alvo: [-13, -3] }, bracoF: { alvo: [33, -42] }, bracoT: { alvo: [5, -39] } }),
  socoTras: com({ quadril: [4, -22], tronco: 26, cabeca: -20, pernaF: { alvo: [16, -3] }, pernaT: { alvo: [-12, -3] }, bracoF: { alvo: [8, -36] }, bracoT: { alvo: [32, -44] } }),
  socoForte: com({ quadril: [5, -24], tronco: 14, cabeca: -14, pernaF: { alvo: [17, -3] }, pernaT: { alvo: [-11, -3] }, bracoF: { alvo: [30, -52] }, bracoT: { alvo: [-2, -36] } }),
  chutePreparo: com({ quadril: [-2, -24], tronco: -6, cabeca: 6, pernaF: { ang: [70, -100] }, pernaT: { alvo: [-6, -3] }, bracoF: { alvo: [10, -44] }, bracoT: { alvo: [-10, -38] } }),
  chute: com({ quadril: [-2, -26], tronco: -18, cabeca: 14, pernaF: { ang: [95, -5] }, pernaT: { alvo: [-5, -3] }, bracoF: { alvo: [8, -44] }, bracoT: { alvo: [-12, -36] }, peF: 60 }),
  chuteAlto: com({ quadril: [-3, -27], tronco: -28, cabeca: 20, pernaF: { ang: [128, -8] }, pernaT: { alvo: [-4, -3] }, bracoF: { alvo: [4, -46] }, bracoT: { alvo: [-14, -34] }, peF: 80 }),
  socoBaixo: com({ quadril: [2, -14], tronco: 24, cabeca: -18, pernaF: { alvo: [14, -3] }, pernaT: { alvo: [-10, -3] }, bracoF: { alvo: [30, -22] }, bracoT: { alvo: [8, -28] } }),
  rasteira: com({ quadril: [-4, -10], tronco: -4, cabeca: -6, pernaF: { ang: [88, 2] }, pernaT: { alvo: [-12, -3] }, bracoF: { alvo: [2, -24] }, bracoT: { alvo: [-12, -5] }, peF: 0 }),
  socoAereo: com({ quadril: [0, -34], tronco: 14, cabeca: -10, pernaF: { ang: [60, -100] }, pernaT: { ang: [15, -70] }, bracoF: { alvo: [28, -42] }, bracoT: { alvo: [-4, -46] }, peF: -30, peT: -40 }),
  chuteAereo: com({ quadril: [0, -34], tronco: -10, cabeca: 8, pernaF: { ang: [55, -2] }, pernaT: { ang: [10, -90] }, bracoF: { alvo: [10, -52] }, bracoT: { alvo: [-12, -44] }, peF: 30, peT: -40 }),
  maosNoQuadril: com({ quadril: [-3, -21], tronco: -6, cabeca: 4, pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-13, -3] }, bracoF: { alvo: [-8, -26] }, bracoT: { alvo: [-10, -24] }, maoF: 'aberta', maoT: 'aberta' }),
  rajada: com({ quadril: [-2, -22], tronco: 4, cabeca: -4, pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-13, -3] }, bracoF: { alvo: [30, -38] }, bracoT: { alvo: [2, -34] }, maoF: 'aberta' }),
  soltarDuas: com({ quadril: [-2, -22], tronco: 4, cabeca: -4, pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-13, -3] }, bracoF: { alvo: [28, -36] }, bracoT: { alvo: [26, -34] }, maoF: 'aberta', maoT: 'aberta', grito: true }),
  carregar1: com({ quadril: [0, -21], tronco: 0, cabeca: 12, pernaF: { alvo: [12, -3] }, pernaT: { alvo: [-12, -3] }, bracoF: { alvo: [9, -20] }, bracoT: { alvo: [-9, -20] }, grito: true, olhos: 'fechados' }),
  carregar2: com({ quadril: [0, -20], tronco: 2, cabeca: 16, pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-13, -3] }, bracoF: { alvo: [10, -19] }, bracoT: { alvo: [-10, -19] }, grito: true, olhos: 'fechados' }),
  apanhar1: com({ quadril: [-4, -23], tronco: -20, cabeca: -25, pernaF: { alvo: [10, -3] }, pernaT: { alvo: [-12, -3] }, bracoF: { ang: [40, 20] }, bracoT: { ang: [-40, 30] }, olhos: 'fechados', grito: true }),
  apanhar2: com({ quadril: [-3, -23], tronco: -12, cabeca: -14, pernaF: { alvo: [10, -3] }, pernaT: { alvo: [-12, -3] }, bracoF: { ang: [30, 40] }, bracoT: { ang: [-30, 40] }, olhos: 'fechados' }),
  apanharBaixo: com({ quadril: [-3, -14], tronco: -6, cabeca: -24, pernaF: { alvo: [12, -3] }, pernaT: { alvo: [-10, -3] }, bracoF: { ang: [30, 30] }, bracoT: { ang: [-20, 30] }, olhos: 'fechados', grito: true }),
  voando: com({ quadril: [0, -24], tronco: -62, cabeca: -20, pernaF: { ang: [70, 30] }, pernaT: { ang: [40, 40] }, bracoF: { ang: [-130, 20] }, bracoT: { ang: [-100, 30] }, olhos: 'fechados', grito: true, peF: 30, peT: 20 }),
  caido: com({ quadril: [6, -6], tronco: -88, cabeca: 0, pernaF: { ang: [94, 0] }, pernaT: { ang: [86, 4] }, bracoF: { ang: [-80, 10] }, bracoT: { ang: [-95, 0] }, olhos: 'fechados', peF: 90, peT: 90 }),
  levantando: com({ quadril: [0, -14], tronco: 38, cabeca: -10, pernaF: { alvo: [13, -3] }, pernaT: { alvo: [-9, -3] }, bracoF: { alvo: [12, -16] }, bracoT: { alvo: [0, -18] } }),
  derrota: com({ quadril: [0, -21], tronco: 30, cabeca: 24, pernaF: { alvo: [9, -3] }, pernaT: { alvo: [-8, -3] }, bracoF: { ang: [12, 6] }, bracoT: { ang: [-6, 8] }, olhos: 'fechados' }),
  sumindo: com({ quadril: [0, -18], tronco: 14, cabeca: -6, pernaF: { alvo: [9, -3] }, pernaT: { alvo: [-9, -3] }, bracoF: { alvo: [6, -34] }, bracoT: { alvo: [2, -34] } }),
} satisfies Record<string, Pose>;
type Generica = keyof typeof GENERICAS;

const GOIABA = goiabaM.corpoDoGoiaba;
const PERNA_BASE = GOIABA.coxa + GOIABA.canela;
const BRACO_BASE = GOIABA.bracoSup + GOIABA.antebraco;

/** Estica uma pose da medida do Goiaba para o corpo de outro lutador. */
function naMedida(id: IdDoLutador, pose: Pose): Pose {
  if (id === 'goiaba') return pose;
  const c = PERSONAGENS[id].p.corpo;
  const sPerna = (c.coxa + c.canela) / PERNA_BASE;
  const sBraco = (c.bracoSup + c.antebraco) / BRACO_BASE;
  const quadril: P = [pose.quadril[0], pose.quadril[1] * sPerna];
  const perna = (m: Membro): Membro => (m.alvo ? { alvo: [m.alvo[0] * sPerna, m.alvo[1] >= -4 ? m.alvo[1] : m.alvo[1] * sPerna] } : m);
  // o braço mira a partir do ombro: o alvo é o mesmo gesto, a partir do ombro de cada um
  const ombroBase: P = [pose.quadril[0], pose.quadril[1] - GOIABA.tronco];
  const ombro: P = [quadril[0], quadril[1] - c.tronco];
  const braco = (m: Membro): Membro => (m.alvo
    ? { alvo: [ombro[0] + (m.alvo[0] - ombroBase[0]) * sBraco, ombro[1] + (m.alvo[1] - ombroBase[1]) * sBraco] }
    : m);
  return { ...pose, quadril, pernaF: perna(pose.pernaF), pernaT: perna(pose.pernaT), bracoF: braco(pose.bracoF), bracoT: braco(pose.bracoT) };
}

// ---- qual pose agora ------------------------------------------------------------------------

export type Quadro_ = { chave: string; pose: Pose | null };

/** Um de dois, trocando a cada `n` quadros. */
const alterna = (q: number, n: number) => Math.floor(q / n) % 2;

export function poseAgora(l: Lutador, e: EstadoDaLuta): Quadro_ {
  const v = PERSONAGENS[l.id].vitrine;
  const g = (nome: Generica, extra = ''): Quadro_ => ({ chave: nome + extra, pose: naMedida(l.id, GENERICAS[nome]) });
  const propria = (chave: string, pose: Pose): Quadro_ => ({ chave, pose });
  const ficha = FICHAS[l.id];
  const q = l.quadro;
  const fase = faseDoGolpe(l);

  switch (l.acao) {
    case 'entrada':
    case 'parado': {
      // a respiração: o quadril desce um pixel de tempos em tempos
      const r = alterna(e.quadro + (l.cor ? 11 : 0), 24);
      return propria('parado' + r, r ? { ...v.parado, quadril: [v.parado.quadril[0], v.parado.quadril[1] + 1] } : v.parado);
    }
    case 'andando': case 'recuando': {
      const passo = Math.floor(q / 7) % 4;
      const i = l.acao === 'andando' ? passo : 3 - passo;
      return g((['andar1', 'andar2', 'andar3', 'andar4'] as const)[i]);
    }
    case 'investida': return g('investida');
    case 'recuo': return g('recuo');
    case 'agachado': return g('agachado');
    case 'pulando': return g(l.vy > 32 ? 'pulando' : 'caindo');
    case 'pouso': return g('pouso');
    case 'defendendo': return g('defesa');
    case 'defendendoBaixo': return g('defesaBaixa');
    case 'carregando': return g(alterna(q, 6) ? 'carregar1' : 'carregar2');
    // O grito da transformação: a mesma força do carregar, tremendo mais rápido.
    case 'transformando': return g(alterna(q, 3) ? 'carregar1' : 'carregar2', 't');
    case 'apanhando': return g(q < 6 ? 'apanhar1' : 'apanhar2');
    case 'apanhandoBaixo': return g('apanharBaixo');
    case 'voando': return g('voando');
    case 'caido': return g('caido', l.vida <= 0 ? 'ko' : '');
    case 'levantando': return g('levantando');
    case 'vitoria': return propria('vitoria', v.vitoria);
    case 'derrota': return g('derrota');
    case 'sumindo':
      return q >= 3 && q < 11 ? { chave: 'vazio', pose: null } : g('sumindo');
    case 'rajada':
      return g(fase === 'inicio' ? 'maosNoQuadril' : 'rajada');
    case 'especial':
    case 'super': {
      const grito = l.acao === 'super' ? 's' : '';
      const carregando = fase === 'inicio' || (e.clarao > 0 && e.claraoDe !== -1 && e.lutadores[e.claraoDe] === l);
      const disparo = PERSONAGENS[l.id].disparo;
      if (carregando) {
        // Picolé carrega com os dois dedos na testa (a vitrine dele); os outros, com as mãos para trás
        if (l.id === 'picole' || l.id === 'geladeira') return propria('carrega' + grito, { ...v.especial, grito: !!grito || v.especial.grito });
        return g('maosNoQuadril', grito);
      }
      if (fase === 'volta') return g('soltarDuas', 'v');
      const pose = disparo ?? v.especial;
      return propria('solta' + grito, { ...pose, grito: !!grito || pose.grito });
    }
  }
  if (ehGolpeDeCorpo(l.acao)) {
    const golpe = ficha.golpes[l.acao];
    const ativo = fase === 'ativo' || (fase === 'volta' && q < golpe.inicio + golpe.ativo + 3);
    switch (l.acao) {
      case 'soco1': return g(ativo ? 'soco' : 'socoPreparo');
      case 'soco2': return g(ativo ? 'socoTras' : 'soco');
      case 'soco3': return g(ativo ? 'socoForte' : 'socoPreparo');
      case 'chute1': return g(ativo ? 'chute' : 'chutePreparo');
      case 'chute2': return g(ativo ? 'chuteAlto' : 'chutePreparo');
      case 'socoBaixo': return g(ativo ? 'socoBaixo' : 'agachado');
      case 'rasteira': return g(ativo ? 'rasteira' : 'agachado');
      case 'socoAereo': return g(ativo ? 'socoAereo' : 'pulando');
      case 'chuteAereo': return g(ativo ? 'chuteAereo' : 'pulando');
    }
  }
  return propria('parado0', v.parado);
}

// ---- sprites guardados ------------------------------------------------------------------------

const VAZIO = criarQuadro(SPRITE.largura, SPRITE.altura);
const guardados = new Map<string, Quadro>();

/**
 * O sprite é o de pixel (o modelo do zip) sempre que o lutador tiver um; o boneco de esqueleto fica
 * de reserva para quem não tiver. O de pixel já vem na segunda cor, pintada pelo MATERIAL — aqui,
 * pela cor, o cabelo escuro do zip tem matiz o bastante para girar e o Goiaba do espelho saía de
 * cabelo verde.
 */
export function spriteDoLutador(l: Lutador, e: EstadoDaLuta): Quadro {
  const { chave, pose } = poseAgora(l, e);
  if (!pose) return VAZIO;
  const forma = l.forma ?? 0;
  const k = `${l.id}:${l.cor}:${forma}:${chave}`;
  let s = guardados.get(k);
  if (!s) {
    s = quadroDoPixel(l.id, forma, chave, l.cor) ?? undefined;
    if (!s) {
      s = sprite(PERSONAGENS[l.id].p, { ...pose, forma });
      if (l.cor === 1) segundaCor(s);
    }
    guardados.set(k, s);
  }
  return s;
}

/** O lutador parado, de corpo inteiro, para a vitrine da escolha. */
export const spriteParado = (id: IdDoLutador): Quadro => quadroDoPixel(id, 0, 'parado0') ?? sprite(PERSONAGENS[id].p, PERSONAGENS[id].vitrine.parado);

/**
 * Desenha de antemão as poses que a luta usa, para o primeiro soco de cada um não engasgar o
 * quadro. Passa por todas as ações com um lutador de mentira.
 */
export function preaquecer(id: IdDoLutador, cor: 0 | 1) {
  const acoes: Lutador['acao'][] = [
    'parado', 'andando', 'recuando', 'investida', 'recuo', 'agachado', 'pulando', 'pouso', 'defendendo', 'defendendoBaixo',
    'soco1', 'soco2', 'soco3', 'chute1', 'chute2', 'socoBaixo', 'rasteira', 'socoAereo', 'chuteAereo', 'rajada', 'especial',
    'super', 'carregando', 'sumindo', 'apanhando', 'apanhandoBaixo', 'voando', 'caido', 'levantando', 'vitoria', 'derrota',
  ];
  const e = { quadro: 0, clarao: 0, claraoDe: -1, lutadores: [] } as unknown as EstadoDaLuta;
  const l = { id, cor, forma: 0, acao: 'parado', quadro: 0, vy: 0, vida: 1 } as Lutador;
  // as duas formas: a primeira transformação da luta não pode engasgar o quadro do estouro
  for (const forma of [0, 1] as const) {
    l.forma = forma;
    for (const acao of [...acoes, 'transformando' as const]) {
      for (let q = 0; q < 140; q += 2) {
        l.acao = acao; l.quadro = q; l.vy = q % 4 ? 100 : 0; l.vida = q % 6 ? 1 : 0;
        e.quadro = q;
        spriteDoLutador(l, e);
      }
    }
  }
}

/**
 * A segunda cor, para o espelho (Goiaba contra Goiaba): gira o matiz do que é roupa e deixa pele,
 * olho, cabelo escuro e contorno como estão. Pele é tom quente e claro; o resto que tem cor gira.
 */
function segundaCor(s: Quadro) {
  const memo = new Map<number, number>();
  for (let i = 0; i < s.px.length; i++) {
    const c = s.px[i];
    if (c === 0) continue;
    let n = memo.get(c);
    if (n === undefined) { n = girar(c); memo.set(c, n); }
    s.px[i] = n;
  }
}

function girar(c: number): number {
  const [h, l] = matizELuz(c);
  if (h >= 12 && h <= 45 && l > 0.55) return c; // pele
  return girarMatiz(c, 150);
}
