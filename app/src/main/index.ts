import { app, BrowserWindow, ipcMain, session, desktopCapturer, systemPreferences, shell, powerMonitor, dialog, globalShortcut, screen } from 'electron';
import { join, dirname } from 'node:path';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import { setupUpdates } from './update';
import { iniciarRegistro, registrar } from './registro';
import { AO_INICIAR, abriuComOSistema, anotarDecisao, deveLigarSozinho, jaDecidiu } from './inicio';
import {
  ATALHO_PADRAO, atalhoAceito, encaixarNaTela, gravar as gravarOverlay, ler as lerOverlay,
  type Retangulo,
} from './overlay';

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

/**
 * Uma Saga por computador.
 *
 * Abrindo junto com o sistema, "o app já está aberto quando eu clico no ícone" vira o caso
 * NORMAL — e sem trava o clique abria uma SEGUNDA Saga: duas conexões, dois sinais de
 * presença, dois avisos de quem chegou e a pessoa aparecendo duas vezes na lista. Quem não
 * pega a trava sai na hora; quem a tem recebe o `second-instance` e traz a janela para a
 * frente, que é o que a pessoa queria ao clicar. Medido com o Electron deste projeto: a
 * segunda instância recebe `false` e sai, e a primeira recebe o evento com os argumentos
 * com que a segunda foi aberta.
 */
const ehAPrimeira = app.requestSingleInstanceLock();

if (ehAPrimeira) {
  herdarDoNomeAntigo();
} else {
  app.quit();
}

// Definida pela janela, logo abaixo: é o que o clique no ícone faz com a Saga já aberta.
let trazerParaAFrente: () => void = () => {};

app.on('second-instance', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  trazerParaAFrente();
});

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

/**
 * O nome da entrada no arranque do Windows. Sem passar `name`, a Electron usa o
 * AppUserModelId — que não é escolha nossa e não é o que a pessoa reconhece na lista de
 * programas que abrem sozinhos.
 */
const NOME_NO_ARRANQUE = 'Saga';

/**
 * Se o app abre junto com o sistema — o que o SISTEMA responde, não o que pedimos.
 *
 * No Windows a leitura COMPARA: `openAtLogin` só volta verdadeiro se os argumentos batem
 * com os que foram gravados, e por isso a pergunta leva os mesmos `args` da escrita. E a
 * pessoa ainda pode ter desligado a entrada pelo Gerenciador de Tarefas sem apagá-la —
 * `executableWillLaunchAtLogin` é o campo que responde o que interessa: vai abrir mesmo?
 */
function abreComOSistema(): boolean {
  const s = app.getLoginItemSettings({ path: process.execPath, args: [AO_INICIAR] });
  return process.platform === 'win32' ? s.executableWillLaunchAtLogin : s.openAtLogin;
}

/** Devolve como FICOU, não o que foi pedido: assim a chave da tela não tem como mentir. */
function definirAberturaComOSistema(ligado: boolean): boolean {
  app.setLoginItemSettings(
    ligado
      ? { openAtLogin: true, enabled: true, name: NOME_NO_ARRANQUE, path: process.execPath, args: [AO_INICIAR] }
      : { openAtLogin: false, name: NOME_NO_ARRANQUE },
  );
  const ficou = abreComOSistema();
  registrar(ficou === ligado ? 'info' : 'aviso', 'inicio',
    `abrir junto com o sistema: pedido ${ligado}, ficou ${ficou}`);
  return ficou;
}

/** Liga sozinho na primeira abertura no Windows, e nunca mais. A regra está em `inicio.ts`. */
function ligarNaPrimeiraVez() {
  try {
    const pasta = app.getPath('userData');
    if (!deveLigarSozinho({ plataforma: process.platform, empacotado: app.isPackaged, jaDecidiu: jaDecidiu(pasta) })) return;
    // Anotar primeiro: só se liga o que se consegue lembrar de ter ligado.
    if (!anotarDecisao(pasta, true)) return;
    definirAberturaComOSistema(true);
  } catch (e) {
    registrar('erro', 'inicio', `não deu para ligar a abertura automática: ${(e as Error).message}`);
  }
}


