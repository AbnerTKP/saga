import { app, BrowserWindow, ipcMain, session, desktopCapturer, systemPreferences, shell } from 'electron';
import { join, dirname } from 'node:path';
import { cpSync, existsSync } from 'node:fs';
import { setupUpdates } from './update';
import { iniciarRegistro, registrar } from './registro';

/**
 * O app se chamava "Cantinho do Vorcaro" e passou a se chamar "Saga".
 *
 * O Electron guarda os dados numa pasta com o NOME do app. Trocar o nome, sozinho, faria
 * a pasta nova nascer vazia: todo mundo deslogado, qualidade de transmissão no padrão,
 * marcador de mensagem lida zerado e o último apelido esquecido — tudo mora no
 * localStorage, que mora ali dentro. Ninguém ia ligar uma coisa à outra; ia parecer que a
 * versão nova apagou as contas.
 *
 * Então, na primeira vez que a pasta nova estiver vazia, a antiga é copiada por cima. Só
 * o que interessa: o cache tem 68 MB e se refaz sozinho. É de mão única e roda uma vez —
 * quando a pasta nova já tiver vida própria, a antiga vira lixo que a pessoa pode apagar.
 *
 * Tem de acontecer ANTES de o Electron abrir esses arquivos, por isso está aqui em cima e
 * não dentro do whenReady.
 */
const NOME_ANTIGO = 'Cantinho do Vorcaro';
const HERANCA = ['Local Storage', 'Session Storage', 'Preferences', 'registro'];

function herdarDoNomeAntigo() {
  try {
    const nova = app.getPath('userData');
    if (existsSync(join(nova, 'Local Storage'))) return;      // já tem vida própria
    const velha = join(dirname(nova), NOME_ANTIGO);
    if (!existsSync(join(velha, 'Local Storage'))) return;    // instalação nova, nada a herdar
    for (const parte of HERANCA) {
      const de = join(velha, parte);
      if (existsSync(de)) cpSync(de, join(nova, parte), { recursive: true });
    }
    console.log(`dados herdados de "${NOME_ANTIGO}"`);
  } catch (e) {
    // Herdar é conforto, não requisito: falhando, a pessoa faz login de novo.
    console.error('não deu para herdar os dados do nome antigo:', e);
  }
}

herdarDoNomeAntigo();

/**
 * Como o áudio do sistema é capturado. Os modos falham por motivos diferentes, e por isso
 * são tentados em ordem:
 *
 * - 'loopbackWithoutChrome' captura a saída do sistema MENOS o que o próprio app está
 *   tocando. É o que resolve o retorno: sem ele, as vozes da call saem pelos alto-falantes
 *   de quem transmite, entram na captura e voltam para todo mundo — e fone não adianta,
 *   porque a tomada é digital, no mix do motor de áudio, não no ar. Por dentro é captura
 *   por processo (WASAPI com PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE no Windows,
 *   CoreAudio Tap com lista de exclusão no Mac), e por isso pede Windows 11 ou macOS 14.2.
 *   Onde não houver, falha ou vem muda, e a ordem abaixo cai para o modo de sempre.
 * - 'loopback' escuta a saída inteira e deixa você ouvir também. É o caminho de sempre, e
 *   é ele que devolve a nossa própria voz.
 * - 'loopbackWithMute' escuta e silencia a saída — não a do app, a da MÁQUINA: quem
 *   transmite fica sem ouvir nada. Só serve quando a placa de som recusa o 'loopback'.
 *
 * A tipagem da Electron só conhece dois valores, mas ela repassa a string crua como id de
 * dispositivo, e o serviço de áudio do Chromium reconhece as outras. Daí o cast lá embaixo.
 */
type ModoDeAudio = 'nao' | 'loopbackWithoutChrome' | 'loopback' | 'loopbackWithMute';

let pendingSource: { id: string; audio: ModoDeAudio } | null = null;

// Qual seletor de tela usar: sempre o nosso.
//
// O do sistema tem uma vantagem — escolher a janela nele é a própria autorização, e não há
// permissão de Gravação de Tela para o macOS revogar. Mas ele não chama o nosso handler, e
// é só ali que se concede `audio: 'loopback'`. Medido: pelo seletor do sistema vêm 0 faixas
// de áudio; pelo nosso, 1, rotulada "System audio". Transmissão muda não serve.
//
// Já tentamos escolher entre os dois por `getMediaAccessStatus('screen')`, e deu errado na
// prática: com as duas chaves ligadas nos Ajustes, a resposta continuou vindo "negado" —
// a entrada na lista guarda a assinatura da versão anterior, e cada build nossa é assinada
// em ad-hoc, ou seja, tem assinatura própria. O app ficava preso no caminho sem som sem
// jeito de sair. Quem diz se a permissão existe passa a ser a única prova que não mente:
// o sistema devolver, ou não, a lista de telas.
const SELETOR_DO_SISTEMA = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#1e1f22',
    title: 'Saga',
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

  // O que o Chromium pode pedir. A lista parece ser só de mídia, mas 'fullscreen' precisa
  // estar aqui: no Electron, `requestFullscreen()` do renderer não entra em tela cheia
  // sozinho — passa por este handler. Negado, ele não vira erro: a promessa fica pendurada
  // para sempre, então nem o `catch` do renderer nem o registro veem alguma coisa. Foi o
  // que fez a tela cheia da transmissão nunca ter funcionado, em nenhuma versão.
  const PERMITIDAS = ['media', 'display-capture', 'notifications', 'fullscreen'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const pode = PERMITIDAS.includes(permission);
    // Negar em silêncio é o que custou caro: fica registrado para o próximo caso aparecer.
    if (!pode) registrar('aviso', 'permissao', `negada ao Chromium: ${permission}`);
    callback(pode);
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
      // O cast é por causa da tipagem estreita da Electron; ver o comentário de ModoDeAudio.
      callback(audio === 'nao'
        ? { video: chosen }
        : { video: chosen, audio: audio as 'loopback' | 'loopbackWithMute' });
    },
    { useSystemPicker: SELETOR_DO_SISTEMA },
  );

  ipcMain.handle('sources:list', async () => {
    // Sem permissão de Gravação de Tela, o macOS 26 com Electron 39 não devolve lista
    // vazia: o `getSources` LANÇA ("Failed to get sources"). Medido no registro do dono,
    // 10 vezes, contra zero vezes do caminho da lista vazia. Deixar a exceção subir pelo
    // ipc rejeitava a promessa no renderer, e a janela "Compartilhar tela" ficava presa
    // em "Carregando…" para sempre — a instrução de como conceder a permissão ficava
    // inalcançável justamente para quem precisava dela. Aqui a falha vira lista vazia,
    // que é o sintoma que o resto do app já sabe explicar.
    let sources: Electron.DesktopCapturerSource[];
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
    } catch (e) {
      registrar('aviso', 'tela', `o sistema recusou listar as telas: ${(e as Error).message}`);
      return [];
    }
    if (sources.length === 0) {
      registrar('aviso', 'tela', 'o sistema não devolveu nenhuma tela: permissão de Gravação de Tela');
    }
    return sources
      .filter((s) => !s.name.startsWith('Saga'))
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
