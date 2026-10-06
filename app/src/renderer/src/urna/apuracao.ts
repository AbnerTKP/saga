/**
 * A apuração da Saga no 2º turno: os votos de todo mundo, de todos os servidores, somados, com as duas
 * chapas frente a frente — o rosto grande, o número, a porcentagem dos votos válidos (a conta do TSE:
 * branco e nulo ficam fora) — e o cabo de guerra embaixo, cada chapa do lado dela. O voto é secreto
 * como o de verdade: aparece quanto cada chapa tem, nunca quem votou em quem.
 *
 * No 1º turno eram treze chapas numa lista do mais votado para o menos; com duas, a lista sobrava
 * vazia e não dizia o que interessa, que é quem está na frente e por quanto.
 */
import { type Cor, type Quadro, cor, retangulo } from '../dragao/quadro.ts';
import { escrever } from '../dragao/fonte.ts';
import { type Regiao, H, W, ampliar, caber, rosto } from './comum.ts';
import { CANDIDATOS } from './candidatos.ts';

export type Contagem = { numero: number | 'branco' | 'nulo'; votos: number };

export type DadosDaApuracao = {
  contagem: Contagem[];
  /** Quantas vezes VOCÊ votou, só para você. */
  meus: number;
  selecionado: 0 | 1;
  /** Enquanto a primeira resposta do servidor não chegou. */
  carregando: boolean;
  /** O que deu errado ao mandar o voto ("a urna ainda está gravando…"), no lugar do subtítulo. */
  aviso?: string | null;
};

const C = {
  fundo: cor('#10233b'), fundoClaro: cor('#173152'), linha: cor('#224a75'), borda: cor('#f4f1e6'),
  texto: cor('#f4f1e6'), apagado: cor('#8fa6c2'), ouro: cor('#f2c230'), prata: cor('#c9d1da'), bronze: cor('#d68a4c'),
  barraFundo: cor('#0b1a2c'), contorno: cor('#060d17'),
};

/** A ordem da apuração: mais votos primeiro, empate pelo número; branco e nulo no fim. */
export function ordenar(contagem: Contagem[]): Contagem[] {
  const votos = new Map(contagem.map((c) => [c.numero, c.votos]));
  const chapas = CANDIDATOS.map((c) => ({ numero: c.numero, votos: votos.get(c.numero) ?? 0 }))
    .sort((a, b) => b.votos - a.votos || a.numero - b.numero);
  return [...chapas, { numero: 'branco', votos: votos.get('branco') ?? 0 }, { numero: 'nulo', votos: votos.get('nulo') ?? 0 }];
}

/**
 * A porcentagem de cada chapa sobre os votos VÁLIDOS, arredondada sem passar de 100 somadas: quem tem
 * o resto maior leva o ponto que sobra. Sem voto válido, zero para todos.
 */
export function porcentagens(votos: number[]): number[] {
  const validos = votos.reduce((s, v) => s + v, 0);
  if (!validos) return votos.map(() => 0);
  const exatas = votos.map((v) => (v * 100) / validos);
  const r = exatas.map(Math.floor);
  let falta = 100 - r.reduce((s, v) => s + v, 0);
  const porResto = exatas.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of porResto) if (falta-- > 0) r[i] += 1;
  return r;
}

function botao(q: Quadro, rotulo: string, x: number, y: number, l: number, aceso: boolean) {
  retangulo(q, x - 1, y - 1, l + 2, 13, C.contorno);
  retangulo(q, x, y, l, 11, aceso ? C.ouro : C.linha);
  escrever(q, rotulo, x + l / 2, y + 3, aceso ? C.contorno : C.texto, { alinhar: 'centro' });
}

