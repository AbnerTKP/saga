/**
 * A saída da conta, conferida no próprio `App.tsx`, lido como texto.
 *
 * Não há módulo puro para testar aqui: o defeito é de LISTA. `esquecerAConta` zera à mão o
 * que era da conta que saiu, e o `App` não desmonta na tela de entrar — então todo estado
 * que ela esquece volta desenhado para a próxima conta. Ela esqueceu os painéis, os menus e
 * os cartões abertos, e nada falhou: lista à mão esquece em silêncio o que nasceu depois
 * dela. A conferência inverte isso, como a `arquitetura.test.mjs` do servidor: estado novo
 * no `App` ou é esquecido na saída, ou entra em `FICAM` dizendo por quê.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const APP = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

/** O que atravessa a troca de conta de propósito, e o motivo. */
const FICAM: Record<string, string> = {
  setConferindo: 'só vale na abertura do app, antes de haver conta na tela',
  setStatusEscolhido: 'é do computador (localStorage), como o último apelido',
  setRegistro: 'a tela de entrar também abre o registro de erros',
  setLidas: 'marcadores guardados no computador, por id de sala',
  setLidasDeConversa: 'marcadores guardados no computador, por id de conversa',
  setBuscarServidorDeNovo: 'é só um gatilho: a busca não roda sem sessão',
  setSeletorDoSistema: 'é do sistema operacional, não da conta',
  setAtualizacao: 'a atualização do app é da máquina',
  setPartidaResolvida: 'a consulta de versão já aconteceu, e não se repete por conta',
};

/** O corpo de uma função `const nome = useCallback(() => { ... }, [])`. */
function corpoDe(nome: string): string {
  const inicio = APP.indexOf(`const ${nome} = useCallback(() => {`);
  assert.ok(inicio >= 0, `não achei ${nome} no App.tsx`);
  const fim = APP.indexOf('\n  }, []);', inicio);
  assert.ok(fim > inicio, `não achei o fim de ${nome}`);
  return APP.slice(inicio, fim);
}

/** O trecho do App entre dois marcadores de texto. */
function trecho(de: string, ate: string): string {
  const inicio = APP.indexOf(de);
  assert.ok(inicio >= 0, `não achei "${de}" no App.tsx`);
  const fim = APP.indexOf(ate, inicio);
  assert.ok(fim > inicio, `não achei "${ate}" depois de "${de}"`);
  return APP.slice(inicio, fim);
}

const estados = [...APP.matchAll(/const \[\w+, (set\w+)\] = useState/g)].map((m) => m[1]);

test('o App.tsx tem os estados que esta conferência lê', () => {
  // Uma regex que parasse de casar deixaria a conferência abaixo verde sem conferir nada.
  assert.ok(estados.length > 30, `só ${estados.length} estados lidos`);
  assert.ok(estados.includes('setSessao') && estados.includes('setTrancando'));
});

test('todo estado do App é esquecido quando a conta sai, ou diz por que fica', () => {
  const corpo = corpoDe('esquecerAConta');
  const esquecidos = estados.filter((s) => !(s in FICAM) && !corpo.includes(`${s}(`));
  assert.deepEqual(esquecidos, [], 'estado que a próxima conta a entrar receberia desenhado');
});

test('o que fica é estado que existe, para a lista não envelhecer', () => {
  assert.deepEqual(Object.keys(FICAM).filter((s) => !estados.includes(s)), []);
});

test('as duas buscas que rodam sozinhas levam o 401 à mesma saída, inclusive sem servidor', () => {
  // A busca de salas não roda sem servidor. Na tela inicial, só o sinal de vida percebe a
  // sessão derrubada — e antes ele engolia o 401 junto com a queda de rede.
  const sinalDeVida = trecho('const bater = async () => {', 'setInterval(bater,');
  const buscaDeSalas = trecho('const tick = async () => {', 'setInterval(tick,');
  for (const [nome, codigo] of [['sinal de vida', sinalDeVida], ['busca de salas', buscaDeSalas]]) {
    assert.match(codigo, /derrubouASessao\(e\)[^\n]*sessaoCaiuRef\.current\(\)/, `${nome} não trata a sessão que caiu`);
  }
  // E a saída é a do "Sair": sai da call e esquece a conta.
  assert.match(APP, /sessaoCaiuRef\.current = \(\) => \{ sairDaVozRef\.current\(\); esquecerAConta\(\); \};/);
  assert.match(trecho('const logout = useCallback(', '\n  }, ['), /esquecerAConta\(\)/);
});
