import { app, BrowserWindow, ipcMain, powerMonitor, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

// Repositório público no GitHub onde os instaladores são publicados (Releases).
// Formato: "usuario/repositorio". Precisa ser o mesmo de electron-builder.yml → publish.
export const REPO = 'AbnerTKP/saga';

/**
 * Fases da atualização. O app mostra uma tela de partida enquanto está em 'procurando',
 * 'baixando' ou 'pronto' — antes, isso acontecia calado e em segundo plano, e quem
 * fechava o app no meio do download perdia o progresso e recomeçava do zero, sem nunca
 * saber por quê. Era o "precisa reiniciar quatro vezes".
 */
export type UpdateState = {
  fase: 'procurando' | 'baixando' | 'pronto' | 'nenhuma' | 'aviso' | 'erro';
  version?: string;
  progress?: number;
  url?: string;        // no Mac, o endereço do DMG para baixar à mão
  mensagem?: string;
};

/**
 * De quanto em quanto se pergunta ao GitHub com o app aberto. Eram 6 h — e com a Saga aberta
 * o dia inteiro, versão nova só aparecia na abertura seguinte: o dono pediu que ela apareça
 * "dinamicamente" (28/11/2026). No Windows a consulta é o `releases.atom` do GitHub, que não
 * entra na cota da API; no Mac é a API, 60 por hora por IP, e 4 por hora cabe folgado.
 */
const QUINZE_MINUTOS = 15 * 60 * 1000;
/** Acordar a máquina pergunta na hora, mas não mais que uma vez a cada 2 min. */
const INTERVALO_MINIMO = 2 * 60 * 1000;
// Sem internet, o GitHub simplesmente não responde. Não dá para segurar o app por isso.
const LIMITE_DA_CONSULTA = 15_000;

function maisNova(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

// O estado fica guardado porque a tela que o escuta pode montar depois do primeiro aviso;
// sem isso a mensagem se perde e a tela fica esperando para sempre.
let ultimo: UpdateState = { fase: 'procurando' };

// A janela atual. No Mac, fechar e clicar no ícone do Dock cria outra, e é para ela que
// os avisos passam a ir.
let janela: BrowserWindow | null = null;
let jaIniciado = false;
let mostrar: () => void = () => {};

/**
 * @param mostrarJanela chamado quando a consulta resolve — é o que faz a janela aparecer.
 *        Enquanto ela não resolve, o app fica invisível: quem clica no ícone espera um app
 *        já atualizado, não um que abre e depois avisa que há versão nova.
 */
export function setupUpdates(win: BrowserWindow, mostrarJanela: () => void = () => {}) {
  janela = win;
  mostrar = mostrarJanela;

  // Canais e temporizadores são do app, não da janela. Registrá-los de novo estoura com
  // "second handler", e como isso acontecia antes de a janela carregar, ela abria em
  // branco — bastava fechar e reabrir pelo Dock no Mac para cair nisso.
  if (jaIniciado) {
    // A consulta já aconteceu nesta sessão: a janela nova não tem o que esperar.
    if (ultimo.fase !== 'procurando') mostrarJanela();
    return;
  }
  jaIniciado = true;

  const enviar = (s: UpdateState) => {
    ultimo = s;
    if (janela && !janela.isDestroyed()) janela.webContents.send('update:state', s);
    // 'procurando' é o único estado em que ainda faz sentido esperar escondido. Baixando,
    // a pessoa precisa ver o progresso; resolvido, o app abre.
    if (s.fase !== 'procurando') mostrar();
  };

  /**
   * Pergunta de novo de 15 em 15 min, e também quando a máquina acorda: dormindo, o relógio
   * para, e quem abre o notebook de manhã esperaria até 15 min por uma versão que já saiu.
   */
  let ultimaConsulta = Date.now();
  const periodicamente = (consultar: () => void) => {
    const vez = () => { ultimaConsulta = Date.now(); consultar(); };
    setInterval(vez, QUINZE_MINUTOS);
    const acordou = () => { if (Date.now() - ultimaConsulta >= INTERVALO_MINIMO) vez(); };
    powerMonitor.on('resume', acordou);
    powerMonitor.on('unlock-screen', acordou);
  };

  ipcMain.handle('update:atual', () => ultimo);
  // Sem a janela do instalador (28/11/2026, pedido do dono: "o Discord faz tão bonitinho
  // usando a própria interface"). `quitAndInstall()` sem argumentos roda o NSIS COM a
  // janela de "Instalando a Saga"; `(true, true)` passa `/S --force-run` — instala calado
  // e abre a Saga de volta. Quem fala com a pessoa no meio é a nossa tela de "Reiniciando…".
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(true, true));
  ipcMain.handle('open:external', (_e, url: string) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });

  // Em desenvolvimento não há o que atualizar: abre na hora. Na Microsoft Store quem
  // atualiza é a Store — e o instalador do GitHub, por cima de um pacote dela, seria uma
  // segunda Saga instalada ao lado, não uma versão nova desta.
  if (!app.isPackaged || process.windowsStore || REPO.startsWith('SEU_')) {
    enviar({ fase: 'nenhuma' });
    return;
  }

  // Rede lenta ou GitHub fora não podem prender ninguém na tela de partida.
  const destravar = setTimeout(() => {
    if (ultimo.fase === 'procurando') enviar({ fase: 'nenhuma' });
  }, LIMITE_DA_CONSULTA);

  if (process.platform === 'win32') {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (i) => enviar({ fase: 'baixando', version: i.version, progress: 0 }));
    autoUpdater.on('update-not-available', () => { clearTimeout(destravar); enviar({ fase: 'nenhuma' }); });
    autoUpdater.on('download-progress', (p) => {
      clearTimeout(destravar);   // está baixando: pode demorar o quanto precisar
      enviar({ fase: 'baixando', version: ultimo.version ?? '', progress: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (i) => enviar({ fase: 'pronto', version: i.version }));
    autoUpdater.on('error', (e) => {
      clearTimeout(destravar);
      // Falha ao atualizar não pode impedir de usar o app: avisa e segue.
      enviar({ fase: 'erro', mensagem: e.message });
      setTimeout(() => { if (ultimo.fase === 'erro') enviar({ fase: 'nenhuma' }); }, 4000);
    });

    autoUpdater.checkForUpdates().catch(() => undefined);
    periodicamente(() => {
      // Baixando ou já baixada, perguntar de novo só faria o aviso piscar de "pronta" para
      // "baixando 0%" e voltar — e a que está ali já é a mais nova.
      if (ultimo.fase === 'baixando' || ultimo.fase === 'pronto') return;
      autoUpdater.checkForUpdates().catch(() => undefined);
    });
    return;
  }

  // macOS: o app não é assinado pela Apple, então não pode se substituir sozinho.
  // Avisa e abre o download; quem arrasta por cima é a pessoa.
  const consultar = async (inicial: boolean) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { 'user-agent': 'saga-updater' },
      });
      if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
      const j = (await r.json()) as { tag_name: string; html_url: string; assets?: { name: string; browser_download_url: string }[] };
      const v = String(j.tag_name).replace(/^v/, '');
      if (!maisNova(v, app.getVersion())) { enviar({ fase: 'nenhuma' }); return; }
      const dmg = (j.assets ?? []).find((a) => a.name.endsWith('.dmg'));
      enviar({ fase: 'aviso', version: v, url: dmg?.browser_download_url ?? j.html_url });
    } catch (e) {
      // Sem internet na abertura não é motivo para segurar ninguém.
      if (inicial) enviar({ fase: 'nenhuma' });
      else console.error('updater:', (e as Error).message);
    } finally {
      clearTimeout(destravar);
    }
  };

  consultar(true);
  periodicamente(() => consultar(false));
}
