// Os avisos vão dentro do app, não no servidor: somam uns 95 KB, e um aviso que precisa
// ser baixado chega depois do fato que ele anuncia. O Vite troca cada import pela URL.
// ENTRAR NA CALL (26/10/2026, o dono pediu "mais alto"): a mesma gravação de antes, o blup em
// mi4, que era o mais baixo da família (−15,6 LUFS de momentânea máxima). Das três opções da
// prancheta de ouvir, o dono escolheu esta (27/10): a gravação tratada, não refeita. `highpass=f=140`,
// `asoftclip=type=tanh:threshold=0.5`, `equalizer=f=1300:t=q:w=1.2:g=3`,
// `acompressor=threshold=-24dB:ratio=3:attack=4:release=90`, pico −1 dB, Opus 96k: −12,8 LUFS.
// Volume próprio em `VOLUME_DA_ENTRADA` (avisos.ts).
import entrou from './entrou.ogg';
import saiu from './saiu.ogg';
import live from './live.ogg';
// O CONVITE é um chamado (ver `CHAMADOS` em avisos.ts): as duas notas subindo de sempre,
// ré5 → lá5, chamando DUAS vezes como telefone, com a oitava e a quinta de cima no timbre para
// atravessar o som de um jogo. Pico a -1 dB, 2,2 s. Era uma vez só, a -6 dB, no volume baixo:
// o dono pediu "um som mais evidente" (06/10/2026).
import convite from './convite.ogg';
// Os sete abaixo nasceram do mesmo jeito e da mesma família — senoides curtas com
// decaimento, entre 400 e 1400 Hz, pico a -3 dB como os de cima. Duas regras que o
// desenho impôs e o espectrograma cobrou:
//
//  - ENTRAR é claro e SAIR é escuro. Na live, si5 → mi6 subindo contra mi5 → si4
//    descendo (com a oitava abaixo, que é o que dá peso); no microfone, o mesmo gesto
//    mais curto e 6 dB mais baixo, porque ele toca o dia inteiro e não anuncia nada —
//    só confirma o que a sua mão acabou de fazer.
//  - a nota não pode ser cortada antes de o decaimento morrer: o corte vira estalo, e
//    aparece no espectrograma como um risco de cima a baixo que o `entrou.ogg` não tem.
import liveEntrou from './live-entrou.ogg';
import liveSaiu from './live-saiu.ogg';
import micLigou from './mic-ligou.ogg';
import micMutou from './mic-mutou.ogg';
// Um SINO, e não notas: notas é o convite, e os dois chegam pelo canto da tela — precisam ser
// distinguíveis de ouvido, sem olhar. Também é chamado desde 06/10/2026: dois toques subindo
// uma quinta (lá5 → mi6), com as parciais de metal (2,76× e 5,40× a fundamental) que é o que
// faz "ding" e passa por cima de um jogo. Pico a -1 dB, 1,7 s.
import mensagem from './mensagem.ogg';
// O lance é MADEIRA, não nota: estalo de ruído com um baque grave embaixo. Fica 4 dB
// abaixo dos avisos porque toca a cada jogada do outro.
import lance from './lance.ogg';
import fimDaPartida from './fim-da-partida.ogg';
// Alguém começou a assistir à SUA live (20/10/2026, escolhido de ouvido na prancheta entre três):
// três gotas subindo, sol5 · si5 · ré6, a 75 ms uma da outra — "chegou gente". Não se confunde
// com entrar na call (o grave) nem com a live começando (si5 → mi6). Feito pelo mesmo caminho dos
// outros: senoides com a oitava e a duodécima fracas, ataque em cosseno de 12 ms, cada nota
// durando 8/decaimento, PCM em float e o ganho medido para o pico de -3 dB (EBU R128: -13,4 LUFS).
// Toca no volume dos chamados (ver `CHAMADOS` em avisos.ts).
import plateia from './plateia.ogg';
import type { Aviso } from '../avisos';

export const ARQUIVOS: Record<Aviso, string> = {
  entrou, saiu, live, convite,
  liveEntrou, liveSaiu, micLigou, micMutou, mensagem, lance, fimDaPartida, plateia,
};
