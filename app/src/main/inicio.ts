import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Abrir junto com o sistema.
 *
 * Aqui não entra `electron` de propósito. O que dá para errar neste assunto é a REGRA —
 * ligar sozinho na máquina de quem programa, ou religar depois de a pessoa desligar —, e
 * regra sem tela nem sistema operacional é justamente o que se consegue testar. Quem
 * fala com o registro do Windows é o `index.ts`.
 */

/**
 * Argumento que a entrada de arranque carrega.
 *
 * É por ele que o app sabe que ninguém clicou nele: quem foi aberto pelo Windows não quer
 * uma janela na cara, quer estar online. No macOS não há argumento nenhum — a entrada é
 * o próprio pacote, e quem responde é `wasOpenedAtLogin`.
 */
export const AO_INICIAR = '--ao-iniciar';

export function abriuComOSistema(argv: string[], porLogin = false): boolean {
  return porLogin || argv.includes(AO_INICIAR);
}

/**
 * Ligar sozinho acontece UMA vez, e só onde foi pedido.
 *
 * - `empacotado`: em desenvolvimento o executável é o Electron, e escrever ISSO no
 *   arranque da máquina vira lixo que fica depois que o projeto sair da frente.
 * - `win32`: foi o que se pediu. No Mac a chave existe no painel, começando desligada.
 * - `jaDecidiu`: sem essa marca, quem desligasse veria a Saga voltar sozinha na abertura
 *   seguinte — ajuste que não obedece é pior que ajuste nenhum.
 */
export function deveLigarSozinho(o: { plataforma: string; empacotado: boolean; jaDecidiu: boolean }): boolean {
  return o.empacotado && o.plataforma === 'win32' && !o.jaDecidiu;
}

// Em texto e com data, na pasta de dados do app: quem abrir entende sem ferramenta nenhuma.
const marca = (pastaDeDados: string) => join(pastaDeDados, 'inicio-automatico.txt');

export function jaDecidiu(pastaDeDados: string): boolean {
  // Na dúvida, não mexe: dizer "ainda não decidiu" sem ter certeza é o caminho de religar
  // sozinho o que a pessoa desligou.
  try { return existsSync(marca(pastaDeDados)); } catch { return true; }
}

/**
 * Anota o que foi decidido e devolve se conseguiu anotar.
 *
 * Só se liga sozinho o que se consegue LEMBRAR de ter ligado: sem a anotação, a decisão
 * de quem desligou seria refeita a cada abertura.
 */
export function anotarDecisao(pastaDeDados: string, ligado: boolean, quando = new Date()): boolean {
  try {
    writeFileSync(marca(pastaDeDados), `${ligado ? 'ligado' : 'desligado'} em ${quando.toISOString()}\n`);
    return true;
  } catch {
    return false;
  }
}
