// Os avisos vão dentro do app, não no servidor: somam uns 40 KB, e um aviso que precisa
// ser baixado chega depois do fato que ele anuncia. O Vite troca cada import pela URL.
import entrou from './entrou.ogg';
import saiu from './saiu.ogg';
import live from './live.ogg';
// Duas notas subindo, feitas aqui (ffmpeg, senoides com decaimento), no volume médio do
// "entrou": é um chamado, e não pode assustar mais que alguém chegando na call.
import convite from './convite.ogg';
import type { Aviso } from '../avisos';

export const ARQUIVOS: Record<Aviso, string> = { entrou, saiu, live, convite };
