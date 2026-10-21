import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerAppsDoRegistro, lerValorDoRegistro, lerAppsDoVdf, nomeNoManifesto, bibliotecasDoSteam, iconeNaPasta,
  jogoDoSteam, lerTasklist, lerTitulosDoTasklist, lerPs, precisamDeTitulo, jogoDosProgramas, continuar,
  normalizarAjustes, lerJanelasDoWindows, lerAppsDoMac, AJUSTES_PADRAO, type AjustesDaAtividade,
  janelasMudaram, janelaDoJogo, pacoteDoMac,
} from './jogoAberto.ts';

// Recorte da saída de verdade, do Windows do dono (20/10/2026), com o Valheim posto como aberto.
const REGISTRO = [
  '',
  'HKEY_CURRENT_USER\\Software\\Valve\\Steam\\Apps\\12120',
  '    Installed    REG_DWORD    0x1',
  '    Updating    REG_DWORD    0x0',
  '    Name    REG_SZ    Grand Theft Auto: San Andreas',
  '    Running    REG_DWORD    0x0',
  '',
  'HKEY_CURRENT_USER\\Software\\Valve\\Steam\\Apps\\228980',
  '    Installed    REG_DWORD    0x1',
  '    Running    REG_DWORD    0x0',
  '',
  'HKEY_CURRENT_USER\\Software\\Valve\\Steam\\Apps\\629520',
  '    Installed    REG_DWORD    0x1',
  '    Name    REG_SZ    Soundpad',
  '    Running    REG_DWORD    0x1',
  '',
  'HKEY_CURRENT_USER\\Software\\Valve\\Steam\\Apps\\892970',
  '    Installed    REG_DWORD    0x1',
  '    Updating    REG_DWORD    0x0',
  '    Running    REG_DWORD    0x1',
  '    Name    REG_SZ    Valheim',
  '',
].join('\r\n');

test('o registro do Steam vira a lista de jogos, com quem está rodando', () => {
  const apps = lerAppsDoRegistro(REGISTRO);
  assert.deepEqual(apps, [
    { id: 12120, nome: 'Grand Theft Auto: San Andreas', rodando: false },
    { id: 228980, nome: null, rodando: false },
    { id: 629520, nome: 'Soundpad', rodando: true },
    { id: 892970, nome: 'Valheim', rodando: true },
  ]);
});

test('o jogo do Steam pula as ferramentas e o que a pessoa escondeu', () => {
  const apps = lerAppsDoRegistro(REGISTRO);
  // O Soundpad está rodando ANTES do Valheim na lista, e não é jogo.
  assert.equal(jogoDoSteam(apps, new Set())?.nome, 'Valheim');
  assert.equal(jogoDoSteam(apps, new Set(['steam:892970'])), null);
  assert.equal(jogoDoSteam([], new Set()), null);
});

test('o valor de uma chave do registro, como o SteamPath', () => {
  const saida = '\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    SteamPath    REG_SZ    c:/program files (x86)/steam\r\n';
  assert.equal(lerValorDoRegistro(saida, 'SteamPath'), 'c:/program files (x86)/steam');
  assert.equal(lerValorDoRegistro(saida, 'Outro'), null);
});

test('no Mac, o mesmo sai do registry.vdf, sem importar maiúscula', () => {
  const vdf = `"Registry"
{
	"HKCU"
	{
		"Software"
		{
			"Valve"
			{
				"Steam"
				{
					"RunningAppID"		"892970"
					"Apps"
					{
						"892970"
						{
							"Running"		"1"
							"name"		"Valheim"
						}
						"12120"
						{
							"Running"		"0"
						}
					}
				}
			}
		}
	}
}`;
  // Na ordem dos números: chave numérica de objeto sai sempre em ordem crescente.
  assert.deepEqual(lerAppsDoVdf(vdf), [
    { id: 12120, nome: null, rodando: false },
    { id: 892970, nome: 'Valheim', rodando: true },
  ]);
  assert.deepEqual(lerAppsDoVdf('lixo'), []);
});

