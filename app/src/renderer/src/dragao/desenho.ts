/**
 * Uma luta num quadro de pixels: o cenário andando com a câmera, os dois lutadores, o ki, as
 * faíscas, o placar e os letreiros ("ROUND 1", "LUTEM!", "NOCAUTE").
 *
 * Tudo sai do ESTADO, e nada de evento guardado: a faísca aparece enquanto o quadro do impacto é
 * recente, o tremor idem. É o que deixa a rede voltar no tempo e refazer quadros sem o desenho
 * repetir ou perder nada.
 */
import { spriteDoLutador, personagemDe } from './animacoes.ts';
import { SPRITE } from './boneco.ts';
import { desenharCenario, desenharFrente, type Cenario } from './cenario.ts';
import {
  CORES_DE_KI, QUADROS, desenharAura, desenharBloqueio, desenharEspiral, desenharFaisca, desenharOnda, desenharPoeira,
  desenharRajada, type CoresDeKi,
} from './efeitos.ts';
import { FICHAS, KI_POR_BARRA } from './fichas.ts';
import { escrever, medir } from './fonte.ts';
import { camera } from './luta.ts';
import { CHAO, TELA } from './medidas.ts';
import { desenharPlacar, type LadoDoPlacar } from './placar.ts';
import { colar, cor, criarQuadro, limpar, velar, type Cor, type Quadro } from './quadro.ts';
import { poseDeRetrato, retratoDe } from './retrato.ts';
import { retratoDoPixel } from './pixel/sprites.ts';
import { NOMES_DAS_FORMAS } from './fichas.ts';
import { SUB, type EstadoDaLuta, type IdDoCenario, type IdDoLutador, type Lutador, type Projetil } from './tipos.ts';
import { cenarioCanion } from './cenarios/canion.ts';
import { cenarioIlha } from './cenarios/ilha.ts';
import { cenarioPlaneta } from './cenarios/planeta.ts';
import { cenarioTorneio } from './cenarios/torneio.ts';

const FABRICAS: Record<IdDoCenario, () => Cenario> = {
  torneio: cenarioTorneio, planeta: cenarioPlaneta, ilha: cenarioIlha, canion: cenarioCanion,
};
const cenariosProntos = new Map<IdDoCenario, Cenario>();
/** O cenário montado uma vez: as camadas levam uma fração de segundo para nascer. */
export function cenarioPronto(id: IdDoCenario): Cenario {
  let c = cenariosProntos.get(id);
  if (!c) { c = FABRICAS[id](); cenariosProntos.set(id, c); }
  return c;
}

const retratos = new Map<string, Quadro>();
/**
 * O retrato do placar, na forma em que o lutador está (o Super Goiabadin aparece dourado lá em
 * cima): o do pixel, e o do boneco para quem ainda não tem pixel.
 */
export function retratoPronto(id: IdDoLutador, forma: 0 | 1 = 0): Quadro {
  const chave = `${id}:${forma}`;
  let r = retratos.get(chave);
  if (!r) {
    const p = personagemDe(id);
    r = retratoDoPixel(id, forma) ?? retratoDe(p, 32, { ...poseDeRetrato(p.corpo), forma });
    retratos.set(chave, r);
  }
  return r;
}

/** A aura de quem está transformado, e do grito: dourada nos de cabelo, azul no Blue, laranja no Picolé. */
const CORES_DA_FORMA: Record<IdDoLutador, CoresDeKi> = {
  goiaba: { nucleo: cor('#fffbe0'), meio: cor('#ffe45a'), borda: cor('#f0a81c'), escuro: cor('#8a5208') },
  vegetal: { nucleo: cor('#fffbe0'), meio: cor('#ffe45a'), borda: cor('#f0a81c'), escuro: cor('#8a5208') },
  picole: { nucleo: cor('#fff2dc'), meio: cor('#ffb45a'), borda: cor('#e8661a'), escuro: cor('#7a2e08') },
  geladeira: { nucleo: cor('#fff8d0'), meio: cor('#ffd84a'), borda: cor('#d99a12'), escuro: cor('#6e4a08') },
  goiabaSuper: { nucleo: cor('#ecffff'), meio: cor('#7fe3ff'), borda: cor('#1fa2ee'), escuro: cor('#0c4796') },
  vegetalSuper: { nucleo: cor('#ecffff'), meio: cor('#7fe3ff'), borda: cor('#1fa2ee'), escuro: cor('#0c4796') },
  goteira: { nucleo: cor('#fffbe0'), meio: cor('#ffe45a'), borda: cor('#f0a81c'), escuro: cor('#8a5208') },
};

const PRETO = cor('#000000');
const BRANCO = cor('#ffffff');
const CONTORNO = cor('#1b1022');
const AMARELO = cor('#ffd23a');

const telaX = (xSub: number, camX: number) => Math.round(xSub / SUB) - camX;
const telaY = (ySub: number) => CHAO - Math.round(ySub / SUB);

