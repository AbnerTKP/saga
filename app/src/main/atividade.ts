import { app, desktopCapturer, ipcMain, type BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { registrar } from './registro';
import {
  AJUSTES_PADRAO, bibliotecasDoSteam, continuar, iconeNaPasta, janelaDoJogo, janelasMudaram, jogoDoSteam,
  jogoDosProgramas, lerAppsDoMac, lerAppsDoRegistro, lerAppsDoVdf, lerJanelasDoWindows, lerPs, lerTasklist,
  lerTitulosDoTasklist, lerValorDoRegistro, nomeNoManifesto, normalizarAjustes, pacoteDoMac, precisamDeTitulo,
  type AjustesDaAtividade, type AppDoSteam, type JogoAberto, type ProgramaAberto,
} from './jogoAberto';

/**
 * A atividade: que jogo está aberto neste computador, para o pessoal ver "Jogando Valheim".
 *
 * Quem decide é `jogoAberto.ts` (puro e testado); aqui só se pergunta ao sistema, no ritmo
 * que não pesa — o pedido do dono foi "sem comprometer o desempenho", e o jogo está rodando
 * JUSTAMENTE quando isto roda. Medido no Windows dele em 20/10/2026, de dentro do Node:
 *
 * | o quê | quanto | quando |
 * |---|---|---|
 * | `reg query …\Steam\Apps /s` | ~36 ms (quase tudo é abrir o `reg.exe`) | a cada 15 s |
 * | as janelas abertas (`desktopCapturer`) | ~80 ms, ~70 ms de processador | a cada 15 s, sem jogo do Steam |
 * | `tasklist /fo csv /nh` | ~280 ms de relógio, ~0,3–0,4 s de processador | quando abre ou fecha uma janela, e a cada 5 min |
 * | `tasklist /v` sem filtro | 5,3 s | nunca |
 *
 * Então: o Steam, que é barato, a cada 15 s. A lista de programas, que é cara, só quando ABRE
 * OU FECHA uma janela — jogo que abre abre janela — e, por garantia, a cada 5 min. Na primeira
 * versão ela era lida de minuto em minuto, e um jogo de fora do Steam aberto com a Saga já
 * aberta levava até um minuto para aparecer (medido: 43 s). O dono achou que só aparecia
 * desmarcando e marcando a opção, que é o que força uma leitura na hora. No Mac o `ps` é
 * barato e roda a cada 15 s. Uma volta nunca começa antes de a anterior terminar, e com
 * "Mostrar o que estou jogando" desligado nada roda.
 */

const STEAM_A_CADA = 15_000;
/** A volta longa da lista de programas: com as janelas avisando, é só garantia. */
const PROGRAMAS_A_CADA = process.platform === 'darwin' ? STEAM_A_CADA : 5 * 60_000;
/** Sem conseguir listar as janelas no Windows, volta o ritmo da primeira versão. */
const PROGRAMAS_SEM_JANELAS = 60_000;

export type JogoContado = JogoAberto & { desde: number };

let ajustes: AjustesDaAtividade = { ...AJUSTES_PADRAO, mostrar: false };
let atual: JogoContado | null = null;
let relogio: ReturnType<typeof setTimeout> | null = null;
let ocupado = false;
/** Muda a cada ajuste: a volta que começou com os ajustes de antes não conta o que achou. */
let geracao = 0;
/** Quando a lista de programas foi lida, e o que se achou nela. Zero = ler na próxima volta. */
let programasEm = 0;
let doUltimoPrograma: JogoAberto | null = null;
/** As janelas da última volta, pelo id. Null = ainda não se olhou. */
let janelasAntes: Set<string> | null = null;
/** A última saída do `ps` no Mac: é dela que sai o `.app` de onde se tira o ícone. */
let ultimoPs = '';
let janela: () => BrowserWindow | null = () => null;
/** O custo de cada leitura vai para o registro UMA vez por abertura: é o que se mede na máquina de alguém. */
const jaMedi = new Set<string>();

function rodar(cmd: string, args: string[], encoding: BufferEncoding = 'latin1'): Promise<string> {
  return new Promise((resolve, reject) => {
    // `windowsHide`: sem ele, cada leitura piscaria uma janela preta de console na tela de quem joga.
    execFile(cmd, args, { windowsHide: true, timeout: 10_000, encoding, maxBuffer: 8 << 20 }, (erro, saida) => {
      if (erro) reject(erro); else resolve(saida);
    });
  });
}

async function medido<T>(oque: string, f: () => Promise<T>): Promise<T> {
  const inicio = performance.now();
  try { return await f(); } finally {
    if (!jaMedi.has(oque)) {
      jaMedi.add(oque);
      registrar('info', 'atividade', `${oque} em ${Math.round(performance.now() - inicio)} ms`);
    }
  }
}

// --- o Steam -----------------------------------------------------------------

const STEAM_NO_MAC = join(homedir(), 'Library', 'Application Support', 'Steam');
let pastaDoSteam: string | null | undefined;
const nomes = new Map<number, string | null>();
const icones = new Map<number, string | null>();

async function acharPastaDoSteam(): Promise<string | null> {
  if (pastaDoSteam !== undefined) return pastaDoSteam;
  if (process.platform === 'darwin') pastaDoSteam = STEAM_NO_MAC;
  else if (process.platform === 'win32') {
    const saida = await rodar('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']).catch(() => '');
    pastaDoSteam = lerValorDoRegistro(saida, 'SteamPath');
  } else pastaDoSteam = null;
  return pastaDoSteam;
}