test('o nome que falta sai do manifesto, e o manifesto mora numa das bibliotecas', () => {
  assert.equal(nomeNoManifesto('"AppState"\n{\n\t"appid"\t\t"228980"\n\t"name"\t\t"Steamworks Common Redistributables"\n}'),
    'Steamworks Common Redistributables');
  assert.equal(nomeNoManifesto('"AppState" { "appid" "1" }'), null);
  const pastas = bibliotecasDoSteam(`"libraryfolders"
{
	"0"
	{
		"path"		"C:\\\\Program Files (x86)\\\\Steam"
		"apps" { "892970" "1048576" }
	}
	"1"
	{
		"path"		"D:\\\\SteamLibrary"
	}
}`);
  assert.deepEqual(pastas, ['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary']);
});

test('o ícone é o .jpg de nome hexadecimal no cache do Steam', () => {
  assert.equal(iconeNaPasta(['header.jpg', 'library_600x900.jpg', '2f64c9a826e2c6cf3253fea4834c2e612db09143.jpg', 'logo.png']),
    '2f64c9a826e2c6cf3253fea4834c2e612db09143');
  assert.equal(iconeNaPasta(['header.jpg', 'df65cafab20dae97a243c7cc988e8bf959e4b906']), null, 'pasta não é ícone');
});

test('o tasklist vira os nomes dos programas, em minúsculas e sem repetir', () => {
  const saida = '"System Idle Process","0","Services","0","8 K"\r\n"svchost.exe","1060","Services","0","33.316 K"\r\n'
    + '"svchost.exe","1188","Services","0","17.460 K"\r\n"VALORANT-Win64-Shipping.exe","4410","Console","1","2.104.000 K"\r\n';
  assert.deepEqual(lerTasklist(saida), ['system idle process', 'svchost.exe', 'valorant-win64-shipping.exe']);
  assert.deepEqual(lerTitulosDoTasklist('"javaw.exe","1","Console","1","900 K","Running","PC\\eu","0:01:00","Minecraft* 1.21.4 - Multiplayer"\r\n'
    + '"javaw.exe","2","Console","1","900 K","Running","PC\\eu","0:00:00","N/A"\r\n'), ['Minecraft* 1.21.4 - Multiplayer']);
});

test('no Mac, o ps traz o caminho inteiro e vale o nome do arquivo', () => {
  assert.deepEqual(lerPs('/Applications/Roblox.app/Contents/MacOS/RobloxPlayer\n/usr/sbin/cfprefsd\n'), ['robloxplayer', 'cfprefsd']);
});

const AJUSTES: AjustesDaAtividade = { mostrar: true, escondidos: [], meus: [] };

test('pelos programas: o jogo conhecido, com o nome bonito', () => {
  assert.deepEqual(jogoDosProgramas(['svchost.exe', 'valorant-win64-shipping.exe'], new Map(), AJUSTES),
    { chave: 'exe:valorant-win64-shipping.exe', nome: 'VALORANT', steam: null, icone: null, origem: 'conhecido' });
  assert.equal(jogoDosProgramas(['svchost.exe', 'chrome.exe'], new Map(), AJUSTES), null);
});

test('o lançador aberto não é jogo: só o programa do jogo conta', () => {
  assert.equal(jogoDosProgramas(['riotclientservices.exe', 'leagueclientux.exe'], new Map(), AJUSTES), null);
  assert.equal(jogoDosProgramas(['league of legends.exe'], new Map(), AJUSTES)?.nome, 'League of Legends');
});

