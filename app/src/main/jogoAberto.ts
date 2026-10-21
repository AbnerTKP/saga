/**
 * Que jogo está aberto neste computador — a parte que dá para testar sem Electron.
 *
 * Quem pergunta ao sistema é `atividade.ts`; aqui só se lê o que ele respondeu e se decide.
 * Dois caminhos, nesta ordem:
 *
 * 1. **O Steam**, que diz sozinho o que está rodando: no Windows, `Running` = 1 na chave de
 *    cada jogo em `HKCU\Software\Valve\Steam\Apps`; no Mac, o mesmo dentro do `registry.vdf`.
 *    Vem o número do jogo, e com ele o nome certo, o ícone e a capa. Medido no Windows do dono
 *    em 20/10/2026: ~36 ms para ler a chave inteira (quase tudo é abrir o `reg.exe`).
 * 2. **O nome do programa**, contra a lista de jogos conhecidos e a dos que a pessoa apontou.
 *    É para o que não abre pelo Steam: Riot, Epic, Battle.net, EA, Roblox, Minecraft. Ler os
 *    programas abertos custa ~0,3 s de processador no Windows (`tasklist`), e por isso é o
 *    caminho que roda menos — ver `atividade.ts`.
 */

/** O que a Saga conta sobre o jogo aberto. `chave` é como ele é lembrado e escondido. */
export type JogoAberto = {
  chave: string;
  nome: string;
  /** O número do jogo no Steam; é com ele que se monta o endereço do ícone e da capa. */
  steam: number | null;
  /** O hash do ícone do Steam (o nome do arquivo no cache dele, que é o mesmo do CDN). */
  icone: string | null;
  origem: 'steam' | 'conhecido' | 'seu';
};

export type AppDoSteam = { id: number; nome: string | null; rodando: boolean };

/** O que a pessoa decidiu na página Atividade. Mora na tela (localStorage) e chega aqui. */
export type AjustesDaAtividade = {
  mostrar: boolean;
  /** Chaves (`steam:892970`, `exe:valorant-win64-shipping.exe`) que não aparecem. */
  escondidos: string[];
  /** Programas que a pessoa apontou como jogo, com o nome que os outros veem. */
  meus: { exe: string; nome: string }[];
};

/** Um programa aberto com janela, para a pessoa apontar o jogo que a Saga não achou. */
export type ProgramaAberto = { exe: string; titulo: string };

type JogoConhecido = { nome: string; exe: string[]; titulo?: RegExp };

/**
 * Jogos que não passam pelo Steam, reconhecidos pelo nome do programa (em minúsculas).
 *
 * Só o programa do JOGO, nunca o do lançador: o cliente da Riot aberto não é partida, e
 * "Jogando League of Legends" com o lobby aberto o dia inteiro seria mentira. O Minecraft
 * Java roda como `javaw.exe`, que é o Java de qualquer programa — por isso ele exige o título
 * da janela ("Minecraft 1.21.4", "Minecraft* 1.21.4 - Multiplayer").
 *
 * Os nomes do Mac (sem `.exe`) não foram conferidos num Mac: errar aqui só deixa de reconhecer.
 */
