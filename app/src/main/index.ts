import { app, BrowserWindow, ipcMain, session, desktopCapturer, systemPreferences, shell } from 'electron';
import { join } from 'node:path';
import { setupUpdates } from './update';
import { iniciarRegistro, registrar } from './registro';

/**
 * O Chromium tem dois modos de capturar o áudio do sistema, e eles falham por motivos
 * diferentes: 'loopback' escuta a saída e deixa você ouvir também; 'loopbackWithMute'
 * escuta e silencia a saída local. Quando o primeiro é recusado pela placa de som, o
 * segundo às vezes passa — daí valer tentar os dois antes de desistir do áudio.
 */
type ModoDeAudio = 'nao' | 'loopback' | 'loopbackWithMute';

let pendingSource: { id: string; audio: ModoDeAudio } | null = null;

// No macOS 15+ a captura pelo desktopCapturer depende da permissão persistente de
// Gravação de Tela, que o sistema volta a pedir sozinho de tempos em tempos — daí o
// "já autorizei e ele pede de novo". Com o seletor nativo, escolher a janela é a própria
// autorização: não há permissão para guardar, nem para o sistema revogar.
// No Windows não existe seletor nativo, então lá seguimos com o nosso.
const SELETOR_DO_SISTEMA = process.platform === 'darwin';

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#1e1f22',
    title: 'Cantinho do Vorcaro',
    // Nasce escondida. Quem clica no ícone espera que o app já venha atualizado — ver a
    // janela abrir e só depois anunciar que há atualização é a ordem errada.
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Uma vez só: chamada de vários lugares, e mostrar de novo traria a janela para a
  // frente no meio do que a pessoa estivesse fazendo.
  let jaApareceu = false;
  const mostrar = () => {
    if (jaApareceu || win.isDestroyed()) return;
    jaApareceu = true;
    win.show();
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Carregar a tela é o essencial; atualização é acessório. Se algo falhar aqui, a janela
  // tem de abrir do mesmo jeito — antes, uma exceção aqui deixava a janela em branco.
  try {
    setupUpdates(win, mostrar);
  } catch (e) {
    registrar('erro', 'principal', `setupUpdates falhou: ${(e as Error).message}`);
    mostrar();
  }

  // Rede lenta ou GitHub fora não podem deixar ninguém olhando para o nada: passado esse
  // tempo a janela aparece de qualquer jeito, mostrando em que pé está a consulta.
  const naoDeixarPresa = setTimeout(mostrar, 2500);
  win.on('closed', () => clearTimeout(naoDeixarPresa));

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // Antes de qualquer coisa: se algo falhar na preparação, tem de ficar registrado.
  iniciarRegistro();

  // Permissões de mídia do Chromium: só o que o app usa
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'notifications'].includes(permission));
  });

  // Com o seletor nativo ligado, este handler não é chamado — o macOS resolve sozinho.
  // Ele continua aqui para o Windows e para macOS antigo, onde o seletor não existe.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const chosen = sources.find((s) => s.id === pendingSource?.id) ?? sources[0];
      const audio: ModoDeAudio = pendingSource?.audio ?? 'nao';
      pendingSource = null;
      if (!chosen) {
        registrar('erro', 'tela', 'nenhuma fonte de captura disponível');
        callback({});
        return;
      }
      // Registrado porque "o áudio não sai só no PC dele" só se investiga sabendo o que
      // foi pedido: tela inteira ou janela, e com ou sem o áudio do sistema.
      registrar('info', 'tela',
        `capturando ${chosen.id.startsWith('screen') ? 'tela inteira' : 'janela'} "${chosen.name}" | áudio do sistema: ${audio}`);
      callback(audio === 'nao' ? { video: chosen } : { video: chosen, audio });
    },
    { useSystemPicker: SELETOR_DO_SISTEMA },
  );

  ipcMain.handle('sources:list', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources
      .filter((s) => !s.name.startsWith('Cantinho do Vorcaro'))
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen') ? 'screen' : 'window',
        thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
      }));
  });

  ipcMain.handle('sources:choose', (_e, id: string, audio: ModoDeAudio) => {
    pendingSource = { id, audio };
  });

  ipcMain.handle('screen:seletorDoSistema', () => SELETOR_DO_SISTEMA);

  ipcMain.handle('screen:permission', () => {
    if (process.platform !== 'darwin') return 'granted';
    return systemPreferences.getMediaAccessStatus('screen');
  });

  ipcMain.handle('screen:openSettings', () => {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
  });

  ipcMain.handle('app:version', () => app.getVersion());

  createWindow();

  // A janela morrer sem explicação é a queixa mais difícil de investigar depois.
  BrowserWindow.getAllWindows().forEach((j) => {
    j.webContents.on('render-process-gone', (_e, d) => registrar('erro', 'janela', `processo caiu: ${d.reason}`));
    j.webContents.on('did-fail-load', (_e, codigo, desc) => registrar('erro', 'janela', `não carregou (${codigo}): ${desc}`));
  });

  // Pede microfone e câmera ao sistema sem travar a abertura da janela
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => false);
    systemPreferences.askForMediaAccess('camera').catch(() => false);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
