/**
 * O que voltou do servidor dá para usar?
 *
 * Toda rota responde JSON, sempre — e sempre um objeto. Então corpo que não é objeto não
 * é "resposta vazia": é resposta pela metade, de uma conexão que morreu no meio.
 *
 * Tratar isso como `{}` já derrubou a tela. Com a rede piscando, um corpo truncado virava
 * objeto vazio, `cargos` chegava `undefined` na lista de pessoas e o `cargos.slice()`
 * estourava DENTRO do render — janela cinza, e no registro do dono só um "Cannot read
 * properties of undefined (reading 'slice')" que não dizia de onde tinha vindo. O erro
 * chegava disfarçado de sucesso, e cada tela que confia no formato tinha de se defender
 * sozinha.
 *
 * Erro continua sendo erro, e aí quem fala é o STATUS: o corpo é só onde a mensagem
 * costuma vir, e não vir mensagem não muda o que aconteceu.
 */
export type Leitura =
  | { ok: true; dados: object }
  | { ok: false; mensagem: string; status: number; tipo: string };

const ehObjeto = (x: unknown): x is object => typeof x === 'object' && x !== null;

export function lerResposta(ok: boolean, status: number, dados: unknown): Leitura {
  if (!ok) {
    const corpo = (ehObjeto(dados) ? dados : {}) as { error?: string; tipo?: string };
    return { ok: false, mensagem: corpo.error ?? `erro ${status}`, status, tipo: corpo.tipo ?? 'erro' };
  }
  // Status 0 é o mesmo de "não consegui falar com o servidor", e é o que isto é: a
  // resposta não chegou inteira. Assim quem trata queda de rede já trata isto junto.
  if (!ehObjeto(dados)) {
    return { ok: false, mensagem: 'O servidor respondeu pela metade. Tente de novo.', status: 0, tipo: 'erro' };
  }
  return { ok: true, dados };
}

/**
 * O pedido falhou porque a sessão deixou de valer — e só por isso.
 *
 * É o 401, e nenhum outro: senha atual errada em "Sua conta" e senha do dono errada ao gerar
 * código são 403 de propósito, e código de senha errado é 400, justamente para não caírem
 * aqui e deslogarem quem só errou uma digitação. Queda de rede é status 0 e também não é
 * sessão perdida.
 */
export const derrubouASessao = (erro: unknown): boolean =>
  ehObjeto(erro) && (erro as { status?: unknown }).status === 401;

/**
 * A rota não existe NESTE servidor: é o 404 genérico do roteador, "não encontrado".
 *
 * App e servidor sobem separados, e o app novo pergunta por rota que o servidor antigo não
 * tem. Cada tela explica isso com a sua frase — a recuperação de senha e a administração —,
 * mas QUAL resposta é essa se decide aqui, uma vez: a regra estava escrita igual nos dois
 * módulos, e se o texto do roteador (`index.mjs`) mudar, ela muda num lugar só. O 404 que
 * vem com motivo ("Essa conta não existe.") é resposta de verdade, e não entra.
 */
export const rotaQueNaoExiste = (status: number, mensagem: string): boolean =>
  status === 404 && mensagem === 'não encontrado';
