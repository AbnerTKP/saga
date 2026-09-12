/**
 * Uma promessa com prazo: não respondeu em `ms`, vira falha com `aviso`.
 *
 * Existe porque há no app o que nunca responde, sem erro nenhum — o servidor de voz numa rede
 * que engole a porta, a ponte do processo principal num porteiro de permissões que só deixa a
 * promessa pendurada. Sem prazo, o botão fica esperando para sempre e por fora parece que o
 * clique não funcionou.
 *
 * Morava dentro de `useRoom.ts`, e o "Copiar" do código de senha precisou do mesmo: a segunda
 * cópia à mão é como uma delas passa a esquecer o `clearTimeout`. O relógio é desligado
 * quando a promessa termina, dê certo ou não — senão cada chamada deixaria um vivo por `ms`.
 */
export function comLimite<T>(promessa: Promise<T>, ms: number, aviso: string): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, falhar) => {
    id = setTimeout(() => falhar(new Error(aviso)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(id));
}
