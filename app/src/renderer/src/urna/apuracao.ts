/**
 * A apuração da Saga: os votos de todo mundo do servidor, somados, do mais votado para o menos. O
 * voto é secreto como o de verdade — aparece quanto cada chapa tem, nunca quem votou em quem.
 * Branco e nulo contam no total e vêm no fim, fora da disputa.
 */
import { type Quadro, colar, cor, retangulo } from '../dragao/quadro.ts';
import { escrever } from '../dragao/fonte.ts';
import { type Regiao, H, W, caber, rostoPequeno } from './comum.ts';
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
  barra: cor('#3fae5a'), barraFundo: cor('#0b1a2c'), contorno: cor('#060d17'),
};

/** A ordem da apuração: mais votos primeiro, empate pelo número; branco e nulo no fim. */
export function ordenar(contagem: Contagem[]): Contagem[] {
  const votos = new Map(contagem.map((c) => [c.numero, c.votos]));
  const chapas = CANDIDATOS.map((c) => ({ numero: c.numero, votos: votos.get(c.numero) ?? 0 }))
    .sort((a, b) => b.votos - a.votos || a.numero - b.numero);
  return [...chapas, { numero: 'branco', votos: votos.get('branco') ?? 0 }, { numero: 'nulo', votos: votos.get('nulo') ?? 0 }];
}

function botao(q: Quadro, rotulo: string, x: number, y: number, l: number, aceso: boolean) {
  retangulo(q, x - 1, y - 1, l + 2, 13, C.contorno);
  retangulo(q, x, y, l, 11, aceso ? C.ouro : C.linha);
  escrever(q, rotulo, x + l / 2, y + 3, aceso ? C.contorno : C.texto, { alinhar: 'centro' });
}

export function desenharApuracao(q: Quadro, d: DadosDaApuracao): Regiao[] {
  retangulo(q, 0, 0, W, H, C.fundo);
  escrever(q, 'APURAÇÃO DA SAGA', W / 2, 6, C.ouro, { tamanho: 'grande', alinhar: 'centro', contorno: C.contorno });
  const lista = ordenar(d.contagem);
  const total = lista.reduce((s, c) => s + c.votos, 0);
  const sub = d.aviso ? caber(d.aviso, W - 16)
    : d.carregando ? 'CONTANDO OS VOTOS...' : `${total} ${total === 1 ? 'VOTO' : 'VOTOS'} NO SERVIDOR - VOTO SECRETO`;
  escrever(q, sub, W / 2, 24, d.aviso ? C.bronze : C.apagado, { alinhar: 'centro' });
  const maior = Math.max(1, ...lista.map((c) => c.votos));
  const porColuna = 8, alt = 20, x0 = [8, 196], y0 = 34, largura = 180;
  lista.forEach((c, i) => {
    const x = x0[i < porColuna ? 0 : 1], y = y0 + (i % porColuna) * alt;
    const ehChapa = typeof c.numero === 'number';
    retangulo(q, x, y, largura, alt - 2, i % 2 ? C.fundo : C.fundoClaro);
    // Empate divide a posição: quem tem os mesmos votos tem o mesmo lugar.
    const pos = ehChapa && c.votos > 0 ? 1 + lista.filter((o) => typeof o.numero === 'number' && o.votos > c.votos).length : 0;
    const corPos = pos === 1 ? C.ouro : pos === 2 ? C.prata : pos === 3 ? C.bronze : C.apagado;
    if (pos) escrever(q, `${pos}`, x + 8, y + 7, corPos, { alinhar: 'centro' });
    if (typeof c.numero === 'number') {
      const r = rostoPequeno(c.numero);
      if (r) {
        retangulo(q, x + 15, y + 1, 17, 17, pos && pos <= 3 ? corPos : C.linha);
        colar(q, r, x + 16, y + 2);
      }
      const chapa = CANDIDATOS.find((k) => k.numero === c.numero)!;
      escrever(q, `${c.numero}`, x + 36, y + 3, C.apagado);
      escrever(q, caber(chapa.nome, 104), x + 50, y + 3, C.texto);
    } else {
      escrever(q, c.numero === 'branco' ? 'BRANCO' : 'NULO', x + 36, y + 3, C.apagado);
    }
    const pct = total ? Math.round((c.votos / total) * 100) : 0;
    const direita = `${c.votos}`;
    escrever(q, direita, x + largura - 4, y + 3, C.texto, { alinhar: 'direita' });
    const barraL = largura - 36 - 30;
    retangulo(q, x + 36, y + 11, barraL, 3, C.barraFundo);
    retangulo(q, x + 36, y + 11, Math.round((barraL * c.votos) / maior), 3, pos === 1 ? C.ouro : ehChapa ? C.barra : C.apagado);
    escrever(q, `${pct}%`, x + largura - 4, y + 11, C.apagado, { alinhar: 'direita' });
  });
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
