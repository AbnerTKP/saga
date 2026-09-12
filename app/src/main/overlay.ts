import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O overlay da live: a janela que fica por cima do jogo.
 *
 * Aqui não entra `electron`, pelo mesmo motivo de `inicio.ts`: o que dá para errar neste
 * assunto é a REGRA — deixar a janela num monitor que já não existe, aceitar um atalho que
 * derruba o `globalShortcut`, perder a posição guardada porque o arquivo veio estragado —,
 * e regra sem sistema operacional é o que se consegue testar. Quem fala com a janela e com
 * o atalho global é o `index.ts`.
 */

export type Retangulo = { x: number; y: number; width: number; height: number };

/** Onde ele nasce quando ninguém mexeu ainda: canto de cima à direita da tela principal. */
export const TAMANHO_PADRAO = { width: 384, height: 216 };
export const MINIMO = { width: 192, height: 108 };
export const MAXIMO = { width: 1920, height: 1080 };

/** O atalho de fábrica. Trocável em "Sua conta" — jogo que já use este fica sem o dele. */
export const ATALHO_PADRAO = 'Control+Shift+O';

/**
 * A janela precisa estar VISÍVEL em alguma tela.
 *
 * Guardar a posição é o que faz o overlay voltar onde estava; o preço é que a posição
 * guardada pode apontar para um monitor que foi desligado, para a TV que ficou na outra
 * casa, ou para uma resolução que mudou. Uma janela sem moldura fora de qualquer tela é
 * uma janela que não dá para trazer de volta — não tem barra de título para agarrar e não
 * aparece na barra de tarefas. Então, se o que foi guardado não encosta em tela nenhuma,
 * ele é descartado inteiro e o overlay volta ao canto da tela principal.
 */
export function encaixarNaTela(
  pedido: Retangulo | null,
  telas: Retangulo[],
  principal: Retangulo,
): Retangulo {
  const padrao = (): Retangulo => ({
    x: principal.x + principal.width - TAMANHO_PADRAO.width - 24,
    y: principal.y + 24,
    ...TAMANHO_PADRAO,
  });
  if (!pedido) return padrao();
  const width = Math.round(Math.min(MAXIMO.width, Math.max(MINIMO.width, pedido.width)));
  const height = Math.round(Math.min(MAXIMO.height, Math.max(MINIMO.height, pedido.height)));
  const candidato = { x: Math.round(pedido.x), y: Math.round(pedido.y), width, height };
  // "Encosta" e não "cabe inteiro": arrastar o overlay meio para fora da tela é uma coisa
  // que se faz de propósito, para ele ocupar menos canto.
  const encosta = telas.some((t) =>
    candidato.x + candidato.width > t.x + 40 && candidato.x < t.x + t.width - 40 &&
    candidato.y + candidato.height > t.y + 24 && candidato.y < t.y + t.height - 24);
  return encosta ? candidato : padrao();
}

/**
 * Um atalho que o Electron aceite.
 *
 * `globalShortcut.register` LANÇA com texto inválido, e isso aconteceria no meio de abrir
 * o overlay — a live não apareceria, e o motivo estaria a três camadas de distância. Aqui
 * a resposta é `null`, e quem chama cai no padrão.
 */
const MODIFICADORES = new Set(['Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Command', 'Cmd', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta']);
const TECLAS = /^(?:[0-9A-Z]|F[1-9]|F1[0-9]|F2[0-4]|Space|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Escape|Plus|Return|Enter)$/;

export function atalhoAceito(cru: unknown): string | null {
  if (typeof cru !== 'string') return null;
  const partes = cru.trim().split('+').map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return null;                       // tecla solta vira atalho por acidente
  const mods = partes.slice(0, -1);
  // Uma letra vem como a pessoa digitou; o Electron quer a maiúscula.
  const tecla = partes[partes.length - 1];
  const normal = tecla.length === 1 ? tecla.toUpperCase() : tecla;
  if (!TECLAS.test(normal)) return null;
  if (!mods.every((m) => MODIFICADORES.has(m))) return null;
  return [...mods, normal].join('+');
}

/** O que fica guardado entre uma abertura e outra. */
export type Guardado = { bounds: Retangulo | null; atalho: string };

const arquivo = (pastaDeDados: string) => join(pastaDeDados, 'overlay.json');

export function ler(pastaDeDados: string): Guardado {
  try {
    const caminho = arquivo(pastaDeDados);
    if (!existsSync(caminho)) return { bounds: null, atalho: ATALHO_PADRAO };
    return validar(JSON.parse(readFileSync(caminho, 'utf8')));
  } catch {
    // Arquivo estragado não pode impedir o overlay de abrir: ele volta ao canto padrão.
    return { bounds: null, atalho: ATALHO_PADRAO };
  }
}

export function gravar(pastaDeDados: string, g: Guardado): boolean {
  try {
    writeFileSync(arquivo(pastaDeDados), `${JSON.stringify(g, null, 1)}\n`);
    return true;
  } catch {
    return false;
  }
}

export function validar(cru: unknown): Guardado {
  const vazio: Guardado = { bounds: null, atalho: ATALHO_PADRAO };
  if (!cru || typeof cru !== 'object') return vazio;
  const g = cru as Record<string, unknown>;
  const atalho = atalhoAceito(g.atalho) ?? ATALHO_PADRAO;
  const b = g.bounds;
  if (!b || typeof b !== 'object') return { bounds: null, atalho };
  const r = b as Record<string, unknown>;
  const numeros = ['x', 'y', 'width', 'height'].map((k) => r[k]);
  if (!numeros.every((v) => typeof v === 'number' && Number.isFinite(v))) return { bounds: null, atalho };
  const [x, y, width, height] = numeros as number[];
  return { bounds: { x, y, width, height }, atalho };
}