export const JOGOS_CONHECIDOS: JogoConhecido[] = [
  { nome: 'VALORANT', exe: ['valorant-win64-shipping.exe'] },
  { nome: 'League of Legends', exe: ['league of legends.exe', 'league of legends', 'leagueoflegends'] },
  { nome: 'Fortnite', exe: ['fortniteclient-win64-shipping.exe'] },
  { nome: 'Roblox', exe: ['robloxplayerbeta.exe', 'robloxplayer'] },
  { nome: 'Minecraft', exe: ['minecraft.windows.exe'] },
  { nome: 'Minecraft', exe: ['javaw.exe'], titulo: /^Minecraft\*?\s/ },
  { nome: 'Grand Theft Auto V', exe: ['gta5.exe', 'gta5_enhanced.exe'] },
  { nome: 'Red Dead Redemption 2', exe: ['rdr2.exe'] },
  { nome: 'Overwatch 2', exe: ['overwatch.exe'] },
  { nome: 'Call of Duty', exe: ['cod.exe'] },
  { nome: 'World of Warcraft', exe: ['wow.exe', 'world of warcraft'] },
  { nome: 'Diablo IV', exe: ['diablo iv.exe'] },
  { nome: 'Hearthstone', exe: ['hearthstone.exe', 'hearthstone'] },
  { nome: 'Rocket League', exe: ['rocketleague.exe'] },
  { nome: 'Apex Legends', exe: ['r5apex.exe', 'r5apex_dx12.exe'] },
  { nome: 'EA SPORTS FC 25', exe: ['fc25.exe'] },
  { nome: 'EA SPORTS FC 26', exe: ['fc26.exe'] },
  { nome: 'The Sims 4', exe: ['ts4_x64.exe', 'the sims 4'] },
  { nome: 'Rainbow Six Siege', exe: ['rainbowsix.exe', 'rainbowsix_vulkan.exe'] },
  { nome: 'Genshin Impact', exe: ['genshinimpact.exe'] },
  { nome: 'Honkai: Star Rail', exe: ['starrail.exe'] },
  { nome: 'Zenless Zone Zero', exe: ['zenlesszonezero.exe'] },
  { nome: 'Counter-Strike 2', exe: ['cs2.exe'] },
  { nome: 'Dota 2', exe: ['dota2.exe'] },
  { nome: 'PUBG: BATTLEGROUNDS', exe: ['tslgame.exe'] },
  { nome: 'Marvel Rivals', exe: ['marvel-win64-shipping.exe'] },
  { nome: 'Dead by Daylight', exe: ['deadbydaylight-win64-shipping.exe'] },
  { nome: 'Among Us', exe: ['among us.exe'] },
  { nome: 'Fall Guys', exe: ['fallguys_client_game.exe'] },
  { nome: 'osu!', exe: ['osu!.exe'] },
  { nome: 'Path of Exile', exe: ['pathofexile.exe', 'pathofexile_x64.exe', 'pathofexilesteam.exe', 'pathofexile_x64steam.exe'] },
  { nome: 'Destiny 2', exe: ['destiny2.exe'] },
  { nome: 'Warframe', exe: ['warframe.x64.exe'] },
  { nome: 'Sea of Thieves', exe: ['sotgame.exe'] },
  { nome: 'Forza Horizon 5', exe: ['forzahorizon5.exe'] },
  { nome: 'Palworld', exe: ['palworld-win64-shipping.exe'] },
  { nome: 'Rust', exe: ['rustclient.exe'] },
  { nome: 'Terraria', exe: ['terraria.exe'] },
  { nome: 'Stardew Valley', exe: ['stardew valley.exe'] },
  { nome: 'ELDEN RING', exe: ['eldenring.exe'] },
  { nome: 'Cyberpunk 2077', exe: ['cyberpunk2077.exe'] },
  { nome: 'Valheim', exe: ['valheim.exe', 'valheim'] },
  { nome: 'Euro Truck Simulator 2', exe: ['eurotrucks2.exe'] },
  { nome: 'Brawlhalla', exe: ['brawlhalla.exe'] },
  { nome: 'HELLDIVERS 2', exe: ['helldivers2.exe'] },
  { nome: 'Lethal Company', exe: ['lethal company.exe'] },
];

/**
 * Programas do Steam que NÃO são jogo e ficam abertos ao lado de um — senão "Jogando
 * Wallpaper Engine" ficaria o dia inteiro na lista de quem usa papel de parede animado.
 * O Steam não marca o que é ferramenta; o resto a pessoa esconde no "Não mostrar".
 */
export const FERRAMENTAS_DO_STEAM: ReadonlySet<number> = new Set([
  431960,   // Wallpaper Engine
  629520,   // Soundpad
  993090,   // Lossless Scaling
  228980,   // Steamworks Common Redistributables
  1905180,  // OBS Studio
  250820,   // SteamVR
  365670,   // Blender
  1070560, 1391110, 1628350,  // Steam Linux Runtime
]);

export const AJUSTES_PADRAO: AjustesDaAtividade = { mostrar: true, escondidos: [], meus: [] };

