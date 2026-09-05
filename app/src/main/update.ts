import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

// Repositório público no GitHub onde os instaladores são publicados (Releases).
// Formato: "usuario/repositorio". Precisa ser o mesmo de electron-builder.yml → publish.
export const REPO = 'AbnerTKP/cantinho-do-vorcaro';

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

const SEIS_HORAS = 6 * 60 * 60 * 1000;
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

export function setupUpdates(win: BrowserWindow) {
  // O estado fica guardado porque a tela que o escuta pode montar depois do primeiro
  // aviso; sem isso a mensagem se perde e a tela fica esperando para sempre.
  let ultimo: UpdateState = { fase: 'procurando' };
  const enviar = (s: UpdateState) => {
    ultimo = s;
    if (!win.isDestroyed()) win.webContents.send('update:state', s);
  };

  ipcMain.handle('update:atual', () => ultimo);
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
  ipcMain.handle('open:external', (_e, url: string) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });

  // Em desenvolvimento não há o que atualizar: libera a tela na hora.
  if (!app.isPackaged || REPO.startsWith('SEU_')) {
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
    setInterval(() => autoUpdater.checkForUpdates().catch(() => undefined), SEIS_HORAS);
    return;
  }

  // macOS: o app não é assinado pela Apple, então não pode se substituir sozinho.
  // Avisa e abre o download; quem arrasta por cima é a pessoa.
  const consultar = async (inicial: boolean) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { 'user-agent': 'cantinho-updater' },
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
  setInterval(() => consultar(false), SEIS_HORAS);
}
