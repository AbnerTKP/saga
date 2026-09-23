import { app, ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registrar } from './registro';
import {
  ErroDaMusica, alvoDoPedido, argumentosParaBaixar, lerPedido, lerRespostaDoYtDlp, lerSpotify,
  type MusicaAchada, type Origem,
} from './buscaDeMusica';

/**
 * O bot de música, do lado de quem toca: achar a música e baixar o áudio.
 *
 * É o APP que faz isso, e não o servidor, porque o YouTube barra a VPS (medido em 22/09/2026:
 * 1 vídeo de 5 lá, 4 de 4 numa internet de casa). Quem acha e baixa é o `yt-dlp`, que NÃO vai
 * no instalador: ele é baixado na primeira música, para a pasta da Saga, e trocado quando sai
 * versão nova. O YouTube muda o tempo todo e o `yt-dlp` acompanha — embutido, ele quebraria
 * semanas depois de cada versão da Saga, e o conserto seria mandar 93 MB a todo mundo.
 *
 * Vai a versão EM PASTA (`_macos.zip`, `_win.zip`), e não o executável de arquivo único.
 * Medido num Mac em 22/09/2026: o de arquivo único se desempacota numa pasta temporária NOVA a
 * cada execução, e o macOS inspeciona o executável novo toda vez — 10 s só para o `--version`,
 * com 11% de CPU. O em pasta paga esses 10 s uma vez e depois parte em 0,26 s; achar e baixar
 * uma música leva 3,6 s.
 */

const ASSET: Record<string, string | undefined> = {
  darwin: 'yt-dlp_macos.zip',
  win32: process.arch === 'arm64' ? 'yt-dlp_win_arm64.zip' : process.arch === 'ia32' ? 'yt-dlp_win_x86.zip' : 'yt-dlp_win.zip',
  linux: process.arch === 'arm64' ? 'yt-dlp_linux_aarch64.zip' : 'yt-dlp_linux.zip',
};
/** Olhar se saiu versão nova de tanto em tanto. O YouTube quebra o yt-dlp mais ou menos por mês. */
const CONFERIR_A_CADA = 3 * 24 * 60 * 60 * 1000;
/** Áudio baixado fica um tempo, para a mesma música pedida de novo não baixar de novo. */
const GUARDAR_POR = 12 * 60 * 60 * 1000;
const ID = /^[A-Za-z0-9_-]{11}$/;

const raiz = () => join(app.getPath('userData'), 'musica');
const pastaDoPrograma = () => join(raiz(), 'yt-dlp');
const pastaDosAudios = () => join(raiz(), 'audios');
const arquivoDoEstado = () => join(pastaDoPrograma(), 'estado.json');

type Estado = { versao: string; binario: string; conferidoEm: number };

function lerEstado(): Estado | null {
  try {
    const e = JSON.parse(readFileSync(arquivoDoEstado(), 'utf8')) as Estado;
    return existsSync(e.binario) ? e : null;
  } catch { return null; }
}

function rodar(binario: string, args: string[], tempo = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binario, args, { timeout: tempo, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (erro, saida, falha) => {
      if (erro) {
        const motivo = String(falha || erro.message).split('\n').filter(Boolean).slice(-2).join(' | ');
        reject(new Error(motivo));
      } else resolve(saida);
    });
  });
}

/**
 * A última versão do yt-dlp. Pelo REDIRECIONAMENTO de `releases/latest` (github.com manda para
 * `.../releases/tag/<versão>`), e não pela API: a API tem cota de 60 perguntas por hora por IP,
 * e medido em 23/09/2026 ela respondeu 403 no meio de um teste — com cinco amigos atrás do mesmo
 * roteador, o primeiro /tocar de alguém falharia por isso. A API fica de reserva.
 */