/** O que veio da tela, conferido: vem por IPC, e a tela lê do localStorage, que pode ter lixo. */
export function normalizarAjustes(a: unknown): AjustesDaAtividade {
  const o = (a && typeof a === 'object' ? a : {}) as Partial<Record<keyof AjustesDaAtividade, unknown>>;
  const escondidos = Array.isArray(o.escondidos)
    ? [...new Set(o.escondidos.filter((x): x is string => typeof x === 'string' && x.length <= 300))]
    : [];
  const meus = Array.isArray(o.meus)
    ? o.meus.flatMap((m) => {
      const exe = typeof m?.exe === 'string' ? m.exe.trim().toLowerCase() : '';
      const nome = typeof m?.nome === 'string' ? m.nome.trim() : '';
      return exe && nome ? [{ exe, nome: nome.slice(0, 80) }] : [];
    })
    : [];
  return { mostrar: o.mostrar !== false, escondidos, meus };
}

// --- o Steam -----------------------------------------------------------------

/**
 * A saída de `reg query HKCU\Software\Valve\Steam\Apps /s`. Cada jogo é um bloco:
 *
 *     HKEY_CURRENT_USER\Software\Valve\Steam\Apps\892970
 *         Installed    REG_DWORD    0x1
 *         Running    REG_DWORD    0x0
 *         Name    REG_SZ    Valheim
 *
 * `Name` falta em alguns (o 228980 desta máquina não tem), e aí o nome sai do manifesto.
 */
export function lerAppsDoRegistro(saida: string): AppDoSteam[] {
  const apps: AppDoSteam[] = [];
  let atual: AppDoSteam | null = null;
  for (const linha of saida.split(/\r?\n/)) {
    const chave = /\\Apps\\(\d+)\s*$/i.exec(linha);
    if (chave) {
      atual = { id: Number(chave[1]), nome: null, rodando: false };
      apps.push(atual);
      continue;
    }
    if (!atual) continue;
    const valor = /^\s+(\S+)\s+REG_(?:SZ|DWORD)\s+(.*?)\s*$/.exec(linha);
    if (!valor) continue;
    const [, nome, dado] = valor;
    if (/^running$/i.test(nome)) atual.rodando = Number(dado) === 1;
    else if (/^name$/i.test(nome)) atual.nome = dado || null;
  }
  return apps;
}

/** O valor de texto de um `reg query … /v Nome`, ou null. */
export function lerValorDoRegistro(saida: string, nome: string): string | null {
  for (const linha of saida.split(/\r?\n/)) {
    const m = /^\s+(\S+)\s+REG_\w+\s+(.*?)\s*$/.exec(linha);
    if (m && m[1].toLowerCase() === nome.toLowerCase()) return m[2] || null;
  }
  return null;
}

type Vdf = { [chave: string]: string | Vdf };

/**
 * O formato de texto do Steam (`registry.vdf`, `appmanifest_*.acf`, `libraryfolders.vdf`):
 * chaves e valores entre aspas, blocos entre chaves. As chaves ficam em minúsculas — o Steam
 * escreve "apps" num arquivo e "Apps" noutro.
 */
export function lerVdf(texto: string): Vdf {
  const raiz: Vdf = {};
  const pilha: Vdf[] = [raiz];
  let pendente: string | null = null;
  const fichas = texto.match(/"(?:[^"\\]|\\.)*"|[{}]/g) ?? [];
  for (const ficha of fichas) {
    const topo = pilha[pilha.length - 1];
    if (ficha === '{') {
      const filho: Vdf = {};
      if (pendente !== null) topo[pendente] = filho;
      pilha.push(filho);
      pendente = null;
    } else if (ficha === '}') {
      if (pilha.length > 1) pilha.pop();
      pendente = null;
    } else {
      const s = ficha.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
      if (pendente === null) pendente = s.toLowerCase();
      else { topo[pendente] = s; pendente = null; }
    }
  }
  return raiz;
}