async function appsDoSteam(): Promise<AppDoSteam[]> {
  if (process.platform === 'win32') {
    // Sem Steam instalado a chave não existe e o `reg` sai com erro: é "nada aberto".
    const saida = await rodar('reg', ['query', 'HKCU\\Software\\Valve\\Steam\\Apps', '/s']).catch(() => '');
    return lerAppsDoRegistro(saida);
  }
  if (process.platform === 'darwin') {
    const texto = await readFile(join(STEAM_NO_MAC, 'registry.vdf'), 'utf8').catch(() => '');
    return lerAppsDoVdf(texto);
  }
  return [];
}

/** O nome que o registro não tem sai do manifesto, procurado em cada biblioteca do Steam. */
async function nomeDoManifesto(id: number): Promise<string | null> {
  if (nomes.has(id)) return nomes.get(id) ?? null;
  const pasta = await acharPastaDoSteam();
  let nome: string | null = null;
  if (pasta) {
    const bibliotecas = bibliotecasDoSteam(await readFile(join(pasta, 'steamapps', 'libraryfolders.vdf'), 'utf8').catch(() => ''));
    for (const b of [pasta, ...bibliotecas]) {
      nome = nomeNoManifesto(await readFile(join(b, 'steamapps', `appmanifest_${id}.acf`), 'utf8').catch(() => ''));
      if (nome) break;
    }
  }
  nomes.set(id, nome);
  return nome;
}

async function iconeDoSteam(id: number): Promise<string | null> {
  if (icones.has(id)) return icones.get(id) ?? null;
  const pasta = await acharPastaDoSteam();
  const arquivos = pasta ? await readdir(join(pasta, 'appcache', 'librarycache', String(id))).catch(() => []) : [];
  const icone = iconeNaPasta(arquivos);
  icones.set(id, icone);
  return icone;
}

async function jogoNoSteam(): Promise<JogoAberto | null> {
  const app = jogoDoSteam(await medido('steam', appsDoSteam), new Set(ajustes.escondidos));
  if (!app) return null;
  const nome = app.nome ?? await nomeDoManifesto(app.id);
  // Sem nome em lugar nenhum não há o que mostrar: "Jogando 892970" não diz nada a ninguém.
  if (!nome) return null;
  return { chave: `steam:${app.id}`, nome, steam: app.id, icone: await iconeDoSteam(app.id), origem: 'steam' };
}