/**
 * O overlay da live: a janela que fica por cima do jogo.
 *
 * Ela é aberta pela PRÓPRIA tela, com `window.open`, e não daqui. O motivo é o vídeo: a
 * faixa da live mora no renderer, e uma `MediaStreamTrack` não é transferível entre
 * janelas — medido, `postMessage` recusa com `DataCloneError`. O que atravessa é o
 * `ReadableStream` de quadros do `MediaStreamTrackProcessor`, e para transferi-lo é
 * preciso que uma janela tenha a outra na mão, o que só o `window.open` dá. Aqui ficam as
 * coisas que só o processo principal pode fazer: pôr a janela acima de tudo, deixar o
 * clique atravessar para o jogo, e o atalho global que destrava.
 */
const JANELA_DO_OVERLAY = 'overlay-da-live';

let overlay: BrowserWindow | null = null;
/** Travado é o estado normal: o overlay existe para ser olhado enquanto se joga. */
let overlayTravado = true;
let principal: BrowserWindow | null = null;

const telas = (): Retangulo[] => screen.getAllDisplays().map((d) => d.bounds);

/**
 * Travar é `setIgnoreMouseEvents`: o clique, a mira e o teclado vão todos para o jogo.
 *
 * `forward: true` mantém o movimento do mouse chegando à página mesmo travado — sem isso
 * o overlay não saberia sequer que o ponteiro passou por cima, e destravar teria de ser
 * sempre às cegas.
 */
function travarOverlay(travado: boolean) {
  overlayTravado = travado;
  if (!overlay || overlay.isDestroyed()) return;
  overlay.setIgnoreMouseEvents(travado, { forward: true });
  overlay.webContents.send('overlay:travado', travado);
  if (principal && !principal.isDestroyed()) principal.webContents.send('overlay:travado', travado);
}

/** O que ficou anotado, para a janela voltar onde estava na próxima vez. */
function anotarDoOverlay(mudanca: { bounds?: Retangulo; atalho?: string }) {
  const pasta = app.getPath('userData');
  gravarOverlay(pasta, { ...lerOverlay(pasta), ...mudanca });
}

/**
 * O atalho que trava e destrava, e que precisa funcionar com o JOGO na frente — por isso
 * é global, e não uma tecla da janela. Devolve o que FICOU: outro programa pode já estar
 * com ele, e uma tela que afirma o que não aconteceu é pior que uma que diz "não deu".
 */
function registrarAtalho(texto: string): string | null {
  globalShortcut.unregisterAll();
  const aceito = atalhoAceito(texto) ?? ATALHO_PADRAO;
  try {
    const deu = globalShortcut.register(aceito, () => travarOverlay(!overlayTravado));
    if (!deu) registrar('aviso', 'overlay', `o atalho ${aceito} já é de outro programa`);
    return deu ? aceito : null;
  } catch (e) {
    registrar('erro', 'overlay', `atalho ${aceito}: ${(e as Error).message}`);
    return null;
  }
}

/** As opções da janela do overlay. Sem moldura, sem sombra e sem barra de tarefas: ela é
    um pedaço de imagem por cima do jogo, não um programa a mais na sua barra. */
function opcoesDoOverlay(): Electron.BrowserWindowConstructorOptions {
  const guardado = lerOverlay(app.getPath('userData'));
  const bounds = encaixarNaTela(guardado.bounds, telas(), screen.getPrimaryDisplay().bounds);
  return {
    ...bounds,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    // Nasce escondida e aparece SEM roubar o foco: quem está jogando não pode perder o
    // jogo porque a live abriu.
    show: false,
    title: 'Live',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  };
}

/** Tudo o que só se pode fazer daqui, depois de a janela nascer. */
function prepararOverlay(janela: BrowserWindow) {
  overlay = janela;
  // 'screen-saver' é o degrau acima do que qualquer janela comum alcança; sem ele o
  // overlay some atrás do jogo assim que o jogo ganha o foco.
  janela.setAlwaysOnTop(true, 'screen-saver');
  // No Mac, tela cheia é um espaço PRÓPRIO: sem isto o overlay fica no espaço de trás.
  janela.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  travarOverlay(true);
  janela.once('ready-to-show', () => janela.showInactive());
  const anotar = () => { if (!janela.isDestroyed()) anotarDoOverlay({ bounds: janela.getBounds() }); };
  janela.on('moved', anotar);
  janela.on('resized', anotar);
  janela.on('closed', () => {
    overlay = null;
    globalShortcut.unregisterAll();
    if (principal && !principal.isDestroyed()) principal.webContents.send('overlay:fechou');
  });
  registrarAtalho(lerOverlay(app.getPath('userData')).atalho);
  registrar('info', 'overlay', `aberto em ${JSON.stringify(janela.getBounds())}`);
}