const dentro = (v: Vdf | string | undefined, ...caminho: string[]): Vdf | string | undefined => {
  let atual = v;
  for (const c of caminho) {
    if (!atual || typeof atual === 'string') return undefined;
    atual = atual[c.toLowerCase()];
  }
  return atual;
};

/** O `registry.vdf` do Steam no Mac: o mesmo que o registro do Windows, num arquivo. */
export function lerAppsDoVdf(texto: string): AppDoSteam[] {
  const apps = dentro(lerVdf(texto), 'registry', 'hkcu', 'software', 'valve', 'steam', 'apps');
  if (!apps || typeof apps === 'string') return [];
  return Object.entries(apps).flatMap(([id, v]) => {
    if (!/^\d+$/.test(id) || typeof v === 'string') return [];
    const nome = typeof v.name === 'string' && v.name ? v.name : null;
    return [{ id: Number(id), nome, rodando: v.running === '1' }];
  });
}

/** O nome do jogo no `appmanifest_<id>.acf`. */
export function nomeNoManifesto(texto: string): string | null {
  const nome = dentro(lerVdf(texto), 'appstate', 'name');
  return typeof nome === 'string' && nome ? nome : null;
}

/** As pastas de biblioteca do Steam (`libraryfolders.vdf`): cada uma tem um `steamapps`. */
export function bibliotecasDoSteam(texto: string): string[] {
  const raiz = dentro(lerVdf(texto), 'libraryfolders');
  if (!raiz || typeof raiz === 'string') return [];
  return Object.values(raiz).flatMap((v) => (typeof v !== 'string' && typeof v.path === 'string' ? [v.path] : []));
}

/**
 * O hash do ícone, achado entre os arquivos de `appcache/librarycache/<id>/`. O ícone de 32×32
 * é o único `.jpg` com nome de 40 letras hexadecimais ali (ao lado de `header.jpg`,
 * `library_600x900.jpg`…), e o mesmo nome serve no CDN do Steam — conferido byte a byte.
 */
export function iconeNaPasta(arquivos: string[]): string | null {
  for (const a of arquivos) {
    const m = /^([0-9a-f]{40})\.jpg$/i.exec(a);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** O jogo do Steam que está aberto, fora as ferramentas e o que a pessoa escondeu. */
export function jogoDoSteam(apps: AppDoSteam[], escondidos: ReadonlySet<string>): AppDoSteam | null {
  return apps.find((a) => a.rodando && !FERRAMENTAS_DO_STEAM.has(a.id) && !escondidos.has(`steam:${a.id}`)) ?? null;
}

// --- os programas abertos ----------------------------------------------------

/** `tasklist /fo csv /nh`: o primeiro campo de cada linha é o nome do programa. */
export function lerTasklist(saida: string): string[] {
  const nomes = new Set<string>();
  for (const linha of saida.split(/\r?\n/)) {
    const m = /^"([^"]+)"/.exec(linha);
    if (m) nomes.add(m[1].toLowerCase());
  }
  return [...nomes];
}

/** `tasklist /v /fo csv /nh /fi "IMAGENAME eq x"`: o título da janela é o último campo. */
export function lerTitulosDoTasklist(saida: string): string[] {
  return saida.split(/\r?\n/).flatMap((linha) => {
    const campos = linha.match(/"([^"]*)"/g);
    const ultimo = campos?.at(-1)?.slice(1, -1);
    return ultimo && ultimo !== 'N/A' ? [ultimo] : [];
  });
}

/** `ps -axo comm=` no Mac: o caminho inteiro do executável; vale o nome do arquivo. */
export function lerPs(saida: string): string[] {
  const nomes = new Set<string>();
  for (const linha of saida.split(/\r?\n/)) {
    const nome = linha.trim().split('/').pop();
    if (nome) nomes.add(nome.toLowerCase());
  }
  return [...nomes];
}

/** Os programas da lista que só valem com o título da janela, e que estão abertos. */
export function precisamDeTitulo(programas: readonly string[]): string[] {
  const abertos = new Set(programas);
  return [...new Set(JOGOS_CONHECIDOS.filter((j) => j.titulo).flatMap((j) => j.exe).filter((e) => abertos.has(e)))];
}