test('o java só é Minecraft com o título da janela de Minecraft', () => {
  assert.deepEqual(precisamDeTitulo(['javaw.exe', 'chrome.exe']), ['javaw.exe']);
  assert.deepEqual(precisamDeTitulo(['chrome.exe']), []);
  assert.equal(jogoDosProgramas(['javaw.exe'], new Map(), AJUSTES), null, 'sem título não dá para saber');
  assert.equal(jogoDosProgramas(['javaw.exe'], new Map([['javaw.exe', ['IntelliJ IDEA']]]), AJUSTES), null);
  assert.equal(jogoDosProgramas(['javaw.exe'], new Map([['javaw.exe', ['Minecraft 1.21.4']]]), AJUSTES)?.nome, 'Minecraft');
});

test('o que a pessoa apontou vem antes da lista, e o escondido não aparece', () => {
  const meus = { ...AJUSTES, meus: [{ exe: 'valorant-win64-shipping.exe', nome: 'Valorzinho' }, { exe: 'meujogo.exe', nome: 'Meu Jogo' }] };
  assert.equal(jogoDosProgramas(['valorant-win64-shipping.exe'], new Map(), meus)?.nome, 'Valorzinho');
  assert.equal(jogoDosProgramas(['meujogo.exe'], new Map(), meus)?.origem, 'seu');
  const escondido = { ...meus, escondidos: ['exe:valorant-win64-shipping.exe'] };
  assert.equal(jogoDosProgramas(['valorant-win64-shipping.exe'], new Map(), escondido), null);
});

test('o mesmo jogo continua contando de quando apareceu; outro jogo recomeça', () => {
  const valheim = { chave: 'steam:892970', nome: 'Valheim', steam: 892970, icone: null, origem: 'steam' as const };
  const primeira = continuar(null, valheim, 1000);
  assert.equal(primeira?.desde, 1000);
  assert.equal(continuar(primeira, valheim, 5000)?.desde, 1000);
  assert.equal(continuar(primeira, { ...valheim, chave: 'exe:x.exe' }, 5000)?.desde, 5000);
  assert.equal(continuar(primeira, null, 5000), null);
});

test('ajustes estragados voltam ao padrão, e o padrão é mostrar', () => {
  assert.deepEqual(normalizarAjustes(null), AJUSTES_PADRAO);
  assert.deepEqual(normalizarAjustes({ mostrar: 'sim', escondidos: [1, 'steam:1', 'steam:1'], meus: [{ exe: ' Jogo.EXE ', nome: ' Jogo ' }, { exe: '' }] }),
    { mostrar: true, escondidos: ['steam:1'], meus: [{ exe: 'jogo.exe', nome: 'Jogo' }] });
  assert.equal(normalizarAjustes({ mostrar: false }).mostrar, false);
});

test('a lista para escolher: só o que tem janela, sem o sistema e sem a própria Saga', () => {
  const saida = 'explorer\tProgram Manager\r\nSaga\tSaga\r\nchrome\tYouTube - Google Chrome\r\nMeuJogo\tMeu Jogo v1.2\r\nchrome\tOutra aba\r\nsemtitulo\t\r\n';
  assert.deepEqual(lerJanelasDoWindows(saida, 'electron.exe'), [
    { exe: 'meujogo.exe', titulo: 'Meu Jogo v1.2' },
    { exe: 'chrome.exe', titulo: 'YouTube - Google Chrome' },
  ], 'a Saga instalada fica de fora mesmo rodando a de desenvolvimento');
  assert.deepEqual(lerJanelasDoWindows(saida, 'Saga.exe'), [
    { exe: 'meujogo.exe', titulo: 'Meu Jogo v1.2' },
    { exe: 'chrome.exe', titulo: 'YouTube - Google Chrome' },
  ]);
  const mac = '/Applications/Saga.app/Contents/MacOS/Saga\n/Applications/Saga.app/Contents/Frameworks/Saga Helper (GPU).app/Contents/MacOS/Saga Helper (GPU)\n'
    + '/Applications/Celeste.app/Contents/MacOS/Celeste\n/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder\n/usr/libexec/xpcproxy\n';
  assert.deepEqual(lerAppsDoMac(mac, 'Saga'), [{ exe: 'celeste', titulo: 'Celeste' }]);
});

