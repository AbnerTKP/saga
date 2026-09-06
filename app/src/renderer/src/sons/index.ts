// Os três avisos vão dentro do app, não no servidor: somam 30 KB, e um aviso que precisa
// ser baixado chega depois do fato que ele anuncia. O Vite troca cada import pela URL.
import entrou from './entrou.ogg';
import saiu from './saiu.ogg';
import live from './live.ogg';
import type { Aviso } from '../avisos';

export const ARQUIVOS: Record<Aviso, string> = { entrou, saiu, live };
