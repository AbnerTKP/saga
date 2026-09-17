/**
 * O botão "Relatar", sem tela: onde a pessoa estava e o que vai para o servidor.
 *
 * A caixa do relato mora na faixa do alto da janela — acima de toda tela, fora do `App` no
 * Windows —, então ela não tem como perguntar ao `App` em que tela a pessoa está. É o `App`
 * que ANOTA aqui, a cada troca, e a caixa lê na hora de montar o relato.
 */
export type TipoDeRelato = 'erro' | 'melhoria';

/** Do fim do registro: é onde está o que acabou de acontecer. O servidor corta no mesmo tamanho. */
export const REGISTRO_MAXIMO = 60_000;
export const TEXTO_MAXIMO = 4000;

let onde = { tela: 'entrada', servidor: null as string | null };

export function anotarOnde(tela: string, servidor: string | null) {
  onde = { tela, servidor };
}
export const ondeEstou = () => onde;

/** A tela em palavras, para quem vai ler o relato: "sala Geral", "Fórmula 1", "conversas". */
export function descreverTela(o: {
  logado: boolean; semServidor: boolean; jogo: 'xadrez' | 'corrida' | 'luta' | 'urna' | null; conversas: boolean; sala: string | null;
}): string {
  if (!o.logado) return 'entrada';
  if (o.semServidor) return 'tela inicial';
  if (o.jogo === 'corrida') return 'Fórmula 1';
  if (o.jogo === 'luta') return 'Dragão Quadrado';
  if (o.jogo === 'urna') return 'Urna';
  if (o.jogo === 'xadrez') return 'xadrez';
  if (o.conversas) return 'conversas';
  return o.sala ? `sala ${o.sala}` : 'servidor';
}

export type CorpoDoRelato = {
  tipo: TipoDeRelato;
  texto: string;
  contexto: { versao: string | null; sistema: string | null; servidor: string | null; tela: string };
  registro: string | null;
};

/** O que vai para `POST /relatos`. O registro só vai no erro, e só se a pessoa deixou marcado. */
export function montarRelato(o: {
  tipo: TipoDeRelato; texto: string; anexarRegistro: boolean; registro: string | null;
  versao: string | null; sistema: string | null; servidor: string | null; tela: string;
}): CorpoDoRelato {
  const registro = o.tipo === 'erro' && o.anexarRegistro && o.registro?.trim()
    ? o.registro.slice(-REGISTRO_MAXIMO)
    : null;
  return {
    tipo: o.tipo,
    texto: o.texto.trim().slice(0, TEXTO_MAXIMO),
    contexto: { versao: o.versao, sistema: o.sistema, servidor: o.servidor, tela: o.tela },
    registro,
  };
}

/** O servidor recusa com menos de 3 letras; o botão de enviar fica apagado antes disso. */
export const podeEnviar = (texto: string) => texto.trim().length >= 3;

/** O nome do sistema como a pessoa fala, e não como o Node chama. */
export const nomeDoSistema = (plataforma: string) =>
  plataforma === 'darwin' ? 'Mac' : plataforma === 'win32' ? 'Windows' : plataforma === 'linux' ? 'Linux' : plataforma;