test('a lista de programas é lida quando ABRE ou FECHA uma janela, e não quando muda um título', () => {
  assert.equal(janelasMudaram(null, ['window:1:0']), true, 'a primeira olhada sempre lê');
  const antes = new Set(['window:1:0', 'window:2:0']);
  assert.equal(janelasMudaram(antes, ['window:2:0', 'window:1:0']), false, 'as mesmas janelas, em outra ordem');
  assert.equal(janelasMudaram(antes, ['window:1:0', 'window:2:0', 'window:3:0']), true, 'abriu uma');
  assert.equal(janelasMudaram(antes, ['window:1:0']), true, 'fechou uma');
  assert.equal(janelasMudaram(antes, ['window:1:0', 'window:9:0']), true, 'trocou uma por outra');
});

test('a janela de onde sai o ícone: a do jogo, nunca a do navegador', () => {
  // As janelas de verdade do Windows do dono com o LoL aberto (20/10/2026), mais um navegador.
  const janelas = [
    { id: 'a', titulo: 'League of Legends (TM) Client' },
    { id: 'b', titulo: 'Saga' },
    { id: 'c', titulo: 'NVIDIA GeForce Overlay' },
    { id: 'd', titulo: 'League of Legends - Guia de campeões - Google Chrome' },
  ];
  assert.equal(janelaDoJogo(janelas, 'League of Legends')?.id, 'a');
  assert.equal(janelaDoJogo(janelas.slice(1), 'League of Legends'), null, 'só o navegador falando do jogo não serve');
  // O cliente e o jogo abertos: o de título mais curto, e os dois têm o ícone do LoL.
  assert.equal(janelaDoJogo([...janelas, { id: 'e', titulo: 'League of Legends' }], 'League of Legends')?.id, 'e');
  assert.equal(janelaDoJogo([{ id: 'o', titulo: 'Overwatch' }], 'Overwatch 2')?.id, 'o', 'o título é o começo do nome');
  assert.equal(janelaDoJogo([{ id: 'v', titulo: 'VALORANT  ' }], 'VALORANT')?.id, 'v');
  assert.equal(janelaDoJogo([{ id: 'f', titulo: 'EA SPORTS FC™ 25' }], 'EA SPORTS FC 25')?.id, 'f');
  assert.equal(janelaDoJogo([{ id: 'm', titulo: 'Minecraft* 1.21.4 - Multiplayer' }], 'Minecraft')?.id, 'm');
  assert.equal(janelaDoJogo([{ id: 'x', titulo: 'Sap' }], 'Sapo Rei'), null, 'título curto demais não vale como começo do nome');
  // O que a pessoa apontou vale primeiro, com o título que ela escolheu.
  assert.equal(janelaDoJogo([{ id: 'p', titulo: 'MeuJogo v1.2' }, { id: 'q', titulo: 'Meu Jogo Indie' }], 'Meu Jogo Indie', 'MeuJogo v1.2')?.id, 'p');
});

test('no Mac, o ícone sai do .app do programa', () => {
  const ps = '/Applications/Roblox.app/Contents/MacOS/RobloxPlayer\n/usr/sbin/cfprefsd\n';
  assert.equal(pacoteDoMac(ps, 'robloxplayer'), '/Applications/Roblox.app');
  assert.equal(pacoteDoMac(ps, 'cfprefsd'), null, 'fora de um .app não há ícone de app');
  assert.equal(pacoteDoMac(ps, 'outro'), null);
});

test('o programa apontado guarda o título da janela escolhida, de onde sai o ícone', () => {
  assert.deepEqual(normalizarAjustes({ meus: [{ exe: 'MeuJogo.exe', nome: 'Meu Jogo', janela: 'MeuJogo v1.2' }] }).meus,
    [{ exe: 'meujogo.exe', nome: 'Meu Jogo', janela: 'MeuJogo v1.2' }]);
});