// --- os programas ------------------------------------------------------------

async function programasAbertos(): Promise<string[]> {
  if (process.platform === 'win32') return lerTasklist(await rodar('tasklist', ['/fo', 'csv', '/nh']));
  if (process.platform === 'darwin') return lerPs(ultimoPs = await rodar('ps', ['-axo', 'comm='], 'utf8'));
  return [];
}

/**
 * As janelas abertas, pelo id — só no Windows. No Mac listar janelas pede a permissão de
 * gravar a tela (sem ela, LANÇA), e lá o `ps` já é barato o bastante para rodar sempre.
 */
async function janelasAgora(icones = false) {
  if (process.platform !== 'win32') return null;
  return desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: icones })
    .catch(() => null);
}

const iconesDosProgramas = new Map<string, string>();
const iconeTentadoEm = new Map<string, number>();

/**
 * O ícone de um jogo de fora do Steam: o da JANELA dele, que o Windows dá mesmo quando o
 * processo é protegido pelo anticheat. Medido com o LoL aberto em 20/10/2026: o caminho do
 * programa do jogo vem VAZIO (`Get-Process` e `Win32_Process`), e o ícone da janela "League of
 * Legends (TM) Client" vem inteiro, 32×32, em ~90 ms. No Mac, o ícone do `.app` (não exercido).
 * Achado, fica guardado; não achado, tenta de novo no máximo uma vez por minuto.
 */
async function iconeDoPrograma(jogo: JogoAberto): Promise<string | null> {
  const guardado = iconesDosProgramas.get(jogo.chave);
  if (guardado) return guardado;
  if (Date.now() - (iconeTentadoEm.get(jogo.chave) ?? 0) < 60_000) return null;
  iconeTentadoEm.set(jogo.chave, Date.now());
  let imagem: Electron.NativeImage | null = null;
  if (process.platform === 'win32') {
    const fontes = await janelasAgora(true) ?? [];
    const apontada = ajustes.meus.find((m) => `exe:${m.exe}` === jogo.chave)?.janela;
    const achada = janelaDoJogo(fontes.map((f) => ({ id: f.id, titulo: f.name })), jogo.nome, apontada);
    imagem = fontes.find((f) => f.id === achada?.id)?.appIcon ?? null;
  } else if (process.platform === 'darwin') {
    const pacote = pacoteDoMac(ultimoPs, jogo.chave.replace(/^exe:/, ''));
    if (pacote) imagem = await app.getFileIcon(pacote, { size: 'normal' }).catch(() => null);
  }
  if (!imagem || imagem.isEmpty()) return null;
  // Ícone de janela pode vir grande (256 px); o servidor aceita até 256, e a tela mostra no máximo 40.
  const lado = imagem.getSize();
  const png = (lado.width > 64 ? imagem.resize({ width: 64, height: 64, quality: 'best' }) : imagem).toDataURL();
  iconesDosProgramas.set(jogo.chave, png);
  return png;
}

/** Só para os poucos programas que exigem o título (o Java do Minecraft): filtrado, ~135 ms. */
async function titulosDe(exes: string[]): Promise<Map<string, string[]>> {
  const titulos = new Map<string, string[]>();
  if (process.platform !== 'win32') return titulos;
  for (const exe of exes) {
    const saida = await rodar('tasklist', ['/v', '/fo', 'csv', '/nh', '/fi', `IMAGENAME eq ${exe}`]).catch(() => '');
    titulos.set(exe, lerTitulosDoTasklist(saida));
  }
  return titulos;
}

async function jogoNosProgramas(): Promise<JogoAberto | null> {
  const programas = await medido('programas', programasAbertos);
  return jogoDosProgramas(programas, await titulosDe(precisamDeTitulo(programas)), ajustes);
}

// --- a volta -----------------------------------------------------------------

