/**
 * O que a luta tem a dizer em som neste quadro: golpe que acabou de entrar, ki que acabou de
 * sair, round que começou, grito de transformação. Sai do estado, com uma chave por acontecimento
 * — o quadro refeito pela rede passa pela mesma chave e não toca de novo.
 *
 * Alguns sons são sintetizados (`sons.ts`) e outros são gravações (`somDeArquivo`, na tela): o
 * grito, o estouro da transformação, o teletransporte e os raios. Os gravados podem PARAR: o grito
 * dura enquanto o lutador grita, e cala quando a transformação completa ou quando ele apanha.
 */
import type { SomDaLuta } from './sons.ts';
import { FICHAS, ehGolpeDeCorpo } from './fichas.ts';
import { camera } from './luta.ts';
import { TELA } from './medidas.ts';
import { SUB, type EstadoDaLuta } from './tipos.ts';

export type SomGravado = 'grito' | 'transformacao' | 'teletransporte' | 'raio-carga' | 'raio-disparo' | 'dedo-carga' | 'dedo-picole' | 'dedo-geladeira'
  | 'golpe-soco' | 'golpe-chute' | 'golpe-defesa' | 'golpe-forte' | 'golpe-ar' | 'disparo-ki' | 'aura-ki';

export type Toque = { som: SomDaLuta | SomGravado; pan: number; /** quem pode ser calado depois */ chave?: string };

/** O que tocar agora, e os sons longos que devem calar. */
export function sonsNovos(e: EstadoDaLuta, vistos: Set<string>): Toque[] & { calar?: string[] } {
  const saida: Toque[] & { calar?: string[] } = [];
  const calar: string[] = [];
  const camX = camera(e);
  const pan = (xSub: number) => ((xSub / SUB - camX) / TELA.largura) * 2 - 1;
  const novo = (chave: string, som: Toque['som'], p = 0, longo?: string) => {
    if (vistos.has(chave)) return;
    vistos.add(chave);
    saida.push({ som, pan: p, chave: longo });
  };
  e.lutadores.forEach((l, i) => {
    const outro = e.lutadores[1 - i];
    if (l.impactoTipo && e.quadro - l.impactoEm < 4) {
      // Golpe que entrou é uma gravação de soco ou de chute (pelo que o outro está fazendo), o
      // forte tem a sua, e o defendido também — antes era um estalo sintetizado que ninguém ouvia.
      const chute = outro.acao.startsWith('chute') || outro.acao === 'rasteira';
      const som: SomGravado = l.impactoTipo === 3 ? 'golpe-defesa' : l.impactoTipo === 2 ? 'golpe-forte' : chute ? 'golpe-chute' : 'golpe-soco';
      novo(`i${i}:${l.impactoEm}`, som, pan(l.x));
    }
    const comeco = e.quadro - l.quadro;
    // Golpe no ar: passou o primeiro quadro que acerta e não encostou em ninguém, toca o vento,
    // oco. Encostando, quem fala é o impacto — os dois juntos embolavam o soco.
    if (ehGolpeDeCorpo(l.acao) && !l.acertou) {
      const g = FICHAS[l.id].golpes[l.acao];
      if (l.quadro > g.inicio && l.quadro <= g.inicio + g.ativo) novo(`v${i}:${comeco}`, 'golpe-ar', pan(l.x));
    }
    if (l.acao === 'sumindo' && l.quadro < 3) novo(`s${i}:${comeco}`, 'teletransporte', pan(l.x));
    // O grito vale enquanto ele grita: começou a gritar, toca; parou (virou, ou apanhou), cala.
    if (l.acao === 'transformando') novo(`t${i}:${comeco}`, 'grito', pan(l.x), `grito${i}`);
    else calar.push(`grito${i}`);
    // A aura com raios enquanto segura o carregar; soltou, cala.
    if (l.acao === 'carregando') novo(`a${i}:${comeco}`, 'aura-ki', pan(l.x), `aura${i}`);
    else calar.push(`aura${i}`);
    if (l.forma === 1 && e.quadro - l.formaDesde < 8) novo(`f${i}:${l.formaDesde}`, 'transformacao', pan(l.x));
    // A carga do raio: mãos para trás no Goiaba e no Vegetal, dedos na testa no Picolé. O Raio
    // Congelante da Geladeira sai quase na hora: não tem carga para ouvir.
    if ((l.acao === 'especial' || l.acao === 'super') && l.quadro < 4) {
      if (l.id === 'goiaba' || l.id === 'vegetal') novo(`c${i}:${comeco}`, 'raio-carga', pan(l.x));
      else if (l.id === 'picole') novo(`c${i}:${comeco}`, 'dedo-carga', pan(l.x));
    }
  });
  for (const p of e.projeteis) {
    const som: Toque['som'] = p.tipo === 'rajada' ? 'disparo-ki' : p.tipo === 'espiral' ? 'dedo-picole' : p.tipo === 'laser' ? 'dedo-geladeira' : 'raio-disparo';
    novo(`p${p.id}`, som, pan(p.x));
  }
  if (e.fase === 'apresentacao' && e.faseQuadro < 10) novo(`r${e.round}`, 'round');
  if (e.fase === 'apresentacao' && e.faseQuadro >= 58) novo(`l${e.round}`, 'lutem');
  if (e.fase === 'nocaute') novo(`k${e.round}`, 'nocaute');
  if (e.fase === 'fimDaLuta') novo('fim', 'vitoria');
  if (vistos.size > 400) {
    const lista = [...vistos];
    for (const k of lista.slice(0, 200)) vistos.delete(k);
  }
  saida.calar = calar;
  return saida;
}
