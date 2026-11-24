import { app, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { constants, getPriority, setPriority } from 'node:os';
import { registrar } from './registro';
import { alvosDaVoz, lerEnergia, nomeDaPrioridade, scriptDaEnergia, type Alvo } from './prioridadeDaVoz';

/**
 * Durante a call, no Windows, a tela e o serviço de rede sobem para "acima do normal" e saem
 * da economia de energia — o porquê está em `prioridadeDaVoz.ts`. Só no Windows: no Mac, subir
 * prioridade exige ser root, e o relato é de lá.
 *
 * Medido numa bancada escondida com o Electron do projeto (24/11/2026): o processo principal
 * consegue subir os dois, e o Chromium NÃO desfaz sozinho — nem ao abrir o microfone, nem ao
 * ligar e desligar o estrangulamento com a janela escondida. Mesmo assim a conferência se
 * repete a cada 10 s: se alguém baixar no meio da call, ela sobe de novo e ANOTA quem estava
 * onde. É essa linha que vai dizer, no registro de quem joga, se o problema era outro.
 */
const ACIMA = constants.priority.PRIORITY_ABOVE_NORMAL;
const NORMAL = constants.priority.PRIORITY_NORMAL;
const CONFERIR_A_CADA = 10_000;

let relogio: ReturnType<typeof setInterval> | null = null;
let pidDaTela = 0;
/** Quem eu subi: é o que volta ao normal no fim, e o que separa "baixou sozinho" de "nunca subiu". */
const subidos = new Map<number, Alvo['nome']>();
/**
 * Quem já saiu da economia. O ajuste fica no processo até ele acabar, e por isso não volta
 * no fim da call: desfazer custaria outro PowerShell para quem não está fazendo nada — fora
 * da call, a tela parada não gasta o que a economia pouparia.
 */
const semEconomia = new Set<number>();
/** O mesmo problema não vira uma linha no registro a cada 10 s. */
const jaAnotado = new Set<string>();
let tirando = false;

function anotarUmaVez(chave: string, mensagem: string) {
  if (jaAnotado.has(chave)) return;
  jaAnotado.add(chave);
  registrar('aviso', 'voz', mensagem);
}

function conferir() {
  let alvos: Alvo[];
  try { alvos = alvosDaVoz(app.getAppMetrics(), pidDaTela); } catch { return; }
  const subiAgora: string[] = [];
  for (const { pid, nome } of alvos) {
    try {
      const estava = getPriority(pid);
      if (estava === ACIMA) continue;
      setPriority(pid, ACIMA);
      if (subidos.has(pid)) {
        registrar('aviso', 'voz', `a ${nome} estava em ${nomeDaPrioridade(estava)} no meio da call; subiu de novo`);
      } else {
        subiAgora.push(nome);
      }
      subidos.set(pid, nome);
      // Quem mexeu na prioridade pode ter mexido na energia junto (o Chromium mexe nas duas
      // quando manda um processo para segundo plano).
      semEconomia.delete(pid);
    } catch (e) {
      anotarUmaVez(`prioridade ${pid}`, `não consegui subir a ${nome} (${pid}): ${(e as Error).message}`);
    }
  }
  if (subiAgora.length) registrar('info', 'voz', `em call: ${subiAgora.join(' e ')} acima do normal`);
  tirarDaEconomia(alvos.filter((a) => subidos.has(a.pid) && !semEconomia.has(a.pid)));
}

function tirarDaEconomia(alvos: Alvo[]) {
  const script = scriptDaEnergia(alvos.map((a) => a.pid));
  if (!script || tirando) return;
  tirando = true;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15_000 }, (erro, saida) => {
    tirando = false;
    if (erro) {
      anotarUmaVez('energia', `não consegui tirar a voz da economia de energia: ${erro.message}`);
      return;
    }
    const feitos = lerEnergia(String(saida));
    const fora: string[] = [];
    for (const { pid, nome } of alvos) {
      if (feitos.get(pid)) { semEconomia.add(pid); fora.push(nome); }
      else anotarUmaVez(`energia ${pid}`, `a economia de energia do Windows não largou a ${nome} (${pid}): ${String(saida).trim() || 'sem resposta'}`);
    }
    if (fora.length) registrar('info', 'voz', `${fora.join(' e ')} fora da economia de energia`);
  });
}

/** Fim da call: volta ao normal o que EU subi e continua onde deixei. */
function devolver() {
  for (const pid of subidos.keys()) {
    try { if (getPriority(pid) === ACIMA) setPriority(pid, NORMAL); } catch { /* o processo já acabou */ }
  }
  subidos.clear();
}

export function registrarPrioridadeDaVoz() {
  ipcMain.handle('voz:emCall', (e, emCall: unknown) => {
    if (process.platform !== 'win32') return;
    // A cada aviso: a tela pode ter caído e voltado com outro processo.
    pidDaTela = e.sender.getOSProcessId();
    if (emCall === true) {
      if (relogio) return;
      conferir();
      relogio = setInterval(conferir, CONFERIR_A_CADA);
    } else if (relogio) {
      clearInterval(relogio);
      relogio = null;
      devolver();
    }
  });
}
