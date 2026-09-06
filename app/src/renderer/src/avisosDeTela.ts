// Os avisos que a tela mostra. Antes era uma tarja vermelha para tudo: falha de rede,
// alguém entrando, e "isso é do Berserk" tinham a mesma cara de coisa quebrada.

export type TipoDeAviso = 'erro' | 'aviso' | 'sucesso' | 'turbo' | 'info';

export type Aviso = {
  id: number;
  tipo: TipoDeAviso;
  texto: string;
  /** Milissegundos até sumir sozinho. 0 significa "fica até fecharem". */
  duracao: number;
};

/**
 * Quanto tempo cada tipo fica na tela.
 *
 * Erro não some sozinho: quem estava olhando para outro lado precisa poder ler depois, e
 * é dele que sai o "manda o registro". O resto é passageiro por natureza.
 */
export const DURACAO: Record<TipoDeAviso, number> = {
  erro: 0,
  aviso: 6000,
  sucesso: 4000,
  turbo: 9000,
  info: 5000,
};

/** No máximo isto na tela. O mais antigo sai para o novo entrar. */
export const QUANTOS = 4;

export function empilhar(atuais: Aviso[], novo: Aviso): Aviso[] {
  // O mesmo texto repetido não vira duas tarjas: renova a que já está ali.
  const semRepetido = atuais.filter((a) => !(a.tipo === novo.tipo && a.texto === novo.texto));
  return [...semRepetido, novo].slice(-QUANTOS);
}

/**
 * De que tipo é a recusa que veio do servidor. O servidor manda o tipo junto; quando não
 * mandar — versão antiga no ar, falha de rede — é erro, que é o palpite seguro.
 */
export function tipoDaFalha(e: unknown): TipoDeAviso {
  const tipo = (e as { tipo?: string } | null)?.tipo;
  return tipo === 'turbo' || tipo === 'aviso' || tipo === 'sucesso' || tipo === 'info' ? tipo : 'erro';
}
