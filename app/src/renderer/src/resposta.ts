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
