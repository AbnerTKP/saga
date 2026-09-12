// Os avisos vão dentro do app, não no servidor: somam uns 95 KB, e um aviso que precisa
// ser baixado chega depois do fato que ele anuncia. O Vite troca cada import pela URL.
import entrou from './entrou.ogg';
import saiu from './saiu.ogg';
import live from './live.ogg';
// Duas notas subindo, feitas aqui (ffmpeg, senoides com decaimento), no volume médio do
// "entrou": é um chamado, e não pode assustar mais que alguém chegando na call.
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
// Um sino curto, e não duas notas: duas notas é o convite, e os dois chegam pelo canto
// da tela — precisam ser distinguíveis de ouvido, sem olhar.
import mensagem from './mensagem.ogg';
// O lance é MADEIRA, não nota: estalo de ruído com um baque grave embaixo. Fica 4 dB
// abaixo dos avisos porque toca a cada jogada do outro.
import lance from './lance.ogg';
import fimDaPartida from './fim-da-partida.ogg';
import type { Aviso } from '../avisos';

export const ARQUIVOS: Record<Aviso, string> = {
  entrou, saiu, live, convite,
  liveEntrou, liveSaiu, micLigou, micMutou, mensagem, lance, fimDaPartida,
};
