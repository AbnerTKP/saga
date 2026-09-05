import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

// Repositório público no GitHub onde os instaladores são publicados (Releases).
// Formato: "usuario/repositorio". Precisa ser o mesmo de electron-builder.yml → publish.
export const REPO = 'AbnerTKP/cantinho-do-vorcaro';

export type UpdateState = { version: string; url?: string; ready?: boolean; progress?: number };

const SIX_HOURS = 6 * 60 * 60 * 1000;

function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export function setupUpdates(win: BrowserWindow) {
  // O aviso é disparado 5s depois de abrir. Se a janela ainda estiver na tela de entrada,
  // o componente que escuta nem existe e a mensagem se perderia até a próxima checagem,
  // seis horas depois. Por isso o último estado fica guardado e pode ser perguntado.
  let ultimoAviso: UpdateState | null = null;
  const send = (s: UpdateState) => {
    ultimoAviso = s;
    if (!win.isDestroyed()) win.webContents.send('update:state', s);
  };

  ipcMain.handle('update:atual', () => ultimoAviso);
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
  ipcMain.handle('open:external', (_e, url: string) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });

  if (!app.isPackaged || REPO.startsWith('SEU_')) return;

  if (process.platform === 'win32') {
    // Windows: baixa em silêncio e instala quando o app fechar (ou no botão "reiniciar")
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (i) => send({ version: i.version, progress: 0 }));
    autoUpdater.on('download-progress', (p) => send({ version: '', progress: Math.round(p.percent) }));
    autoUpdater.on('update-downloaded', (i) => send({ version: i.version, ready: true }));
    autoUpdater.on('error', (e) => console.error('updater:', e.message));
    const check = () => autoUpdater.checkForUpdates().catch(() => undefined);
    setTimeout(check, 5000);
    setInterval(check, SIX_HOURS);
    return;
  }

  // macOS sem assinatura: não dá para trocar o app sozinho. Avisa e abre o download.
  const check = async () => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'user-agent': 'cantinho-updater' } });
      if (!r.ok) return;
      const j = (await r.json()) as { tag_name: string; html_url: string; assets?: { name: string; browser_download_url: string }[] };
      const v = String(j.tag_name).replace(/^v/, '');
      if (!isNewer(v, app.getVersion())) return;
      const dmg = (j.assets ?? []).find((a) => a.name.endsWith('.dmg'));
      send({ version: v, url: dmg?.browser_download_url ?? j.html_url });
    } catch { /* sem internet ou sem release ainda */ }
  };
  setTimeout(check, 5000);
  setInterval(check, SIX_HOURS);
}
