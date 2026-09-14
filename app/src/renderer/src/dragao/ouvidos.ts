/**
 * O que a luta tem a dizer em som neste quadro: golpe que acabou de entrar, ki que acabou de
 * sair, round que começou. Sai do estado, com uma chave por acontecimento — o quadro refeito pela
 * rede passa pela mesma chave e não toca de novo.
 */
import type { SomDaLuta } from './sons.ts';
import { camera } from './luta.ts';
import { TELA } from './medidas.ts';
import { SUB, type EstadoDaLuta } from './tipos.ts';

export type Toque = { som: SomDaLuta; pan: number };

export function sonsNovos(e: EstadoDaLuta, vistos: Set<string>): Toque[] {
  const saida: Toque[] = [];
  const camX = camera(e);
  const pan = (xSub: number) => ((xSub / SUB - camX) / TELA.largura) * 2 - 1;
  const novo = (chave: string, som: SomDaLuta, p = 0) => {
    if (vistos.has(chave)) return;
    vistos.add(chave);
    saida.push({ som, pan: p });
  };
  e.lutadores.forEach((l, i) => {
    const outro = e.lutadores[1 - i];
    if (l.impactoTipo && e.quadro - l.impactoEm < 4) {
      const som: SomDaLuta = l.impactoTipo === 3 ? 'defesa' : l.impactoTipo === 2 ? 'forte' : outro.acao.startsWith('chute') || outro.acao === 'rasteira' ? 'chute' : 'soco';
      novo(`i${i}:${l.impactoEm}`, som, pan(l.x));
    }
    if (l.acao === 'sumindo' && l.quadro < 3) novo(`s${i}:${e.quadro - l.quadro}`, 'sumir', pan(l.x));
  });
  for (const p of e.projeteis) novo(`p${p.id}`, p.tipo === 'rajada' ? 'rajada' : 'raio', pan(p.x));
  if (e.fase === 'apresentacao' && e.faseQuadro < 10) novo(`r${e.round}`, 'round');
  if (e.fase === 'apresentacao' && e.faseQuadro >= 58) novo(`l${e.round}`, 'lutem');
  if (e.fase === 'nocaute') novo(`k${e.round}`, 'nocaute');
  if (e.fase === 'fimDaLuta') novo('fim', 'vitoria');
  if (vistos.size > 400) {
    // só se esquece o que ficou para trás de vez: os de impacto e projétil antigos
    const lista = [...vistos];
    for (const k of lista.slice(0, 200)) vistos.delete(k);
  }
  return saida;
}