async function ultimaVersao(): Promise<string> {
  try {
    const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest', { redirect: 'manual', headers: { 'user-agent': 'Saga' } });
    const m = /\/releases\/tag\/([^/?#]+)/.exec(r.headers.get('location') ?? '');
    if (m) return decodeURIComponent(m[1]);
  } catch { /* cai na API */ }
  const r = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Saga' },
  });
  if (!r.ok) throw new Error(`o GitHub respondeu ${r.status}`);
  const versao = String(((await r.json()) as { tag_name?: string }).tag_name ?? '');
  if (!versao) throw new Error('o GitHub não disse qual é a última versão');
  return versao;
}

/** Baixa e desempacota uma versão numa pasta própria; só depois ela passa a valer. */
async function instalar(versao: string): Promise<Estado> {
  const asset = ASSET[process.platform];
  if (!asset) throw new ErroDaMusica('O bot de música não funciona neste sistema.');
  const destino = join(pastaDoPrograma(), versao);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  const zip = join(pastaDoPrograma(), `${versao}.zip`);
  registrar('info', 'musica', `baixando o yt-dlp ${versao} (${asset})`);
  const r = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/download/${versao}/${asset}`);
  if (!r.ok) throw new Error(`o download do yt-dlp respondeu ${r.status}`);
  writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  // `tar` lê zip no Mac (bsdtar) e no Windows 10 em diante (tar.exe vem com o sistema).
  await rodar('tar', ['-xf', zip, '-C', destino], 120_000);
  rmSync(zip, { force: true });
  const nome = readdirSync(destino).find((n) => n.startsWith('yt-dlp') && !statSync(join(destino, n)).isDirectory());
  if (!nome) throw new Error('o pacote do yt-dlp veio sem o programa');
  const binario = join(destino, nome);
  if (process.platform !== 'win32') chmodSync(binario, 0o755);
  // A primeira partida é a lenta (o sistema inspeciona o executável): paga agora, e não na música.
  await rodar(binario, ['--version'], 60_000);
  const estado = { versao, binario, conferidoEm: Date.now() };
  writeFileSync(arquivoDoEstado(), JSON.stringify(estado));
  // As versões antigas saem depois que a nova já funciona.
  for (const n of readdirSync(pastaDoPrograma())) {
    if (n !== versao && n !== 'estado.json') rmSync(join(pastaDoPrograma(), n), { recursive: true, force: true });
  }
  registrar('info', 'musica', `yt-dlp ${versao} instalado`);
  return estado;
}

let instalando: Promise<Estado> | null = null;

/**
 * O programa pronto para usar. Sem nenhum instalado, espera instalar. Com um instalado, usa
 * ele e confere versão nova por trás — a música de agora não espera o GitHub. `forcar` é o
 * caso de o programa ter falhado: aí vale esperar pela versão nova, que pode ser o conserto.
 */
async function programa({ forcar = false } = {}): Promise<Estado> {
  mkdirSync(pastaDoPrograma(), { recursive: true });
  const atual = lerEstado();
  const vencido = !atual || forcar || Date.now() - atual.conferidoEm > CONFERIR_A_CADA;
  if (!vencido && atual) return atual;
  instalando ??= (async () => {
    try {
      const versao = await ultimaVersao();
      if (atual && atual.versao === versao) {
        const e = { ...atual, conferidoEm: Date.now() };
        writeFileSync(arquivoDoEstado(), JSON.stringify(e));
        return e;
      }
      return await instalar(versao);
    } finally { instalando = null; }
  })();
  if (atual && !forcar) {
    instalando.catch((e) => registrar('aviso', 'musica', `conferir versão do yt-dlp: ${(e as Error).message}`));
    return atual;
  }
  return instalando;
}

function limparAudiosVelhos() {
  try {
    for (const n of readdirSync(pastaDosAudios())) {
      const c = join(pastaDosAudios(), n);
      if (Date.now() - statSync(c).mtimeMs > GUARDAR_POR) rmSync(c, { force: true });
    }
  } catch { /* pasta ainda não existe */ }
}

const arquivoDe = (id: string) => {
  // O download em andamento tem nome próprio (`.part`, `.ytdl`): não é áudio ainda.
  try { return readdirSync(pastaDosAudios()).find((n) => n.startsWith(`${id}.`) && !/\.(part|ytdl)$/.test(n)) ?? null; } catch { return null; }
};

/** Roda o `yt-dlp` para achar e baixar. Falhou? Tenta de novo UMA vez com a versão mais nova. */
async function baixar(alvo: string): Promise<unknown> {
  mkdirSync(pastaDosAudios(), { recursive: true });
  const tentar = async (forcar: boolean) => {
    const { binario } = await programa({ forcar });
    const saida = await rodar(binario, argumentosParaBaixar(alvo, pastaDosAudios()));
    const linha = saida.trim().split('\n').filter(Boolean).at(-1);
    if (!linha) throw new ErroDaMusica('Não achei nada com esse nome.');
    return JSON.parse(linha) as unknown;
  };
  try { return await tentar(false); } catch (e) {
    if (e instanceof ErroDaMusica) throw e;
    registrar('aviso', 'musica', `yt-dlp falhou, tentando com a versão mais nova: ${(e as Error).message}`);
    return tentar(true);
  }
}

/** Do texto do `/tocar` à música achada e já baixada. */
async function achar(texto: string): Promise<MusicaAchada> {
  const pedido = lerPedido(texto);
  let spotify: { titulo: string; artista: string } | undefined;
  if (pedido.tipo === 'spotify') {
    // Cabeçalho de programa, e não de navegador: com o de navegador o Spotify manda a página
    // vazia do aplicativo web (medido) — ver `lerSpotify`.
    const r = await fetch(pedido.url, { headers: { 'user-agent': 'Saga' } });
    if (!r.ok) throw new ErroDaMusica('Não consegui abrir esse link do Spotify.');
    spotify = lerSpotify(await r.text());
  }
  const origem: Origem = pedido.tipo === 'youtube' ? 'youtube' : pedido.tipo === 'spotify' ? 'spotify' : 'busca';
  const musica = lerRespostaDoYtDlp(await baixar(alvoDoPedido(pedido, spotify)), origem);
  registrar('info', 'musica', `achada: ${musica.id} (${origem})`);
  return musica;
}

const explicar = (e: unknown) => e instanceof ErroDaMusica
  ? (e as Error).message
  : !lerEstado()
    ? `Não consegui preparar o bot de música neste computador (${(e as Error).message.slice(0, 120)}). Tente de novo daqui a pouco.`
    : `Não consegui buscar a música agora (${(e as Error).message.slice(0, 160)}).`;

export function registrarMusica() {
  limparAudiosVelhos();

  ipcMain.handle('musica:achar', async (_e, texto: string) => {
    try { return { ok: true, musica: await achar(String(texto ?? '')) }; } catch (e) {
      if (!(e instanceof ErroDaMusica)) registrar('erro', 'musica', `achar: ${(e as Error).message}`);
      return { ok: false, erro: explicar(e) };
    }
  });

  /** Garante o áudio de uma música da fila — é o anfitrião adiantando a próxima. */
  ipcMain.handle('musica:preparar', async (_e, id: string) => {
    if (!ID.test(String(id))) return { ok: false, erro: 'id inválido' };
    if (arquivoDe(id)) return { ok: true };
    try { await baixar(`https://www.youtube.com/watch?v=${id}`); return { ok: true }; } catch (e) {
      registrar('erro', 'musica', `preparar ${id}: ${(e as Error).message}`);
      return { ok: false, erro: explicar(e) };
    }
  });

  /** Os bytes do áudio, para a tela tocar num blob — ver `useMusica`. */
  ipcMain.handle('musica:ler', (_e, id: string) => {
    if (!ID.test(String(id))) return null;
    const nome = arquivoDe(id);
    if (!nome) return null;
    const tipo = nome.endsWith('.webm') ? 'audio/webm' : nome.endsWith('.m4a') || nome.endsWith('.mp4') ? 'audio/mp4' : 'audio/*';
    return { bytes: readFileSync(join(pastaDosAudios(), nome)), tipo };
  });
}
