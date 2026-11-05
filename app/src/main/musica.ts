import { app, ipcMain } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { registrar } from './registro';
import {
  ErroDaMusica, MAXIMO_POR_PLAYLIST, alvoDoPedido, argumentosDaBusca, argumentosDaPlaylist, argumentosParaBaixar,
  lerEmbedDoSpotify, lerLinhaDaBusca, lerPedido, lerPlaylistDoYtDlp, lerRespostaDoYtDlp, lerSpotify,
  type MusicaAchada, type Origem, type Pedido, type PlaylistAchada,
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

/**
 * Fora do pacote da Microsoft Store: lá, baixar e executar um programa que não veio no pacote
 * é motivo de recusa. Ali nada aqui baixa nem executa o `yt-dlp` — achar e preparar respondem
 * o aviso, e ler não devolve nada. A tela sabe disso por `musica.disponivel`, no preload.
 */
const LIGADO = !process.windowsStore;
const DESLIGADO = 'O bot de música não funciona na versão da Microsoft Store.';

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

function rodar(binario: string, args: string[], tempo = 120_000, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binario, args, { timeout: tempo, maxBuffer: 64 * 1024 * 1024, windowsHide: true, cwd }, (erro, saida, falha) => {
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
/**
 * A versão vira nome de pasta — e pasta que se apaga com `rmSync` recursivo. Um `..` vindo de
 * resposta estranha apagaria a pasta de dados da Saga (achado na revisão de 23/09/2026).
 */
const VERSAO = /^[\w.-]{1,40}$/;
const valida = (v: string) => (VERSAO.test(v) && !v.includes('..') ? v : null);

/** Todo pedido à internet daqui tem prazo: sem ele, o "Procurando…" podia ficar minutos. */
const comPrazo = (ms: number) => AbortSignal.timeout(ms);

async function ultimaVersao(): Promise<string> {
  try {
    const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest', { redirect: 'manual', headers: { 'user-agent': 'Saga' }, signal: comPrazo(15_000) });
    const m = /\/releases\/tag\/([^/?#]+)/.exec(r.headers.get('location') ?? '');
    const v = m && valida(decodeURIComponent(m[1]));
    if (v) return v;
  } catch { /* cai na API */ }
  const r = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'Saga' }, signal: comPrazo(15_000),
  });
  if (!r.ok) throw new Error(`o GitHub respondeu ${r.status}`);
  const versao = valida(String(((await r.json()) as { tag_name?: string }).tag_name ?? ''));
  if (!versao) throw new Error('o GitHub não disse qual é a última versão');
  return versao;
}

/** O `tar` do sistema. No Windows, pelo caminho do sistema, e não pelo PATH de quem usa. */
const TAR = process.platform === 'win32'
  ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  : 'tar';

/** Baixa e desempacota uma versão numa pasta própria; só depois ela passa a valer. */
async function instalar(versao: string): Promise<Estado> {
  const asset = ASSET[process.platform];
  if (!asset) throw new ErroDaMusica('O bot de música não funciona neste sistema.');
  const destino = join(pastaDoPrograma(), versao);
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  const zip = join(pastaDoPrograma(), `${versao}.zip`);
  registrar('info', 'musica', `baixando o yt-dlp ${versao} (${asset})`);
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${versao}`;
  const r = await fetch(`${base}/${asset}`, { signal: comPrazo(5 * 60_000) });
  if (!r.ok) throw new Error(`o download do yt-dlp respondeu ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  // O programa roda com a conta da pessoa: confere a soma que o próprio yt-dlp publica ao lado
  // de cada versão antes de desempacotar qualquer coisa.
  const somas = await fetch(`${base}/SHA2-256SUMS`, { signal: comPrazo(30_000) });
  if (!somas.ok) throw new Error(`as somas do yt-dlp responderam ${somas.status}`);
  const esperada = (await somas.text()).split('\n').map((l) => l.trim().split(/\s+/))
    .find(([, nome]) => nome === asset)?.[0];
  const deVerdade = createHash('sha256').update(bytes).digest('hex');
  if (!esperada || esperada !== deVerdade) throw new Error(`o yt-dlp baixado não confere com a soma publicada (${asset})`);
  writeFileSync(zip, bytes);
  // `tar` lê zip no Mac (bsdtar) e no Windows 10 em diante (tar.exe vem com o sistema).
  await rodar(TAR, ['-xf', zip, '-C', destino], 120_000);
  rmSync(zip, { force: true });
  const nome = readdirSync(destino).find((n) => n.startsWith('yt-dlp') && !statSync(join(destino, n)).isDirectory());
  if (!nome) throw new Error('o pacote do yt-dlp veio sem o programa');
  const binario = join(destino, nome);
  if (process.platform !== 'win32') chmodSync(binario, 0o755);
  // A primeira partida é a lenta (o sistema inspeciona o executável): paga agora, e não na música.
  await rodar(binario, ['--version'], 60_000);
  const estado = { versao, binario, conferidoEm: Date.now() };
  writeFileSync(arquivoDoEstado(), JSON.stringify(estado));
  // As versões antigas ficam até a próxima abertura da Saga (`limparVersoesVelhas`): uma delas
  // pode estar baixando uma música agora, e no Windows apagar programa aberto falha pela metade.
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

/** Na abertura da Saga, nenhum yt-dlp está rodando: é a hora de tirar as versões velhas. */
function limparVersoesVelhas() {
  const atual = lerEstado()?.versao;
  if (!atual) return;
  try {
    for (const n of readdirSync(pastaDoPrograma())) {
      if (n === atual || n === 'estado.json') continue;
      try { rmSync(join(pastaDoPrograma(), n), { recursive: true, force: true }); } catch { /* fica para a próxima */ }
    }
  } catch { /* pasta ainda não existe */ }
}

function limparAudiosVelhos() {
  try {
    for (const n of readdirSync(pastaDosAudios())) {
      const c = join(pastaDosAudios(), n);
      if (Date.now() - statSync(c).mtimeMs > GUARDAR_POR) rmSync(c, { force: true });
    }
  } catch { /* pasta ainda não existe */ }
}

/**
 * O arquivo de áudio pronto de uma música. Só o nome exato conta: o download em andamento tem
 * nomes próprios (`.part`, `.ytdl`, `.part-Frag1`), e tocá-lo seria tocar um pedaço.
 */
const arquivoDe = (id: string) => {
  const pronto = new RegExp(`^${id}\\.(webm|m4a|mp4|opus|ogg|mp3)$`);
  try { return readdirSync(pastaDosAudios()).find((n) => pronto.test(n)) ?? null; } catch { return null; }
};

/** Os yt-dlp rodando agora: fechar a Saga os encerra, em vez de deixá-los baixando sozinhos. */
const rodando = new Set<ChildProcess>();

/** O que um download interrompido deixou (`.part`, `.ytdl`). */
function apagarPedacos(id: string) {
  try {
    for (const n of readdirSync(pastaDosAudios())) {
      if (n.startsWith(`${id}.`) && /\.(part|ytdl)/.test(n)) rmSync(join(pastaDosAudios(), n), { force: true });
    }
  } catch { /* nada a apagar */ }
}

/** Os downloads em andamento, por id: quem pede o mesmo áudio espera este, e não baixa de novo. */
const baixando = new Map<string, Promise<void>>();

/**
 * Roda o `yt-dlp` e devolve os dados da música ASSIM QUE ele os imprime — antes de baixar —,
 * com o fim do download numa promessa à parte. Medido em 23/09/2026 com o Mac do dono (atrás do
 * Cloudflare WARP): dados em 5,1 s, arquivo pronto em 7,2 s. Esperar o arquivo para avisar o
 * servidor era deixar a call esperando o download sem motivo.
 */
function iniciar(binario: string, alvo: string): Promise<{ dados: unknown; fim: Promise<void>; parar: () => void }> {
  return new Promise((resolve, reject) => {
    // Na pasta dos áudios, e não na de onde a Saga abriu: o yt-dlp procura configuração ali.
    const p = spawn(binario, argumentosParaBaixar(alvo, pastaDosAudios()), { windowsHide: true, cwd: pastaDosAudios() });
    rodando.add(p);
    let saida = '', falha = '', respondeu = false;
    let terminou!: () => void, falhou!: (e: Error) => void;
    const fim = new Promise<void>((a, b) => { terminou = a; falhou = b; });
    fim.catch(() => undefined);
    // Teto só contra processo pendurado: música de 2 h numa internet lenta leva minutos.
    const prazo = setTimeout(() => p.kill(), 15 * 60_000);
    const parar = () => { if (p.exitCode === null) p.kill(); };
    p.stdout.on('data', (d: Buffer) => {
      saida += d.toString();
      const quebra = saida.indexOf('\n');
      if (respondeu || quebra < 0) return;
      respondeu = true;
      try { resolve({ dados: JSON.parse(saida.slice(0, quebra)), fim, parar }); } catch (e) { parar(); reject(e as Error); }
    });
    p.stderr.on('data', (d: Buffer) => { falha += d.toString(); });
    p.on('error', (e) => { if (!respondeu) { respondeu = true; reject(e); } falhou(e); });
    p.on('close', (codigo) => {
      clearTimeout(prazo);
      rodando.delete(p);
      if (codigo === 0) {
        if (!respondeu) { respondeu = true; reject(new ErroDaMusica('Não achei nada com esse nome.')); }
        terminou();
        return;
      }
      const motivo = new Error(falha.split('\n').filter(Boolean).slice(-2).join(' | ') || `o yt-dlp saiu com ${codigo}`);
      if (!respondeu) { respondeu = true; reject(motivo); }
      falhou(motivo);
    });
  });
}

/**
 * Acha a música e começa a baixar. Devolve os dados; o fim do download fica em `baixando`.
 * Falhou? Tenta de novo UMA vez com a versão mais nova do yt-dlp.
 */
async function baixar(alvo: string): Promise<unknown> {
  mkdirSync(pastaDosAudios(), { recursive: true });
  const tentar = async (forcar: boolean) => {
    const { binario } = await programa({ forcar });
    const { dados, fim, parar } = await iniciar(binario, alvo);
    const id = (dados as { id?: unknown })?.id;
    // Confere ANTES de deixar baixar: ao vivo, sem duração ou comprida demais para. Sem isto,
    // o servidor recusava e o download seguia por trás — medido em 23/09/2026, uma busca por
    // "1 hour mix" trouxe um vídeo de 6 h e 399 MB.
    try { lerRespostaDoYtDlp(dados, 'busca'); } catch (e) {
      parar();
      if (typeof id === 'string') setTimeout(() => apagarPedacos(id), 2000);
      throw e;
    }
    if (typeof id === 'string') {
      baixando.set(id, fim);
      fim.catch((e) => registrar('erro', 'musica', `baixar ${id}: ${(e as Error).message}`))
        .finally(() => { if (baixando.get(id) === fim) baixando.delete(id); });
    }
    return dados;
  };
  try { return await tentar(false); } catch (e) {
    if (e instanceof ErroDaMusica) throw e;
    registrar('aviso', 'musica', `yt-dlp falhou, tentando com a versão mais nova: ${(e as Error).message}`);
    return tentar(true);
  }
}

/**
 * Quanto ler da playlist. Mais que o teto, porque vídeo apagado ou privado não conta; e bem mais
 * quando o link é de um vídeo do meio dela, que precisa aparecer no trecho lido.
 */
const LER_DA_PLAYLIST = MAXIMO_POR_PLAYLIST + 30;
const LER_ATE_O_VIDEO = 500;

/** A playlist do YouTube inteira, sem baixar nada: a primeira música só baixa quando for tocar. */
async function acharPlaylistDoYoutube(p: Extract<Pedido, { tipo: 'playlist-youtube' }>): Promise<PlaylistAchada | null> {
  mkdirSync(pastaDosAudios(), { recursive: true });
  const teto = p.aPartirDe ? LER_ATE_O_VIDEO : LER_DA_PLAYLIST;
  const ler = async (forcar: boolean) => {
    const { binario } = await programa({ forcar });
    return rodar(binario, argumentosDaPlaylist(p.url, teto), 60_000, pastaDosAudios());
  };
  let saida: string;
  try { saida = await ler(false); } catch (e) {
    // Lista que não existe ou é privada não melhora com um yt-dlp mais novo.
    if (!/does not exist|private|unavailable/i.test((e as Error).message)) {
      registrar('aviso', 'musica', `playlist: tentando com a versão mais nova do yt-dlp: ${(e as Error).message}`);
      try { saida = await ler(true); } catch { saida = 'null'; }
    } else saida = 'null';
  }
  try { return lerPlaylistDoYtDlp(JSON.parse(saida), p.aPartirDe); } catch (e) {
    // Veio de um vídeo: a lista não abrir não impede de tocar o vídeo que a pessoa está vendo.
    if (p.aPartirDe) return null;
    throw e;
  }
}

/** As buscas de playlist do Spotify que seguem por trás, por id. Ver `buscarPorTras`. */
type BuscaPorTras = { novas: MusicaAchada[]; achadas: number; de: number; acabou: boolean; acordar: (() => void) | null; parar: () => void };
const buscas = new Map<string, BuscaPorTras>();
let serieDaBusca = 0;

/**
 * O resto de uma playlist do Spotify, procurado no YouTube sem baixar nada: ~1 s por música
 * (medido em 04/11/2026), 50 s para uma lista cheia. Esperar tudo seria deixar a call muda
 * esse tempo; por isso a primeira já toca e as outras vão para a fila aos poucos (`musica:mais`).
 */
async function buscarPorTras(termos: string[]): Promise<string | null> {
  if (termos.length === 0) return null;
  const { binario } = await programa();
  const p = spawn(binario, argumentosDaBusca(termos), { windowsHide: true, cwd: pastaDosAudios() });
  rodando.add(p);
  const id = String(++serieDaBusca);
  const b: BuscaPorTras = { novas: [], achadas: 0, de: termos.length, acabou: false, acordar: null, parar: () => { if (p.exitCode === null) p.kill(); } };
  buscas.set(id, b);
  const acordar = () => { b.acordar?.(); b.acordar = null; };
  const prazo = setTimeout(() => p.kill(), 5 * 60_000);
  let resto = '';
  p.stdout.on('data', (d: Buffer) => {
    resto += d.toString();
    const linhas = resto.split('\n');
    resto = linhas.pop() ?? '';
    for (const linha of linhas) {
      const m = lerLinhaDaBusca(linha);
      if (m) { b.novas.push(m); b.achadas += 1; }
    }
    acordar();
  });
  p.stderr.resume();
  const fim = () => {
    clearTimeout(prazo);
    rodando.delete(p);
    b.acabou = true;
    acordar();
    // Quem pedia pode ter sumido (a tela recarregou): a busca não fica guardada para sempre.
    setTimeout(() => buscas.delete(id), 60_000).unref();
  };
  p.on('error', (e) => { registrar('erro', 'musica', `buscar a playlist: ${e.message}`); fim(); });
  p.on('close', fim);
  return id;
}

/** O que a busca já achou. Junta alguns segundos: um pedido ao servidor por música seria à toa. */
async function maisDaBusca(id: string): Promise<{ musicas: MusicaAchada[]; fim: boolean; achadas: number; de: number }> {
  const b = buscas.get(id);
  if (!b) return { musicas: [], fim: true, achadas: 0, de: 0 };
  const limite = Date.now() + 4000;
  while (!b.acabou && b.novas.length < 5) {
    const falta = limite - Date.now();
    if (falta <= 0 && b.novas.length > 0) break;
    await new Promise<void>((pronto) => {
      const t = setTimeout(pronto, Math.max(falta, 500));
      b.acordar = () => { clearTimeout(t); pronto(); };
    });
  }
  const musicas = b.novas.splice(0);
  return { musicas, fim: b.acabou && b.novas.length === 0, achadas: b.achadas, de: b.de };
}

/**
 * A playlist do Spotify: acha e já começa a baixar a primeira que der, como numa música só, e
 * deixa as outras procurando por trás. `quantas` conta as que ainda podem vir: se uma não for
 * achada, a fila fica com uma a menos do que o cartão disse.
 */
async function acharPlaylistDoSpotify(p: Extract<Pedido, { tipo: 'playlist-spotify' }>): Promise<PlaylistAchada & { continuar: string | null }> {
  const r = await fetch(p.url, { headers: { 'user-agent': 'Saga' }, signal: comPrazo(15_000) });
  if (!r.ok) throw new ErroDaMusica('Não consegui abrir essa playlist do Spotify.');
  const { nome, faixas, maisDe } = lerEmbedDoSpotify(await r.text());
  const lista = faixas.slice(0, MAXIMO_POR_PLAYLIST);
  const termos = lista.map((f) => `${f.artista} ${f.titulo}`.trim().slice(0, 200));
  // A primeira que der: uma faixa que o YouTube não acha não pode derrubar a playlist inteira.
  let primeira: MusicaAchada | null = null, usados = 0, erro: unknown = null;
  while (!primeira && usados < Math.min(3, termos.length)) {
    const alvo = `ytsearch1:${termos[usados]}`;
    usados += 1;
    try { primeira = lerRespostaDoYtDlp(await baixar(alvo), 'spotify'); } catch (e) { erro = e; }
  }
  if (!primeira) throw erro;
  return {
    nome,
    // A faixa que o YouTube não achou não conta: "só couberam 29 de 30" seria falso, nada foi cortado.
    total: faixas.length - usados + 1,
    maisDe,
    quantas: lista.length - usados + 1,
    duracao: lista.slice(usados - 1).reduce((soma, f) => soma + f.duracao, 0),
    origem: 'spotify',
    musicas: [primeira],
    continuar: await buscarPorTras(termos.slice(usados)),
  };
}

/** Do texto do `/tocar` à música achada — o download segue por trás (ver `iniciar`). */
async function achar(texto: string): Promise<{ musica: MusicaAchada } | { playlist: PlaylistAchada & { continuar: string | null } }> {
  const pedido = lerPedido(texto);
  if (pedido.tipo === 'playlist-spotify') {
    const playlist = await acharPlaylistDoSpotify(pedido);
    registrar('info', 'musica', `playlist achada: ${playlist.quantas} de ${playlist.total} (spotify)`);
    return { playlist };
  }
  if (pedido.tipo === 'playlist-youtube') {
    const lida = await acharPlaylistDoYoutube(pedido);
    if (lida) {
      registrar('info', 'musica', `playlist achada: ${lida.quantas} de ${lida.total} (youtube)`);
      return { playlist: { ...lida, continuar: null } };
    }
    // A lista não abriu, ou o vídeo não está no trecho lido: toca o vídeo do link.
    return { musica: await acharUma({ tipo: 'youtube', url: `https://www.youtube.com/watch?v=${pedido.aPartirDe}` }) };
  }
  return { musica: await acharUma(pedido) };
}

async function acharUma(pedido: Extract<Pedido, { tipo: 'youtube' | 'spotify' | 'busca' }>): Promise<MusicaAchada> {
  let spotify: { titulo: string; artista: string } | undefined;
  if (pedido.tipo === 'spotify') {
    // Cabeçalho de programa, e não de navegador: com o de navegador o Spotify manda a página
    // vazia do aplicativo web (medido) — ver `lerSpotify`.
    const r = await fetch(pedido.url, { headers: { 'user-agent': 'Saga' }, signal: comPrazo(15_000) });
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

/** O mesmo áudio pedido duas vezes seguidas (a próxima adiantada e o Pular) espera um só download. */
const preparando = new Map<string, Promise<void>>();

export function registrarMusica() {
  limparAudiosVelhos();
  limparVersoesVelhas();
  // A Saga abre com o sistema e fica dias aberta: limpar só na abertura enchia o disco.
  setInterval(limparAudiosVelhos, 60 * 60 * 1000).unref();
  app.on('before-quit', () => { for (const p of rodando) p.kill(); });

  ipcMain.handle('musica:achar', async (_e, texto: string) => {
    if (!LIGADO) return { ok: false, erro: DESLIGADO };
    try { return { ok: true, ...(await achar(String(texto ?? ''))) }; } catch (e) {
      if (!(e instanceof ErroDaMusica)) registrar('erro', 'musica', `achar: ${(e as Error).message}`);
      return { ok: false, erro: explicar(e) };
    }
  });

  /** O que a busca de uma playlist do Spotify já achou — ver `buscarPorTras`. */
  ipcMain.handle('musica:mais', (_e, id: string) => maisDaBusca(String(id)));

  /** A playlist foi tirada, ou o /parar limpou a fila: a busca não tem mais para quem achar. */
  ipcMain.handle('musica:cancelar', (_e, id: string) => { buscas.get(String(id))?.parar(); });

  /** Garante o áudio de uma música da fila — é o anfitrião adiantando a próxima. */
  ipcMain.handle('musica:preparar', async (_e, id: string) => {
    if (!LIGADO) return { ok: false, erro: DESLIGADO };
    if (!ID.test(String(id))) return { ok: false, erro: 'id inválido' };
    try {
      // Já baixando (é o /tocar de agora, ou a próxima adiantada): espera esse, sem baixar de novo.
      // O registro é por id e ANTES de o yt-dlp partir: até ele imprimir os dados, `baixando`
      // não sabe o id, e dois pedidos juntos abriam dois downloads no mesmo arquivo.
      let feito = preparando.get(id);
      if (!feito) {
        feito = (async () => {
          if (!baixando.has(id) && !arquivoDe(id)) await baixar(`https://www.youtube.com/watch?v=${id}`);
          await baixando.get(id);
        })().finally(() => preparando.delete(id));
        preparando.set(id, feito);
      }
      await feito;
      return arquivoDe(id) ? { ok: true } : { ok: false, erro: 'o áudio não ficou no disco' };
    } catch (e) {
      registrar('erro', 'musica', `preparar ${id}: ${(e as Error).message}`);
      return { ok: false, erro: explicar(e) };
    }
  });

  /** Os bytes do áudio, para a tela tocar num blob — ver `useMusica`. */
  ipcMain.handle('musica:ler', (_e, id: string) => {
    if (!LIGADO) return null;
    if (!ID.test(String(id))) return null;
    const nome = arquivoDe(id);
    if (!nome) return null;
    const tipo = nome.endsWith('.webm') ? 'audio/webm' : nome.endsWith('.m4a') || nome.endsWith('.mp4') ? 'audio/mp4' : 'audio/*';
    return { bytes: readFileSync(join(pastaDosAudios(), nome)), tipo };
  });
}