function createWindow() {
  // Quem abriu a Saga: a pessoa, ou o arranque do sistema? No Windows a resposta vem no
  // argumento gravado na entrada de arranque; no Mac, do próprio sistema.
  let porLogin = false;
  try { porLogin = app.getLoginItemSettings().wasOpenedAtLogin; } catch { /* não é motivo para não abrir */ }
  const aoIniciar = abriuComOSistema(process.argv, porLogin);

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
      /**
       * A Saga não pode ser estrangulada por estar atrás de outra janela.
       *
       * O Chromium reduz os `setInterval` de janela escondida e, depois de alguns
       * minutos, quase os congela. Aqui isso não é economia: as buscas do app SÃO
       * relógios, e o sinal de vida também — a pessoa apareceria offline para os amigos
       * só por estar com o app atrás do navegador.
       */
      backgroundThrottling: false,
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
    // Aberta pelo arranque, a janela não toma a tela: quem ligou o computador ia fazer
    // outra coisa. Ela vai encolhida para a barra de tarefas, o que já basta para você
    // entrar online — e continua à vista ali, que é o que um app sem ícone ao lado do
    // relógio precisa: escondido de vez, não há como trazê-lo de volta.
    if (aoIniciar) { win.showInactive(); win.minimize(); return; }
    win.show();
  };

  // O clique no ícone com a Saga já aberta chega aqui, pelo `second-instance`. Marcar
  // `jaApareceu` é o que impede a consulta de atualização de "mostrar" depois uma janela
  // que a pessoa já está olhando.
  trazerParaAFrente = () => {
    if (win.isDestroyed()) return;
    jaApareceu = true;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  principal = win;

  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // A única janela nossa que se abre da tela é o overlay da live; todo o resto é link,
    // e link abre no navegador da pessoa.
    if (frameName === JANELA_DO_OVERLAY) {
      return { action: 'allow', overrideBrowserWindowOptions: opcoesDoOverlay() };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-create-window', (janela, { frameName }) => {
    if (frameName === JANELA_DO_OVERLAY) prepararOverlay(janela);
  });

  // Fechando a Saga, o overlay vai junto: uma imagem por cima do jogo sem app por trás
  // não tem como ser fechada — não tem moldura nem entrada na barra de tarefas.
  win.on('closed', () => {
    if (overlay && !overlay.isDestroyed()) overlay.close();
    if (principal === win) principal = null;
  });

  /**
   * A máquina acordou: a tela vai buscar tudo de novo.
   *
   * Dormindo, os relógios do app param — e é neles que TODA busca se apoia. Quem voltou
   * ao computador via o app do jeito que ficou, esperando a próxima volta de um relógio
   * que acabou de descongelar. Só o processo principal sabe que a máquina dormiu; dentro
   * da janela não existe esse aviso.
   */
  const acordou = () => { if (!win.isDestroyed()) win.webContents.send('app:acordou'); };
  powerMonitor.on('resume', acordou);
  powerMonitor.on('unlock-screen', acordou);
  win.on('closed', () => {
    powerMonitor.off('resume', acordou);
    powerMonitor.off('unlock-screen', acordou);
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
  // A segunda Saga já pediu para sair lá em cima; daqui para baixo é coisa de app que fica.
  if (!ehAPrimeira) return;

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

  /**
   * Quanto tempo a MÁQUINA está parada, em segundos.
   *
   * "Ausente mesmo fora da máquina" só o processo principal sabe dizer: dentro da janela
   * não se vê teclado nem mouse fora do app, então a página acharia que você está ali
   * enquanto você foi almoçar. Com a tela bloqueada, o sistema já conta como ociosidade.
   */
  ipcMain.handle('presenca:ociosidade', () => {
    try { return powerMonitor.getSystemIdleTime(); } catch { return 0; }
  });

  /**
   * Salva um anexo do chat, com o diálogo do sistema.
   *
   * Baixar tem de acontecer AQUI e não na tela: no renderer o `<a download>` e o
   * `showSaveFilePicker` não têm para onde escrever, e a alternativa seria abrir o
   * arquivo no navegador — que é justamente o que não se quer com arquivo que veio de
   * fora. Aqui a pessoa escolhe onde põe, e nada é aberto nem executado.
   */
  ipcMain.handle('arquivo:salvar', async (_e, url: string, nome: string) => {
    const janela = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const escolha = await dialog.showSaveDialog(janela, { defaultPath: nome });
    if (escolha.canceled || !escolha.filePath) return { ok: false };
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`o servidor respondeu ${r.status}`);
      writeFileSync(escolha.filePath, Buffer.from(await r.arrayBuffer()));
      return { ok: true, caminho: escolha.filePath };
    } catch (e) {
      registrar('erro', 'arquivo', `salvar "${nome}": ${(e as Error).message}`);
      return { ok: false, erro: (e as Error).message };
    }
  });

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

  /**
   * O overlay: travar, redimensionar, fechar e trocar o atalho.
   *
   * Mover a janela não passa por aqui — quem arrasta é a região `-webkit-app-region: drag`
   * da própria página, que é o caminho nativo. Redimensionar, sim: numa janela sem moldura
   * não há borda para agarrar, então as quinas do overlay mandam o tamanho pedido.
   */
  ipcMain.handle('overlay:travar', (_e, travado: boolean) => {
    travarOverlay(!!travado);
    return overlayTravado;
  });

  ipcMain.handle('overlay:estado', () => ({
    aberto: !!overlay && !overlay.isDestroyed(),
    travado: overlayTravado,
    atalho: lerOverlay(app.getPath('userData')).atalho,
  }));

  ipcMain.handle('overlay:redimensionar', (_e, pedido: Retangulo) => {
    if (!overlay || overlay.isDestroyed()) return null;
    // Passa pela mesma régua de sempre: nada de sumir num monitor que não existe mais.
    const bounds = encaixarNaTela(pedido, telas(), screen.getPrimaryDisplay().bounds);
    overlay.setBounds(bounds);
    anotarDoOverlay({ bounds });
    return bounds;
  });

  ipcMain.handle('overlay:fechar', () => {
    if (overlay && !overlay.isDestroyed()) overlay.close();
  });

  /** Devolve o atalho que FICOU valendo, que pode não ser o pedido: outro programa pode
      já estar com ele. */
  ipcMain.handle('overlay:atalho', (_e, texto: string) => {
    const aceito = atalhoAceito(texto);
    if (!aceito) return { atalho: lerOverlay(app.getPath('userData')).atalho, valeu: false };
    anotarDoOverlay({ atalho: aceito });
    // Só há atalho registrado enquanto o overlay existe; sem ele, fica anotado para a
    // próxima abertura.
    const ficou = overlay && !overlay.isDestroyed() ? registrarAtalho(aceito) : aceito;
    return { atalho: aceito, valeu: ficou === aceito };
  });

  ipcMain.handle('app:version', () => app.getVersion());

  // Abrir junto com o sistema. `disponivel` é falso em desenvolvimento: ali o executável é
  // o Electron, e o que se gravaria no arranque não é a Saga de ninguém.
  ipcMain.handle('inicio:estado', () => ({
    disponivel: app.isPackaged,
    ligado: app.isPackaged && abreComOSistema(),
  }));

  ipcMain.handle('inicio:definir', (_e, ligado: boolean) => {
    if (!app.isPackaged) return { disponivel: false, ligado: false };
    const ficou = definirAberturaComOSistema(!!ligado);
    anotarDecisao(app.getPath('userData'), ficou);
    return { disponivel: true, ligado: ficou };
  });

  ligarNaPrimeiraVez();

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

// Atalho global é do sistema inteiro: deixá-lo registrado depois de sair tiraria a tecla
// de quem ficou.
app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