/** Onde o sprite do lutador é colado, e se vai espelhado. */
function lugarDoSprite(l: Lutador, camX: number): [number, number, boolean] {
  const x = telaX(l.x, camX);
  const espelhar = l.lado === -1;
  return [espelhar ? x - (SPRITE.largura - 1 - SPRITE.ancoraX) : x - SPRITE.ancoraX, telaY(l.y) - SPRITE.ancoraY, espelhar];
}

const coresDe = (e: EstadoDaLuta, p: Projetil): CoresDeKi => CORES_DE_KI[e.lutadores[p.dono].id];

function bolaGrande(q: Quadro, x: number, y: number, raio: number, tique: number, c: CoresDeKi) {
  const pulsa = (tique >> 3) % 2;
  const aneis: [number, Cor][] = [[raio + 2 + pulsa, c.escuro], [raio + pulsa, c.borda], [raio * 0.7, c.meio], [raio * 0.38, c.nucleo]];
  for (const [r, tinta] of aneis) {
    for (let yy = -Math.ceil(r); yy <= r; yy++) {
      for (let xx = -Math.ceil(r); xx <= r; xx++) {
        if (xx * xx + yy * yy <= r * r) {
          const px = x + xx, py = y + yy;
          if (px >= 0 && py >= 0 && px < q.largura && py < q.altura) q.px[py * q.largura + px] = tinta;
        }
      }
    }
  }
}

function desenharProjetil(q: Quadro, e: EstadoDaLuta, p: Projetil, camX: number, tique: number) {
  const c = coresDe(e, p);
  const y = telaY(p.y);
  const x = telaX(p.x, camX);
  const ficha = FICHAS[e.lutadores[p.dono].id];
  const poder = p.tipo === 'rajada' ? ficha.rajada : p.super ? ficha.super : ficha.especial;
  switch (p.tipo) {
    case 'rajada': desenharRajada(q, x, y, tique, c, p.direcao); break;
    case 'bola': bolaGrande(q, x, y, poder.espessura, tique, c); break;
    case 'onda': desenharOnda(q, x, telaX(p.ponta, camX), y, tique, c, p.direcao, poder.espessura * 2 + 2); break;
    case 'espiral': desenharEspiral(q, x, telaX(p.ponta, camX), y, tique, c, p.direcao); break;
    case 'laser': desenharOnda(q, x, telaX(p.ponta, camX), y, tique, c, p.direcao, 6); break;
  }
}

/** Texto grande de letreiro: a fonte pequena, ampliada em blocos, com contorno grosso. */
function letreiro(q: Quadro, texto: string, y: number, tinta: Cor, escala = 3) {
  const largura = medir(texto) + 4;
  const tmp = criarQuadro(largura, 12);
  limpar(tmp, 0);
  escrever(tmp, texto, 2, 3, tinta, { contorno: CONTORNO });
  const x0 = Math.round(TELA.largura / 2 - (largura * escala) / 2);
  for (let yy = 0; yy < tmp.altura; yy++) {
    for (let xx = 0; xx < largura; xx++) {
      const c = tmp.px[yy * largura + xx];
      if (!c) continue;
      for (let dy = 0; dy < escala; dy++) {
        for (let dx = 0; dx < escala; dx++) {
          const px = x0 + xx * escala + dx, py = y + yy * escala + dy;
          if (px >= 0 && py >= 0 && px < q.largura && py < q.altura) q.px[py * q.largura + px] = c;
        }
      }
    }
  }
}

/**
 * Os letreiros moram logo abaixo do placar, e não no meio da tela: com os lutadores 1,5× maiores,
 * a cabeça deles chega perto de y 100, e letreiro no meio tapava justamente quem gritou.
 */
const ALTO = 44;

function letreiroDaFase(q: Quadro, e: EstadoDaLuta, nomes: [string, string]) {
  const f = e.faseQuadro;
  if (e.fase === 'apresentacao') {
    if (f < 58) letreiro(q, `ROUND ${e.round}`, ALTO + 6, BRANCO);
    else letreiro(q, 'LUTEM!', ALTO, AMARELO, 4);
  } else if (e.fase === 'luta' && f < 30) {
    letreiro(q, 'LUTEM!', ALTO, AMARELO, 4);
  } else if (e.fase === 'nocaute' && f < 80) {
    letreiro(q, 'NOCAUTE', ALTO, cor('#ff5a4a'), 4);
  } else if (e.fase === 'tempo') {
    letreiro(q, 'TEMPO!', ALTO, AMARELO, 4);
  } else if (e.fase === 'fimDoRound') {
    const v = e.vencedorDoRound;
    letreiro(q, v === 2 ? 'EMPATE' : `${nomes[v as 0 | 1]} VENCE`, ALTO + 8, BRANCO, 2);
  } else if (e.fase === 'fimDaLuta') {
    const v = e.vencedor;
    letreiro(q, v === 2 ? 'EMPATE' : 'VITÓRIA', ALTO, AMARELO, 4);
    if (v === 0 || v === 1) letreiro(q, nomes[v], ALTO + 50, BRANCO, 2);
  }
}