/**
 * O jogo entre os programas abertos: primeiro os que a PESSOA apontou (ela sabe mais que a
 * lista), depois os conhecidos. O que ela escondeu não vale em nenhum dos dois.
 */
export function jogoDosProgramas(
  programas: readonly string[],
  titulos: ReadonlyMap<string, readonly string[]>,
  ajustes: AjustesDaAtividade,
): JogoAberto | null {
  const abertos = new Set(programas);
  const escondidos = new Set(ajustes.escondidos);
  for (const m of ajustes.meus) {
    const chave = `exe:${m.exe}`;
    if (abertos.has(m.exe) && !escondidos.has(chave)) return { chave, nome: m.nome, steam: null, icone: null, origem: 'seu' };
  }
  for (const j of JOGOS_CONHECIDOS) {
    const exe = j.exe.find((e) => abertos.has(e));
    if (!exe) continue;
    const chave = `exe:${exe}`;
    if (escondidos.has(chave)) continue;
    if (j.titulo && !(titulos.get(exe) ?? []).some((t) => j.titulo!.test(t))) continue;
    return { chave, nome: j.nome, steam: null, icone: null, origem: 'conhecido' };
  }
  return null;
}

/** Desde quando: o mesmo jogo continua a contar de quando foi visto pela primeira vez. */
export function continuar<T extends { chave: string; desde: number }>(
  anterior: T | null,
  jogo: JogoAberto | null,
  agora: number,
): (JogoAberto & { desde: number }) | null {
  if (!jogo) return null;
  return { ...jogo, desde: anterior?.chave === jogo.chave ? anterior.desde : agora };
}

// --- "Escolher": os programas com janela -------------------------------------

/**
 * Janelas que são do próprio sistema e nunca são o jogo de ninguém. A Saga entra pelo nome
 * também, e não só pelo próprio executável: quem roda a de desenvolvimento ao lado da instalada
 * veria a instalada na lista (visto na bancada de 20/10/2026).
 */
const DO_SISTEMA = new Set([
  'saga', 'explorer', 'applicationframehost', 'textinputhost', 'systemsettings', 'shellexperiencehost',
  'searchhost', 'startmenuexperiencehost', 'lockapp', 'widgets', 'steamwebhelper', 'nvidia overlay',
  'finder', 'dock', 'systemuiserver', 'controlcenter', 'notificationcenter', 'windowserver', 'loginwindow',
]);

/**
 * A saída do PowerShell (`nome<TAB>título da janela`, uma por linha) virando a lista para
 * escolher. `proprio` é o programa da própria Saga, que não é jogo de ninguém.
 */
export function lerJanelasDoWindows(saida: string, proprio: string): ProgramaAberto[] {
  const vistos = new Map<string, ProgramaAberto>();
  for (const linha of saida.split(/\r?\n/)) {
    const [nome, ...resto] = linha.split('\t');
    const base = nome?.trim().toLowerCase();
    const titulo = resto.join('\t').trim();
    if (!base || !titulo || DO_SISTEMA.has(base)) continue;
    const exe = `${base}.exe`;
    if (exe === proprio.toLowerCase() || vistos.has(exe)) continue;
    vistos.set(exe, { exe, titulo });
  }
  return [...vistos.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt'));
}

/** No Mac, os apps abertos saem do `ps`: o que roda de dentro de um `.app` é um app. */
export function lerAppsDoMac(saida: string, proprio: string): ProgramaAberto[] {
  const vistos = new Map<string, ProgramaAberto>();
  for (const linha of saida.split(/\r?\n/)) {
    const m = /\/([^/]+)\.app\/Contents\/MacOS\/([^/]+)$/.exec(linha.trim());
    if (!m) continue;
    const exe = m[2].toLowerCase();
    // Os ajudantes do Chromium e do Electron (Helper, Helper (GPU)…) não são o programa.
    if (/helper/i.test(m[2]) || DO_SISTEMA.has(exe) || exe === proprio.toLowerCase() || vistos.has(exe)) continue;
    vistos.set(exe, { exe, titulo: m[1] });
  }
  return [...vistos.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt'));
}
