/**
 * Qual bandeira a faixa do alto mostra agora. Uma de cada vez, pela ordem do que importa mais
 * para quem está pilotando: a quadriculada (acabou), a preta e branca (você cortou), a amarela
 * (tem carro parado à frente), a azul (vão te dar uma volta) e a verde (valendo).
 *
 * É conta pura: a tela diz o que sabe de cada carro, e isto diz o que mostrar.
 */

export type TipoDeBandeira = 'verde' | 'amarela' | 'azul' | 'pretaebranca' | 'quadriculada';
export type Bandeira = { tipo: TipoDeBandeira; titulo: string; texto: string };

/** Quanto tempo a preta e branca fica na faixa depois do corte. */
export const DURACAO_DO_AVISO_DE_CORTE = 4000;
/** Até onde, à frente, um carro parado vira amarela. */
export const ALCANCE_DA_AMARELA = 1800;
/** Quanto atrás está quem vai dar a volta quando a azul aparece. */
export const ALCANCE_DA_AZUL = 450;
/** Abaixo disto, carro é carro parado. */
export const PARADO = 50;

export type CarroNaBandeira = { nome: string; progresso: number; velocidade: number; chegouEm: number | null };

const mod = (a: number, m: number) => ((a % m) + m) % m;
const segundos = (ms: number) => `${Math.round(ms / 1000)} s`;

export function bandeiraDaVez({ tempo, volta, eu, outros }: {
  tempo: number;
  /** O comprimento de uma volta da pista. */
  volta: number;
  /** O meu carro, se estou pilotando. Quem assiste não tem. */
  eu: (CarroNaBandeira & { corteEm: number | null; punicao: number }) | null;
  outros: CarroNaBandeira[];
}): Bandeira | null {
  if (tempo < 0) return null;
  if (eu?.chegouEm != null) return { tipo: 'quadriculada', titulo: 'Bandeirada', texto: 'Você cruzou a linha' };
  if (!eu && outros.some((o) => o.chegouEm !== null)) return { tipo: 'quadriculada', titulo: 'Bandeirada', texto: 'O líder cruzou a linha' };

  if (eu && eu.corteEm !== null && tempo - eu.corteEm < DURACAO_DO_AVISO_DE_CORTE) {
    const total = eu.punicao > 3000 ? ` · ${segundos(eu.punicao)} no total` : '';
    return { tipo: 'pretaebranca', titulo: 'Limite de pista', texto: `Cortou caminho · +3 s no seu tempo${total}` };
  }

  // Na largada todo mundo está devagar: a amarela só vale depois de a corrida andar.
  if (tempo > 5000) {
    const parados = outros.filter((o) => o.chegouEm === null && Math.abs(o.velocidade) < PARADO);
    const aFrente = eu
      ? parados.filter((o) => { const d = mod(o.progresso - eu.progresso, volta); return d > 0 && d < ALCANCE_DA_AMARELA; })
      : parados;
    if (aFrente.length > 0) {
      return { tipo: 'amarela', titulo: 'Bandeira amarela', texto: eu ? `${aFrente[0].nome} parado à frente · cuidado` : `${aFrente[0].nome} parado na pista` };
    }
  }

  if (eu) {
    const vaiDarVolta = outros.find((o) => o.chegouEm === null && o.progresso - eu.progresso > volta / 2
      && mod(eu.progresso - o.progresso, volta) > 0 && mod(eu.progresso - o.progresso, volta) < ALCANCE_DA_AZUL);
    if (vaiDarVolta) return { tipo: 'azul', titulo: 'Bandeira azul', texto: `${vaiDarVolta.nome} vai te dar uma volta · deixe passar` };
  }

  if (tempo < 3500) return { tipo: 'verde', titulo: 'Bandeira verde', texto: 'Valendo!' };
  return null;
}