export function desenharApuracao(q: Quadro, d: DadosDaApuracao): Regiao[] {
  retangulo(q, 0, 0, W, H, C.fundo);
  escrever(q, 'APURAÇÃO DA SAGA', W / 2, 6, C.ouro, { tamanho: 'grande', alinhar: 'centro', contorno: C.contorno });
  const votos = new Map(d.contagem.map((c) => [c.numero, c.votos]));
  const chapas = CANDIDATOS.map((c) => ({ ...c, votos: votos.get(c.numero) ?? 0 }));
  const brancos = votos.get('branco') ?? 0, nulos = votos.get('nulo') ?? 0;
  const total = chapas.reduce((s, c) => s + c.votos, 0) + brancos + nulos;
  const pct = porcentagens(chapas.map((c) => c.votos));
  const maior = Math.max(...chapas.map((c) => c.votos));
  const empate = maior > 0 && chapas.every((c) => c.votos === maior);
  const sub = d.aviso ? caber(d.aviso, W - 16)
    : d.carregando ? 'CONTANDO OS VOTOS...' : `2º TURNO - ${total} ${total === 1 ? 'VOTO' : 'VOTOS'} NA SAGA - VOTO SECRETO`;
  escrever(q, sub, W / 2, 24, d.aviso ? C.bronze : C.apagado, { alinhar: 'centro' });

  // As duas chapas, cada uma no seu lado, sempre na ordem do número: frente a frente não troca de lado.
  const cl = 176, ca = 112, cy = 36;
  chapas.slice(0, 2).forEach((c, i) => {
    const cx = i === 0 ? 12 : W - 12 - cl;
    const frente = !empate && c.votos === maior && maior > 0;
    const destaque: Cor = frente ? C.ouro : C.linha;
    retangulo(q, cx - 1, cy - 1, cl + 2, ca + 2, destaque);
    retangulo(q, cx, cy, cl, ca, C.fundoClaro);
    const r = rosto(c.numero, 'titular');
    if (r) {
      retangulo(q, cx + 7, cy + 7, r.largura * 2 + 2, Math.min(r.altura * 2, ca - 16) + 2, frente ? C.ouro : C.contorno);
      // Do retrato de 30x42 em dobro, só os 96 de cima: o resto é paletó e passava da moldura.
      const corte = { ...r, altura: Math.min(r.altura, (ca - 16) / 2), px: r.px.subarray(0, r.largura * Math.min(r.altura, (ca - 16) / 2)) };
      ampliar(q, corte, cx + 8, cy + 8, 2);
    }
    const tx = cx + 76;
    escrever(q, String(c.numero), tx, cy + 9, C.texto, { tamanho: 'grande' });
    if (frente || empate) escrever(q, empate ? 'EMPATE' : 'NA FRENTE', cx + cl - 6, cy + 9, frente ? C.ouro : C.prata, { alinhar: 'direita' });
    escrever(q, caber(c.nome, cl - 82), tx, cy + 30, C.texto);
    escrever(q, c.partido, tx, cy + 39, C.apagado);
    escrever(q, `${pct[i]}%`, tx, cy + 56, frente ? C.ouro : C.texto, { tamanho: 'grande' });
    escrever(q, `${c.votos} ${c.votos === 1 ? 'VOTO' : 'VOTOS'}`, tx, cy + 76, C.apagado);
    escrever(q, 'DOS VÁLIDOS', tx, cy + 85, C.apagado);
  });

  // O cabo de guerra: a barra inteira são os votos válidos, cada lado puxando do seu canto.
  const bx = 12, by = 156, bl = W - 24;
  retangulo(q, bx - 1, by - 1, bl + 2, 10, C.contorno);
  retangulo(q, bx, by, bl, 8, C.barraFundo);
  const validos = chapas[0].votos + (chapas[1]?.votos ?? 0);
  if (validos) {
    const esq = Math.round((bl * chapas[0].votos) / validos);
    const cores = chapas.map((c) => (empate ? C.prata : c.votos === maior ? C.ouro : C.apagado));
    retangulo(q, bx, by, esq, 8, cores[0]);
    retangulo(q, bx + esq, by, bl - esq, 8, cores[1]);
  }
  // O meio: quem passa dele ganha.
  retangulo(q, W / 2, by - 3, 1, 14, C.texto);
  escrever(q, `BRANCOS ${brancos}  -  NULOS ${nulos}`, W / 2, by + 15, C.apagado, { alinhar: 'centro' });

  const minha = d.meus === 0 ? 'VOCÊ AINDA NÃO VOTOU' : `VOCÊ VOTOU ${d.meus} ${d.meus === 1 ? 'VEZ' : 'VEZES'}`;
  escrever(q, minha, 8, 201, C.apagado);
  const regioes: Regiao[] = [];
  const lb = 92, ls = 50;
  const xb = W - 8 - ls - 8 - lb, xs = W - 8 - ls;
  botao(q, 'VOTAR DE NOVO', xb, 198, lb, d.selecionado === 0);
  botao(q, 'SAIR', xs, 198, ls, d.selecionado === 1);
  regioes.push({ x: xb, y: 197, l: lb, a: 13, alvo: { tipo: 'votarDeNovo' } });
  regioes.push({ x: xs, y: 197, l: ls, a: 13, alvo: { tipo: 'sair' } });
  return regioes;
}
