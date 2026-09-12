/**
 * A tecla que a pessoa apertou, no nome que o Electron entende.
 *
 * Escrever o atalho à mão num campo de texto é um convite a errar — "ctrl shift o" não é
 * nada para o `globalShortcut`, e o erro só apareceria quando o jogo estivesse aberto. Por
 * isso o campo ESCUTA: a pessoa aperta a combinação e ela aparece escrita.
 *
 * Quem manda é o `code`, não o `key`: com Shift, `key` vira o símbolo ("o" vira "O", "1"
 * vira "!"), e com outro layout de teclado vira outra letra ainda. `code` é a tecla FÍSICA,
 * que é o que o atalho global registra.
 */

export type TeclaApertada = {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  code: string;
};

/** Só as que valem a pena num atalho: o resto vira ruído dentro de um jogo. */
function nomeDaTecla(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  const outras: Record<string, string> = {
    Space: 'Space', Tab: 'Tab', Home: 'Home', End: 'End', Insert: 'Insert', Delete: 'Delete',
    PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  };
  return outras[code] ?? null;
}

/**
 * Devolve o atalho, ou `null` enquanto ele ainda não está inteiro.
 *
 * `null` não é erro: é o estado normal de quem já apertou Ctrl e ainda não apertou a
 * letra. Sem pelo menos um modificador também é `null` — um atalho global de tecla solta
 * roubaria essa tecla de todo programa aberto.
 */
export function atalhoDoEvento(e: TeclaApertada): string | null {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.metaKey) mods.push('Command');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const tecla = nomeDaTecla(e.code);
  if (!tecla || mods.length === 0) return null;
  return [...mods, tecla].join('+');
}

/**
 * Como o atalho se lê na tela: o nome que o Electron usa não é o que se aperta.
 *
 * O sistema entra por PARÂMETRO, e não de uma consulta aqui dentro: assim a conta é
 * testável, e a tela — que já sabe em que sistema está (`window.desktop.platform`) — é
 * quem responde.
 */
export function comoSeLe(atalho: string, mac = false): string {
  return atalho
    .split('+')
    .map((p) => {
      if (p === 'Control' || p === 'Ctrl') return mac ? '⌃' : 'Ctrl';
      if (p === 'CommandOrControl' || p === 'CmdOrCtrl') return mac ? '⌘' : 'Ctrl';
      if (p === 'Command' || p === 'Cmd' || p === 'Super' || p === 'Meta') return mac ? '⌘' : 'Win';
      if (p === 'Alt' || p === 'Option') return mac ? '⌥' : 'Alt';
      if (p === 'Shift') return mac ? '⇧' : 'Shift';
      return p;
    })
    .join(mac ? '' : ' + ');
}