export type Pintura = {
  /** Os nomes que vão no placar: o do lutador (GOIABA), ou o da pessoa. */
  nomes: [string, string];
  /** Quadros do relógio da tela, para o que se mexe sozinho (plateia, água). */
  tique: number;
};

/** A luta inteira no quadro `q` (do tamanho da TELA). */
export function desenharLuta(q: Quadro, e: EstadoDaLuta, pintura: Pintura) {
  const cen = cenarioPronto(e.config.cenario);
  let camX = camera(e);
  // tremor do golpe forte: dois pixels para lá e para cá nos primeiros quadros
  for (const l of e.lutadores) {
    const idade = e.quadro - l.impactoEm;
    if (l.impactoTipo === 2 && idade >= 0 && idade < 10) camX += idade % 4 < 2 ? 2 : -2;
  }
  const tique = pintura.tique;
  desenharCenario(q, cen, camX, tique);
  // clarão da super: o mundo escurece e só quem solta fica aceso
  if (e.clarao > 0) velar(q, PRETO, e.clarao > 38 ? 0.3 : 0.55);

  // quem ataca vai por cima de quem apanha
  const ordem = [...e.lutadores].sort((a, b) => Number(ehAtaque(a)) - Number(ehAtaque(b)));
  for (const l of ordem) {
    const s = spriteDoLutador(l, e);
    const [x, y, espelhar] = lugarDoSprite(l, camX);
    if (l.acao === 'transformando') desenharAura(q, s, x, y, espelhar, tique, CORES_DA_FORMA[l.id]);
    else if (l.acao === 'carregando' || (l.acao === 'super' && e.clarao > 0)) desenharAura(q, s, x, y, espelhar, tique, l.forma ? CORES_DA_FORMA[l.id] : CORES_DE_KI[l.id]);
    // transformado, a aura fica acesa em volta, mais baixa: pisca de 4 em 4 quadros, que é o jeito do fliperama
    else if (l.forma === 1 && (tique >> 2) % 3 !== 0) desenharAura(q, s, x, y, espelhar, tique, CORES_DA_FORMA[l.id]);
    const idade = e.quadro - l.impactoEm;
    const pisca = (l.impactoTipo === 1 || l.impactoTipo === 2) && idade >= 0 && idade < 3;
    const invisivel = l.invencivel > 0 && l.acao === 'levantando' && (tique >> 2) % 2 === 0;
    if (!invisivel) colar(q, s, x, y, espelhar, pisca ? BRANCO : null);
    if (l.acao === 'pouso' && l.quadro < QUADROS.poeira) desenharPoeira(q, telaX(l.x, camX), CHAO, l.quadro);
    if (l.acao === 'caido' && l.quadro < QUADROS.poeira) desenharPoeira(q, telaX(l.x, camX), CHAO, l.quadro);
  }
  for (const p of e.projeteis) desenharProjetil(q, e, p, camX, tique);
  for (const l of e.lutadores) {
    const idade = e.quadro - l.impactoEm;
    if (idade < 0 || l.impactoTipo === 0) continue;
    const x = l.impactoX - camX, y = CHAO - l.impactoY;
    if (l.impactoTipo === 3) { if (idade < QUADROS.bloqueio) desenharBloqueio(q, x, y, idade); }
    else if (idade < QUADROS.faiscaForte) desenharFaisca(q, x, y, idade, l.impactoTipo === 2);
  }
  desenharFrente(q, cen, camX);

  // transformado, o placar diz o nome da forma e mostra o retrato dela
  const nomes = e.lutadores.map((l, i) => (l.forma === 1 ? NOMES_DAS_FORMAS[l.id].toUpperCase() : pintura.nomes[i])) as [string, string];
  const lado = (i: 0 | 1): LadoDoPlacar => {
    const l = e.lutadores[i];
    const vida = FICHAS[l.id].vida;
    return {
      nome: nomes[i],
      retrato: retratoPronto(l.id, l.forma),
      vida: l.vida / vida,
      vidaAtrasada: l.vidaAtrasada / vida,
      ki: l.ki / KI_POR_BARRA,
      vitorias: l.vitorias,
      piscar: l.ki >= 300 && (tique >> 4) % 2 === 0,
    };
  };
  desenharPlacar(q, { tempo: Math.ceil(e.tempo / 60), rodada: e.round, lados: [lado(0), lado(1)] }, 'a');
  letreiroDaFase(q, e, pintura.nomes);
  // o nome da transformação no instante em que ela completa: "SUPER GOIABADIN!"
  for (const l of e.lutadores) {
    const idade = e.quadro - l.formaDesde;
    if (l.forma === 1 && idade >= 0 && idade < 90 && e.fase === 'luta') {
      letreiro(q, `${NOMES_DAS_FORMAS[l.id].toUpperCase()}!`, ALTO + 8, cor('#ffe45a'), 2);
    }
  }
}

const ehAtaque = (l: Lutador) => /^(soco|chute|rasteira|rajada|especial|super)/.test(l.acao);