function contar(jogo: JogoAberto | null) {
  const novo = continuar(atual, jogo, Date.now());
  // O ícone conta: ele pode chegar uma volta depois do jogo (a janela ainda não tinha aberto).
  if (novo?.chave === atual?.chave && novo?.nome === atual?.nome && novo?.iconeLocal === atual?.iconeLocal) return;
  atual = novo;
  const j = janela();
  if (j && !j.isDestroyed()) j.webContents.send('atividade:mudou', atual);
}

async function volta() {
  relogio = null;
  if (!ajustes.mostrar || ocupado) return;
  ocupado = true;
  const comecouEm = geracao;
  try {
    let jogo = await jogoNoSteam();
    if (jogo) {
      // Com o jogo do Steam aberto, a lista de programas nem é lida; quando ele fechar, ela é
      // lida na volta seguinte, e não um minuto depois com o resultado de antes do jogo.
      programasEm = 0;
    } else {
      const janelas = await medido('janelas', () => janelasAgora());
      const ids = janelas?.map((f) => f.id) ?? null;
      const abriuOuFechou = ids ? janelasMudaram(janelasAntes, ids) : false;
      if (ids) janelasAntes = new Set(ids);
      const prazo = ids || process.platform !== 'win32' ? PROGRAMAS_A_CADA : PROGRAMAS_SEM_JANELAS;
      if (abriuOuFechou || Date.now() - programasEm >= prazo) {
        programasEm = Date.now();
        doUltimoPrograma = await jogoNosProgramas();
      }
      jogo = doUltimoPrograma && { ...doUltimoPrograma, iconeLocal: await iconeDoPrograma(doUltimoPrograma) };
    }
    // Escondeu o jogo enquanto a volta corria: o que ela achou já não vale.
    if (ajustes.mostrar && comecouEm === geracao) contar(jogo);
  } catch (e) {
    if (!jaMedi.has('falha')) {
      jaMedi.add('falha');
      registrar('aviso', 'atividade', `não deu para ver o jogo aberto: ${(e as Error).message}`);
    }
  } finally {
    ocupado = false;
    if (ajustes.mostrar && !relogio) relogio = setTimeout(volta, comecouEm === geracao ? STEAM_A_CADA : 0);
  }
}

function recomecar() {
  geracao++;
  if (relogio) { clearTimeout(relogio); relogio = null; }
  programasEm = 0;
  // Mexeu nos ajustes (apontou um jogo, por exemplo): o ícone que faltava é procurado de novo já.
  iconeTentadoEm.clear();
  if (ajustes.mostrar) void volta();
  else contar(null);
}

/** A lista de programas com janela, para a pessoa apontar o jogo — só quando ela pede. */
async function janelasAbertas(): Promise<ProgramaAberto[]> {
  const proprio = basename(process.execPath);
  if (process.platform === 'win32') {
    // ~270 ms medidos; só roda quando a pessoa abre o "Escolher".
    const saida = await rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowTitle } | '
      + 'ForEach-Object { $_.ProcessName + [char]9 + $_.MainWindowTitle }'], 'utf8');
    return lerJanelasDoWindows(saida, proprio);
  }
  if (process.platform === 'darwin') return lerAppsDoMac(await rodar('ps', ['-axo', 'comm='], 'utf8'), proprio.replace(/\.app$/, ''));
  return [];
}

export function registrarAtividade(qualJanela: () => BrowserWindow | null) {
  janela = qualJanela;
  // A tela manda os ajustes ao abrir e a cada mudança; até lá nada roda.
  ipcMain.handle('atividade:configurar', (_e, pedido: unknown) => {
    ajustes = normalizarAjustes(pedido);
    recomecar();
    return atual;
  });
  ipcMain.handle('atividade:agora', () => atual);
  ipcMain.handle('atividade:janelas', async () => {
    try { return await janelasAbertas(); } catch (e) {
      registrar('aviso', 'atividade', `não deu para listar os programas abertos: ${(e as Error).message}`);
      return [];
    }
  });
}
