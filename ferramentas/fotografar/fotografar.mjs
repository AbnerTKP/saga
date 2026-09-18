#!/usr/bin/env node
// Fotografa as telas da Saga SEM abrir janela nenhuma na máquina.
//
// O que sobe (tudo só em 127.0.0.1, tudo morto no fim, inclusive em erro e em Ctrl+C):
//   - LiveKit local de mentira (porta 7901)  — só para entrar numa call e fotografar o menu de jogos
//   - servidor da Saga (server/index.mjs) com banco NOVO numa pasta temporária (porta 3901)
//   - vite servindo app/src/renderer com uma config própria (porta 5901)
//   - Chrome --headless=new --mute-audio, perfil próprio, dirigido por CDP (porta 9901)
// Nada de Electron. `window.desktop` (o preload) é um stub injetado antes da página, e o
// getUserMedia/getDisplayMedia RECUSAM (NotAllowedError): nenhum microfone ou câmera é aberto.
//
// Uso:
//   node fotografar.mjs                          # 1280x800, fotos em $TMPDIR/saga-fotos/fotos
//   node fotografar.mjs --tamanhos=1280x800,1440x900
//   node fotografar.mjs --so=04,05               # só os passos cujo nome começa assim
//   node fotografar.mjs --saida=/outro/lugar     # onde gravar (nunca dentro do repositório)
//   node fotografar.mjs --plataforma=win32       # a barra de janela do Windows, desenhada pelo app
//
// Nasceu na reestruturação da interface (18/09/2026) para fotografar o "antes" e conferir o
// "depois" — foi ele que achou a árvore de salas vazia e as bolinhas de cor esticadas, que o
// typecheck e os testes não viam. Mudou uma tela? Ajuste os SELETORES do passo dela (em
// `roteiro`); o resto — subir, semear, stub, esperar, fotografar, derrubar — vale igual.
// Precisa do Google Chrome em /Applications; o `livekit-server` é opcional (sem ele, a call
// e o menu de jogos ficam de fora).
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, openSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { semear, depoisDoDono, SENHA } from './semear.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
// Tudo o que roda e grava fica FORA do repositório (a trava logo abaixo confere).
const SCRATCH = process.env.SAGA_FOTOS_TMP ?? join(tmpdir(), 'saga-fotos');
const RAIZ = process.env.SAGA_RAIZ ?? '/Users/loki/Documents/app-comunicacao';
const EXEC = join(SCRATCH, 'antes-execucao');          // banco, logs, cache do vite, pids
const PERFIL = join(SCRATCH, 'chrome-perfil');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORTA = { saga: 3901, vite: 5901, cdp: 9901, livekit: 7901 };
const LK = { chave: 'fotokey', segredo: 'segredo-de-mentira-so-para-as-fotos-da-saga-local' };

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : padrao;
};
const TAMANHOS = arg('tamanhos', '1280x800').split(',').map((t) => t.split('x').map(Number));
const SO = arg('so', '') ? arg('so', '').split(',') : null;
const SAIDA = resolve(arg('saida', join(SCRATCH, 'fotos')));
const PLATAFORMA = arg('plataforma', 'darwin');

// Proteções que não dependem de cuidado: nada escreve no repositório nem na Saga instalada.
for (const p of [EXEC, PERFIL, SAIDA]) {
  if (p.startsWith(RAIZ) || p.includes('Application Support/Saga')) throw new Error(`pasta proibida: ${p}`);
}

mkdirSync(EXEC, { recursive: true });
mkdirSync(SAIDA, { recursive: true });
const LOG = join(EXEC, 'fotografar.log');
const log = (...a) => {
  const linha = `[${new Date().toISOString().slice(11, 19)}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`;
  console.log(linha);
  appendFileSync(LOG, linha + '\n');
};

// ---------------------------------------------------------------------------------------
// Processos
// ---------------------------------------------------------------------------------------
const filhos = new Map();
function subir(nome, cmd, args, { env, cwd } = {}) {
  const saida = openSync(join(EXEC, `${nome}.log`), 'a');
  const p = spawn(cmd, args, { env, cwd: cwd ?? EXEC, stdio: ['ignore', saida, saida] });
  filhos.set(nome, p);
  appendFileSync(join(EXEC, 'pids.txt'), `${p.pid} ${nome}\n`);
  p.on('exit', (c, s) => { log(`${nome} saiu (código ${c}, sinal ${s})`); filhos.delete(nome); });
  log(`subiu ${nome} pid ${p.pid}`);
  return p;
}
async function derrubar(nome) {
  const p = filhos.get(nome);
  if (!p) return;
  const saiu = new Promise((r) => p.once('exit', r));
  p.kill('SIGTERM');
  const venceu = await Promise.race([saiu.then(() => true), esperarAte(8000).then(() => false)]);
  if (!venceu) { log(`${nome} não saiu com SIGTERM; SIGKILL`); p.kill('SIGKILL'); await saiu; }
}
// Espera por PRAZO só como teto de uma espera por condição — nunca como espera em si.
const esperarAte = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });

async function esperarHttp(url, teto = 30000) {
  const fim = Date.now() + teto;
  while (Date.now() < fim) {
    try { const r = await fetch(url); if (r.status < 500) return r; } catch { /* ainda não */ }
    await esperarAte(150);
  }
  throw new Error(`não respondeu: ${url}`);
}

async function derrubarTudo() {
  for (const n of ['chrome', 'vite', 'saga', 'livekit']) await derrubar(n).catch((e) => log('derrubar', n, e.message));
  // Chrome deixa ajudantes; qualquer processo com o NOSSO perfil na linha de comando morre aqui.
  try {
    const sobras = execFileSync('pgrep', ['-f', PERFIL], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    for (const pid of sobras) { try { process.kill(Number(pid), 'SIGKILL'); } catch { /* já foi */ } }
    if (sobras.length) log('matei sobras do chrome:', sobras.join(','));
  } catch { /* pgrep sem resultado */ }
}
let derrubando = false;
for (const s of ['SIGINT', 'SIGTERM']) {
  process.on(s, async () => { if (derrubando) return; derrubando = true; log(`recebi ${s}`); await derrubarTudo(); process.exit(130); });
}

// ---------------------------------------------------------------------------------------
// CDP
// ---------------------------------------------------------------------------------------
class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pendentes = new Map(); this.ouvintes = new Set(); }
  abrir() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error(`CDP: ${e.message ?? 'erro'}`));
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && this.pendentes.has(m.id)) {
          const { res: ok, rej: nao, metodo } = this.pendentes.get(m.id);
          this.pendentes.delete(m.id);
          if (m.error) nao(new Error(`${metodo}: ${m.error.message}`)); else ok(m.result);
        } else for (const f of this.ouvintes) f(m);
      };
    });
  }
  // Todo comando tem teto: um CDP que não responde vira erro do passo, e não um roteiro parado.
  send(metodo, params = {}, teto = 30000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method: metodo, params }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pendentes.delete(id); rej(new Error(`${metodo}: sem resposta em ${teto} ms`)); }, teto);
      this.pendentes.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); }, metodo });
    });
  }
  fechar() { try { this.ws.close(); } catch { /* */ } }
}

// O preload do Electron (app/src/preload/index.ts), de mentira: tudo resolve com o neutro.
function stub(plataforma) {
  return `(() => {
  const nada = () => Promise.resolve();
  const desinscrever = () => () => {};
  window.desktop = {
    platform: ${JSON.stringify(plataforma)},
    listSources: () => Promise.resolve([]),
    chooseSource: nada,
    screenPermission: () => Promise.resolve('granted'),
    usaSeletorDoSistema: () => Promise.resolve(true),
    openScreenSettings: nada,
    version: () => Promise.resolve('0.61.0'),
    janela: { minimizar: nada, alternarMaximizar: nada, fechar: nada,
      estaMaximizada: () => Promise.resolve(false), aoMaximizar: desinscrever },
    registrar: nada,
    lerRegistro: () => Promise.resolve(''),
    copiarRegistro: nada,
    abrirPastaDoRegistro: nada,
    onUpdate: () => {},
    updateAtual: () => Promise.resolve({ fase: 'nenhuma' }),
    installUpdate: nada,
    openExternal: nada,
    salvarArquivo: () => Promise.resolve({ ok: false, erro: 'desligado nas fotos' }),
    aoAcordar: desinscrever,
    ociosidade: () => Promise.resolve(0),
    aberturaComOSistema: () => Promise.resolve({ disponivel: false, ligado: false }),
    definirAberturaComOSistema: () => Promise.resolve({ disponivel: false, ligado: false }),
    overlay: {
      travar: () => Promise.resolve(false),
      estado: () => Promise.resolve({ aberto: false, travado: false, atalho: 'CommandOrControl+Shift+O' }),
      redimensionar: nada, fechar: nada,
      definirAtalho: (t) => Promise.resolve({ atalho: t, valeu: true }),
      aoTravar: desinscrever, aoFechar: desinscrever,
    },
  };
  // Microfone, câmera e tela: sempre recusados. Nenhum aparelho desta máquina é aberto.
  const recusar = () => Promise.reject(new DOMException('Recusado nas fotos', 'NotAllowedError'));
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = recusar;
    navigator.mediaDevices.getDisplayMedia = recusar;
  }
  window.open = () => null;
  // Ajudante das fotos: acha elemento VISÍVEL por seletor + texto (ou regex) + índice.
  window.__fotos = {
    achar({ sel, texto, re, n = 0, pai }) {
      const rx = re ? new RegExp(re) : null;
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const dentro = pai ? window.__fotos.achar(pai) : document;
      if (!dentro) return null;
      const todos = [...dentro.querySelectorAll(sel)].filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const t = norm(e.textContent);
        if (texto && !t.includes(texto) && !(e.title || '').includes(texto)) return false;
        if (rx && !rx.test(t)) return false;
        return true;
      });
      return todos[n] ?? null;
    },
  };
})();`;
}

let cdp;
let navegador;
const manifesto = [];
const falhas = [];
let pasta = SAIDA;
let tamanhoAtual = TAMANHOS[0];

async function avaliar(expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function esperarQue(expr, { teto = 15000, oque = expr } = {}) {
  const fim = Date.now() + teto;
  let ultimo;
  while (Date.now() < fim) {
    try { if (await avaliar(expr)) return; } catch (e) { ultimo = e; }
    // Intervalo de sondagem, não espera: o que decide é a condição. Sem requestAnimationFrame
    // de propósito — numa aba que o Chrome jogou para segundo plano ele nunca dispara.
    await esperarAte(80);
  }
  throw new Error(`esperei e não aconteceu: ${oque}${ultimo ? ` (${ultimo.message})` : ''}`);
}
const alvoJs = (a) => JSON.stringify(typeof a === 'string' ? { sel: a } : a);
const esperar = (a, teto) => esperarQue(`!!window.__fotos.achar(${alvoJs(a)})`, { teto, oque: alvoJs(a) });
const existe = (a) => avaliar(`!!window.__fotos.achar(${alvoJs(a)})`);

async function centro(a) {
  await esperar(a);
  return avaliar(`(() => { const e = window.__fotos.achar(${alvoJs(a)}); e.scrollIntoView({ block: 'nearest' });
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}
async function clicar(a, { botao = 'left' } = {}) {
  const { x, y } = await centro(a);
  const buttons = botao === 'right' ? 2 : 1;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: botao, buttons, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: botao, buttons: 0, clickCount: 1 });
}
const clicarDireito = (a) => clicar(a, { botao: 'right' });
// Tecla SINTÉTICA, disparada dentro da página — nunca Input.dispatchKeyEvent do CDP.
// Medido (18/09/2026): no Chrome headless do Mac, um Escape de verdade que a página NÃO
// consome (preventDefault) sobe para o navegador, e o processo principal entra em 100% de
// CPU para sempre: nenhum comando CDP responde mais, nem o SIGTERM derruba. Dois Escapes
// com nada aberto bastam. Os atalhos da Saga escutam `keydown` em window/document, e o
// evento sintético chega a eles do mesmo jeito.
async function tecla(key) {
  await avaliar(`(() => { const alvo = document.activeElement ?? document.body;
    for (const tipo of ['keydown', 'keyup']) alvo.dispatchEvent(new KeyboardEvent(tipo, { key: ${JSON.stringify(key)}, code: ${JSON.stringify(key)}, bubbles: true, cancelable: true })); })()`);
}
// Setter nativo + evento input: é o que o React enxerga (escrever `value` direto ele ignora).
async function digitar(a, texto) {
  await esperar(a);
  await avaliar(`(() => { const e = window.__fotos.achar(${alvoJs(a)}); e.focus();
    const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(texto)});
    e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function moverMouse(x, y) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); }

async function viewport(w, h) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await esperarQue(`innerWidth === ${w} && innerHeight === ${h}`, { teto: 5000 });
}

// Pronta para foto: fontes carregadas, imagens visíveis carregadas, e nenhuma animação FINITA
// rodando (as infinitas — quem fala, arco-íris do Berserk — não terminam nunca).
async function pronta() {
  try {
    await esperarQue(`(async () => {
      await document.fonts.ready;
      const imgs = [...document.images].filter((i) => i.getBoundingClientRect().width > 0);
      if (imgs.some((i) => !i.complete)) return false;
      const rodando = document.getAnimations().filter((a) => a.playState === 'running'
        && a.effect && a.effect.getComputedTiming().iterations !== Infinity);
      return rodando.length === 0;
    })()`, { teto: 6000, oque: 'tela parada' });
  } catch (e) { log('aviso:', e.message); }
}

// O aviso "Microfone: Recusado nas fotos" é do stub (o getUserMedia recusa de propósito), não
// da Saga de verdade. Fora da call ele só atrapalharia a foto; dentro dela (passo 09) fica.
let manterAvisoDoMicrofone = false;
async function fecharAvisoDoMicrofone() {
  const tinha = await avaliar(`(() => { let n = 0; for (const a of document.querySelectorAll('.avisos .aviso')) {
    if (a.textContent.includes('Recusado nas fotos')) { a.querySelector('.aviso-fechar')?.click(); n++; } } return n; })()`);
  if (tinha) await esperarQue(`![...document.querySelectorAll('.avisos .aviso')].some((a) => a.textContent.includes('Recusado nas fotos'))`, { teto: 3000 }).catch(() => {});
}

async function foto(nome, descricao) {
  await cdp.send('Page.bringToFront').catch(() => {});
  if (!manterAvisoDoMicrofone) await fecharAvisoDoMicrofone();
  await pronta();
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const arquivo = join(pasta, `${nome}.png`);
  writeFileSync(arquivo, Buffer.from(data, 'base64'));
  manifesto.push({ arquivo, descricao, tamanho: tamanhoAtual.join('x') });
  log('foto', arquivo);
}

/** Um painel que rola: uma foto por seção (título h3 no topo), pulando o que já estava no quadro. */
async function fotosPorSecao(prefixo, corpoSel, descricao, { secao = 'section.painel-bloco', titulo = 'h3' } = {}) {
  const info = await avaliar(`(() => {
    const c = document.querySelector(${JSON.stringify(corpoSel)});
    const base = c.getBoundingClientRect().top - c.scrollTop;
    const secs = [...c.querySelectorAll(${JSON.stringify(secao)})].filter((s) => s.getBoundingClientRect().height > 0);
    return { max: c.scrollHeight - c.clientHeight, secs: secs.map((s) => ({
      titulo: (s.querySelector(${JSON.stringify(titulo)})?.textContent ?? '').replace(/\\s+/g, ' ').trim(),
      topo: Math.max(0, Math.round(s.getBoundingClientRect().top - base - 12)) })) };
  })()`);
  const feitas = [];
  let ultimo = -1;
  let letra = 0;
  for (const s of info.secs) {
    const alvo = Math.min(s.topo, info.max);
    if (alvo === ultimo) { feitas[feitas.length - 1].secoes.push(s.titulo); continue; }
    await avaliar(`document.querySelector(${JSON.stringify(corpoSel)}).scrollTop = ${alvo}`);
    await esperarQue(`Math.abs(document.querySelector(${JSON.stringify(corpoSel)}).scrollTop - ${alvo}) < 2`, { teto: 3000 });
    const slug = s.titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    feitas.push({ nome: `${prefixo}${String.fromCharCode(97 + letra++)}-${slug || 'secao'}`, secoes: [s.titulo] });
    ultimo = alvo;
    await foto(feitas.at(-1).nome, `${descricao} — rolado até "${s.titulo}"`);
    manifesto.at(-1).secoes = feitas.at(-1).secoes;
  }
  await avaliar(`document.querySelector(${JSON.stringify(corpoSel)}).scrollTop = 0`);
  return feitas;
}

/** O painel INTEIRO numa foto só: a janela cresce na altura até o painel parar de rolar. */
async function fotoInteira(nome, corpoSel, descricao) {
  const [w, h] = tamanhoAtual;
  let altura = h;
  for (let i = 0; i < 12; i++) {
    const falta = await avaliar(`(() => { const c = document.querySelector(${JSON.stringify(corpoSel)}); return c.scrollHeight - c.clientHeight; })()`);
    if (falta <= 1) break;
    altura = Math.min(9000, altura + falta + 40);
    await viewport(w, altura);
  }
  await foto(nome, `${descricao} (inteiro: janela esticada para ${w}x${altura} só nesta foto)`);
  manifesto.at(-1).tamanho = `${w}x${altura}`;
  await viewport(w, h);
  // Na janela esticada o chat inteiro cabia e ficou no topo; devolve ao fim, como estava.
  await avaliar(`(() => { const c = document.querySelector('.chat-log'); if (c) c.scrollTop = c.scrollHeight; })()`);
}

async function passo(nome, fn) {
  if (SO && !SO.some((p) => nome.startsWith(p))) return;
  log(`— passo ${nome}`);
  try { await fn(); }
  catch (e) {
    log(`FALHOU ${nome}: ${e.message}`);
    falhas.push({ passo: nome, tamanho: tamanhoAtual.join('x'), erro: e.message });
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(EXEC, `falha-${tamanhoAtual.join('x')}-${nome}.png`), Buffer.from(data, 'base64'));
    } catch { /* */ }
  }
  manterAvisoDoMicrofone = false;
  // Cada passo termina com a tela limpa: sem menu nem modal aberto.
  for (let i = 0; i < 3; i++) {
    const aberto = await avaliar(`!!document.querySelector('.modal-back, .menu-pessoa, .menu-de-jogos, .escolher-status')`).catch(() => false);
    if (!aberto) break;
    await tecla('Escape');
    await esperarQue(`!document.querySelector('.modal-back, .menu-pessoa, .menu-de-jogos')`, { teto: 1500 }).catch(() => {});
  }
  const ainda = await avaliar(`!!document.querySelector('.modal-back')`).catch(() => false);
  if (ainda) {
    // No canto do fundo escuro, e não no meio: o meio é o próprio modal.
    const [, h] = tamanhoAtual;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp.send('Input.dispatchMouseEvent', { type, x: 6, y: h - 6, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------------------
// Entrar e sair pela TELA (escrever o crachá no localStorage e recarregar quebra: ver a
// memória nao-abrir-janela-na-maquina-dele).
// ---------------------------------------------------------------------------------------
async function entrarComo(apelido) {
  await esperar('.connect-card');
  await clicar({ sel: '.connect-card .tabs button', n: 0 });
  await digitar({ sel: '.connect-card input', n: 0 }, apelido);
  await digitar({ sel: '.connect-card input[type=password]', n: 0 }, SENHA);
  await clicar({ sel: '.connect-card button.primary' });
  await esperarQue(`!!document.querySelector('.app .sidebar, .tela-inicial')`, { teto: 20000, oque: 'app depois de entrar' });
}
async function sairDaConta() {
  await clicar({ sel: '.eu-status' });
  await esperar('.escolher-status');
  await clicar({ sel: '.escolher-status button', texto: 'Sair da conta' });
  await esperar('.connect-card', 15000);
}
async function abrirServidor(nome) {
  const atual = await existe({ sel: '.trilha .quadro-servidor.atual', texto: `${nome} —` });
  if (!atual) await clicar({ sel: '.trilha .quadro-servidor', texto: `${nome} —` });
  await esperarQue(`document.querySelector('.nome-do-servidor')?.textContent === ${JSON.stringify(nome)}`, { oque: `servidor ${nome}` });
}
const sala = (nome) => ({ sel: '.sidebar .room', re: `^\\s*${nome}\\s*\\d*$` });

// ---------------------------------------------------------------------------------------
// O roteiro — cada passo deixa a tela como achou.
// ---------------------------------------------------------------------------------------
async function roteiro(dados) {
  await passo('01-entrar', async () => {
    await esperar('.connect-card', 30000);
    await foto('01a-entrar-criar-conta', 'Primeira tela de quem nunca entrou: aba "Criar conta" (apelido, senha, repetir senha).');
    await clicar({ sel: '.connect-card .tabs button', n: 0 });
    await foto('01b-entrar', 'Tela de entrar: aba "Entrar", apelido e senha, "Esqueci a senha".');
    await clicar({ sel: '.connect-card button.link', texto: 'Esqueci a senha' });
    await esperar('.connect-recuperar');
    await foto('01c-entrar-esqueci-a-senha', 'Recuperar a senha sem e-mail ligado: pede o código que o dono da Saga gera.');
    await clicar({ sel: '.connect-card .tabs button', n: 0 });
  });

  await entrarComo('TKP');
  await abrirServidor('Cantinho');

  await passo('02-principal', async () => {
    await clicar(sala('geral'));
    await esperar({ sel: '.chat-log .msg', texto: '21h na Sala 2' }, 15000);
    await esperar({ sel: '.lista-membros .membro-linha', texto: 'Marina' });
    // A marca de não lidas da sala aberta some na busca seguinte; se não sumir, é achado.
    await esperarQue(`!document.querySelector('.sidebar .room.aberta .nao-lidas')`, { teto: 10000, oque: 'marca de não lidas da sala aberta sumir' })
      .catch((e) => log('achado:', e.message));
    await moverMouse(640, 20);
    await foto('02-principal-sala-de-texto', 'Tela principal do dono (TKP) no servidor Cantinho, sala de texto #geral com conversa, salas em categorias à esquerda, pessoas por cargo e trilha de servidores à direita.');
  });

  await passo('03-menu-do-servidor', async () => {
    await clicar({ sel: '.cabeca-do-servidor' });
    await esperar('.menu-do-servidor');
    await foto('03-menu-do-servidor', 'Menu do nome do servidor (▾): convidar, configurações, criar sala de voz/chat.');
  });

  await passo('04-configuracoes-do-servidor', async () => {
    // Pelo botão direito no quadrado: o menu, e o submenu com as páginas ao passar o mouse.
    await clicarDireito({ sel: '.trilha .quadro-servidor', texto: 'Cantinho —' });
    await esperar('.menu-do-servidor');
    const c = await centro({ sel: '.menu-do-servidor .configurar' });
    await moverMouse(c.x, c.y);
    await esperar('.submenu-do-servidor');
    await foto('04a-menu-com-submenu', 'Botão direito no quadrado do servidor: o menu, com as páginas das configurações no submenu.');
    await clicar({ sel: '.submenu-do-servidor button', texto: 'Cargos' });
    await esperar({ sel: '.cfg-titulo', texto: 'Cargos' });
    await moverMouse(640, 20);
    await foto('04b-cargos', 'Configurações do servidor › Cargos: a lista e o editor, com as permissões em chaves e o que cada uma faz.');
    const paginas = [['Perfil do servidor', '04c-perfil'], ['Pessoas', '04d-pessoas'], ['Convites', '04f-convites'], ['Banidos', '04g-banidos'], ['Salas e categorias', '04h-salas']];
    for (const [titulo, nome] of paginas) {
      await clicar({ sel: '.cfg-item', texto: titulo });
      await esperar({ sel: '.cfg-titulo', texto: titulo });
      await foto(nome, 'Configurações do servidor › ' + titulo + '.');
      if (titulo === 'Pessoas') {
        await clicar({ sel: '.cfg-tabela-linha button[aria-label="Mais ações sobre Bia"]' });
        await esperar('.cfg-menu-acoes');
        await foto('04e-pessoas-acoes-da-bia', 'Pessoas: o "…" da Bia — castigo com durações, mutar, tirar da call, expulsar e banir com o nome, identificador da Saga.');
        await tecla('Escape');
      }
    }
    await clicar({ sel: '.cfg-lista-linha', texto: 'staff' });
    await foto('04i-salas-staff-privada', 'Salas e categorias com a #staff escolhida: nome, categoria e a chave de sala privada com os cargos.');
    await digitar({ sel: '.cfg-busca input' }, 'privada');
    await foto('04j-busca', 'A busca das configurações: "privada" leva a Salas e categorias.');
    await tecla('Escape');
    await tecla('Escape');
  });

  await passo('18-foto-do-servidor-enquadrada', async () => {
    // Uma foto LARGA (o mascote à esquerda), subida e enquadrada pelas rotas do app, com a
    // sessão que a própria página guarda. Pelo meio, o mascote some; enquadrada, aparece.
    const base = `http://127.0.0.1:${PORTA.saga}`;
    const subiu = await avaliar(`(async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 320;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 640, 320); grad.addColorStop(0, '#0f3d5c'); grad.addColorStop(1, '#1fa2a3');
      g.fillStyle = grad; g.fillRect(0, 0, 640, 320);
      g.fillStyle = '#f4f7fb'; g.beginPath(); g.arc(130, 160, 92, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0f3d5c'; g.beginPath(); g.arc(100, 140, 14, 0, 7); g.arc(160, 140, 14, 0, 7); g.fill();
      g.fillStyle = '#f4f7fb'; g.font = '900 58px Arial'; g.fillText('CANTINHO', 250, 180);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const h = { 'x-sessao': localStorage.getItem('cantinho.sessao'), 'x-servidor': localStorage.getItem('cantinho.servidor') };
      const a = await fetch('${base}/servidor/foto', { method: 'POST', headers: h, body: blob });
      return a.ok ? 'ok' : 'foto ' + a.status;
    })()`);
    if (subiu !== 'ok') throw new Error('subir a foto larga: ' + subiu);
    await clicar({ sel: '.engrenagem-do-servidor' });
    await esperar('.cfg-caixa');
    await clicar({ sel: '.cfg-item', texto: 'Perfil do servidor' });
    await esperar({ sel: '.cfg-titulo', texto: 'Perfil do servidor' });
    await foto('18a-foto-larga-pelo-meio', 'A foto larga do servidor, antes de enquadrar: pelo meio, o mascote some.');
    await clicar({ sel: '.escolher-imagem button', texto: 'Enquadrar' });
    await esperar('.enquadrar-quadro.quadrado');
    await foto('18b-enquadrar-quadrado', 'O editor de enquadramento da foto do servidor: o quadro é QUADRADO, como na trilha.');
    const salvo = await avaliar(`(async () => {
      const h = { 'content-type': 'application/json', 'x-sessao': localStorage.getItem('cantinho.sessao'), 'x-servidor': localStorage.getItem('cantinho.servidor') };
      const r = await fetch('${base}/servidor/enquadramento', { method: 'PATCH', headers: h, body: JSON.stringify({ papel: 'foto', valor: { x: 14, y: 50, zoom: 1.15 } }) });
      return r.status;
    })()`);
    if (salvo !== 200) throw new Error('enquadrar: ' + salvo);
    await tecla('Escape');
    await tecla('Escape');
    await abrirServidor('Servidor de casa');
    await abrirServidor('Cantinho');
    await moverMouse(640, 20);
    await foto('18c-trilha-com-a-foto-enquadrada', 'Depois de enquadrar: o mascote no quadrado da trilha e no alto da barra.');
  });

  await passo('05-configuracoes', async () => {
    await clicar({ sel: '.user-panel button', texto: 'Sua conta' });
    await esperar('.cfg-caixa');
    const paginas = [['Seu perfil', '05a-seu-perfil'], ['Conta e segurança', '05b-conta'], ['Voz e vídeo', '05c-voz-e-video'], ['Atalhos', '05d-atalhos'], ['Inicialização', '05e-inicializacao']];
    for (const [titulo, nome] of paginas) {
      await clicar({ sel: '.cfg-item', texto: titulo });
      await esperar({ sel: '.cfg-titulo', texto: titulo });
      await foto(nome, 'Configurações › ' + titulo + '.');
    }
    await digitar({ sel: '.cfg-busca input' }, 'micro');
    await foto('05f-busca-micro', 'A busca: "micro" acha Voz e vídeo.');
    await tecla('Escape');
    await tecla('Escape');
  });

  await passo('06-administracao', async () => {
    await clicar({ sel: '.trilha .adm-porta' });
    await esperar('.modal.administracao .adm-linha');
    await esperar('.adm-detalhe h3', 15000);
    await foto('06a-administracao-servidores', 'Administração da Saga (só o dono), aba Servidores: lista de todos os servidores e o detalhe do escolhido.');
    const rola = await avaliar(`(() => { const d = document.querySelector('.adm-detalhe'); return d.scrollHeight - d.clientHeight; })()`);
    if (rola > 20) {
      await avaliar(`document.querySelector('.adm-detalhe').scrollTop = 1e6`);
      await foto('06b-administracao-servidores-rolado', 'Administração, aba Servidores: o detalhe rolado até o fim (salas e cargos do servidor).');
      await avaliar(`document.querySelector('.adm-detalhe').scrollTop = 0`);
    }
    await fotoInteira('06c-administracao-servidores-inteiro', '.adm-detalhe', 'Administração, aba Servidores, detalhe inteiro');
    await clicar({ sel: '.modal.administracao .tabs button', texto: 'Contas' });
    await esperar({ sel: '.modal.administracao .painel-corpo:not([hidden])', texto: 'Marina' });
    await foto('06d-administracao-contas', 'Administração da Saga, aba Contas: todas as contas, Berserk e código de senha.');
    await fotoInteira('06e-administracao-contas-inteiro', '.modal.administracao .painel-corpo:not([hidden])', 'Administração, aba Contas');
  });

  await passo('07-botao-direito', async () => {
    await clicarDireito(sala('geral'));
    await esperar('.menu-salas .menu-titulo');
    await foto('07a-botao-direito-sala-de-texto', 'Botão direito numa sala de texto (#geral): renomear, quem pode ver, apagar.');
    await tecla('Escape');
    await clicarDireito(sala('Cinema'));
    await esperar({ sel: '.menu-salas .menu-titulo', texto: 'Cinema' });
    await foto('07b-botao-direito-sala-de-voz', 'Botão direito numa sala de voz (Cinema).');
    await tecla('Escape');
    await clicarDireito({ sel: '.cabecalho-de-categoria', texto: 'Jogatina' });
    await esperar({ sel: '.menu-salas .menu-titulo', texto: 'Jogatina' });
    await foto('07c-botao-direito-categoria', 'Botão direito numa categoria (Jogatina): criar sala, renomear/apagar categoria.');
    await tecla('Escape');
    const fundo = await avaliar(`(() => { const r = document.querySelector('.rooms').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 12 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: fundo.x, y: fundo.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fundo.x, y: fundo.y, button: 'right', buttons: 2, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fundo.x, y: fundo.y, button: 'right', buttons: 0, clickCount: 1 });
    await esperar('.menu-salas');
    await foto('07d-botao-direito-area-das-salas', 'Botão direito no vazio da lista de salas: criar sala de voz/chat e categoria.');
    await tecla('Escape');
    await clicarDireito({ sel: '.lista-membros .membro-linha', texto: 'Rafa' });
    await esperar('.menu-pessoa .nome-do-cartao');
    await foto('07e-botao-direito-pessoa', 'Botão direito numa pessoa da lista (Rafa): volume, amizade, perfil e moderação (cargo, castigo, expulsar, banir).');
    await tecla('Escape');
    await clicarDireito({ sel: '.chat-log .msg .msg-corpo', texto: 'revanche nada' });
    await esperar('.menu-da-mensagem');
    await foto('07f-botao-direito-mensagem', 'Botão direito numa mensagem: menu da mensagem (apagar).');
    await tecla('Escape');
    await clicarDireito({ sel: '.trilha .quadro-servidor', texto: 'Cantinho —' });
    await esperar('.menu-do-servidor');
    await foto('07g-botao-direito-quadrado-do-servidor', 'Botão direito no quadrado do servidor: o menu do servidor, com Configurações em primeiro.');
    await tecla('Escape');
  });

  await passo('08-amigos-e-conversas', async () => {
    await clicar({ sel: '.trilha .quadro-conversas' });
    await esperar('.tela-amigos .linha-de-amigo');
    await moverMouse(640, 20);
    await foto('08a-amigos', 'Modo conversas (primeiro quadrado da trilha): tela de Amigos — adicionar por apelido, pedidos recebidos, enviados e amigos.');
    await clicar({ sel: '.sidebar .conversa-grande', texto: 'Marina' });
    await esperar({ sel: '.chat-log .msg', texto: 'valeu' });
    await esperarQue(`!document.querySelector('.sidebar .conversa-grande.aberta .nao-lidas')`, { teto: 10000, oque: 'marca de não lidas da conversa aberta sumir' })
      .catch((e) => log('achado:', e.message));
    await moverMouse(640, 20);
    await foto('08b-conversa-privada', 'Conversa privada com a Marina (lista de conversas à esquerda; a coluna de pessoas some).');
    await abrirServidor('Cantinho');
    await clicar(sala('geral'));
    await esperar({ sel: '.chat-log .msg', texto: '21h na Sala 2' });
  });

  await passo('10-perfil', async () => {
    await clicar({ sel: '.lista-membros .membro-linha', texto: 'Marina' });
    await esperar('.modal.perfil .perfil-nome');
    await foto('10a-perfil-de-outra-pessoa', 'Cartão de perfil de outra pessoa (Marina, com foto e banner): cargo, desde quando, mandar mensagem, volume.');
    await tecla('Escape');
    await clicar({ sel: '.lista-membros .membro-linha', texto: 'TKP' });
    await esperar('.modal.perfil .perfil-nome');
    await moverMouse(5, 5);
    await foto('10b-perfil-proprio', 'Cartão do próprio perfil (TKP, dono do servidor e Berserk).');
  });

  await passo('11-criar-servidor', async () => {
    await clicar({ sel: '.trilha .quadro-servidor.acao', texto: '+' });
    await esperar('.modal.small .tabs');
    await foto('11a-servidores-entrar-com-convite', 'O "+" da trilha: janela "Servidores", aba de entrar com um convite.');
    await clicar({ sel: '.modal.small .tabs button', n: 1 });
    await foto('11b-criar-servidor', 'O "+" da trilha: aba de criar um servidor (só o nome).');
  });

  await passo('12-convidar', async () => {
    await clicar({ sel: '.cabeca-do-servidor' });
    await clicar({ sel: '.menu-do-servidor button', texto: 'Convidar gente' });
    await esperarQue(`(document.querySelector('.modal .codigo-convite')?.value ?? '').length > 0`, { oque: 'código do convite' });
    await foto('12-convidar', 'Convidar gente (pelo menu do servidor): código gerado na hora, copiar, gerar outro.');
  });

  await passo('13-status', async () => {
    await clicar({ sel: '.eu-status' });
    await esperar('.escolher-status');
    await foto('13-menu-de-status', 'Clique no próprio nome/bolinha embaixo à esquerda: status (online, ausente, ocupado) e sair da conta.');
    await clicar({ sel: '.eu-status' });
  });

  await passo('14-relatar', async () => {
    if (!(await existe('.relatar-faixa'))) throw new Error('sem botão de relatar (só aparece com plataforma darwin)');
    await clicar({ sel: '.relatar-faixa' });
    await esperar('.modal.small');
    await foto('14-relatar', 'Botão de relatar (faixa do alto da janela, no Mac): relatar erro ou sugerir melhoria.');
  });

  await passo('15-registro', async () => {
    await clicar({ sel: '.user-panel button', texto: 'Sua conta' });
    await esperar({ sel: '.modal.painel h3', texto: 'Seu perfil' });
    await clicar({ sel: '.modal.painel button', texto: 'Ver registro de erros' });
    await esperar({ sel: '.modal.painel .modal-head', texto: 'egistro' });
    await foto('15-registro-de-erros', 'Registro de erros (Sua conta › Ver registro de erros). Vazio aqui: o registro de verdade é do Electron.');
  });

  await passo('09-call-e-jogos', async () => {
    manterAvisoDoMicrofone = true;
    await clicar(sala('Sala 1'));
    await esperar('.voice-panel', 15000);
    try { await esperar('.voice-panel .dot.ok', 25000); }
    catch { log('a call não chegou a "conectada"; fotografo como estiver'); }
    // Lendo uma sala de texto, o 1º clique entra na voz e continua no chat; o 2º abre o palco.
    await esperarQue(`!document.querySelector('.sidebar .room[disabled]')`, { oque: 'salas clicáveis de novo' });
    await clicar(sala('Sala 1'));
    await esperarQue(`!document.querySelector('.chat-input')`, { oque: 'palco da call no lugar do chat' }).catch((e) => log('aviso:', e.message));
    await moverMouse(640, 20);
    await foto('09a-em-call', 'Dentro da sala de voz Sala 1 (sozinho, sem microfone — o aviso de microfone é esperado): palco, painel da voz embaixo à esquerda.');
    await moverMouse(680, 420);
    await foto('09z-barra-da-call-no-palco', 'Na call, com o mouse sobre o palco: a barra de controles no pé, e a lista de pessoas fora (o botão no cabeçalho a traz).');
    await moverMouse(640, 20);
    await clicar({ sel: '[data-abre-jogos]' });
    await esperar('.menu-de-jogos .menu-de-jogos-item');
    await foto('09b-menu-de-jogos', 'Menu de jogos (botão do painel da voz, só existe dentro de uma call): Xadrez, Fórmula 1, Dragão Quadrado, Urna.');
    await tecla('Escape');
    if (await existe('.menu-de-jogos')) await clicar({ sel: '[data-abre-jogos]' });
    await clicar({ sel: '.voice-actions button', texto: 'Soundboard' });
    await esperar({ sel: '.modal.painel .modal-head', texto: 'oundboard' });
    await foto('09c-soundboard', 'Soundboard (botão do painel da voz).');
    await tecla('Escape');
    await clicarDireito({ sel: '[data-abre-microfone]' });
    await esperar('.linha-da-sensibilidade');
    await foto('09d-ajustes-do-microfone', 'Botão direito no microfone: ruído e sensibilidade.');
    await tecla('Escape');
    if (await existe('.linha-da-sensibilidade')) await clicarDireito({ sel: '[data-abre-microfone]' });
    await clicar({ sel: '.voice-actions button.danger' });
    await esperarQue(`!document.querySelector('.voice-panel')`, { oque: 'sair da call' });
    manterAvisoDoMicrofone = false;
  });

  // --- a visão de quem NÃO manda: a Marina é Admin no Cantinho; a Bia, Veterano -----------
  await passo('16-como-membro', async () => {
    await sairDaConta();
    await entrarComo('Bia');
    await abrirServidor('Cantinho');
    await clicar(sala('geral'));
    await esperar({ sel: '.chat-log .msg', texto: '21h na Sala 2' });
    await moverMouse(640, 20);
    await foto('16a-membro-principal', 'A mesma tela para a Bia (cargo Veterano): sem a sala privada "staff", sem a porta da administração.');
    await clicar({ sel: '.cabeca-do-servidor' });
    await esperar('.menu-do-servidor');
    await foto('16b-membro-menu-do-servidor', 'Menu do servidor para quem não configura nada: convidar e sair, sem "Configurações do servidor" nem engrenagem.');
    await tecla('Escape');
  });

  await passo('17-sem-servidor', async () => {
    if (!(await existe('.connect-card'))) await sairDaConta();
    await entrarComo('Novato');
    await esperar('.tela-inicial');
    await foto('17a-tela-inicial-sem-servidor', 'Conta nova, sem servidor nenhum: tela inicial com "Entrar com um convite" e "Criar um servidor".');
    await clicar({ sel: '.tela-inicial button', texto: 'Criar um servidor' });
    await esperar('.modal.small .tabs');
    await foto('17b-criar-servidor-da-tela-inicial', 'Criar um servidor a partir da tela inicial.');
    await tecla('Escape');
    await clicar({ sel: '.tela-inicial button', texto: 'sair da conta' });
    await esperar('.connect-card');
  });
}

// ---------------------------------------------------------------------------------------
// Subir, semear, fotografar, derrubar
// ---------------------------------------------------------------------------------------
async function principal() {
  writeFileSync(join(EXEC, 'pids.txt'), '');
  rmSync(join(EXEC, 'banco'), { recursive: true, force: true });
  mkdirSync(join(EXEC, 'banco'), { recursive: true });
  rmSync(PERFIL, { recursive: true, force: true });

  const base = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: EXEC, LANG: 'pt_BR.UTF-8' };

  let comLiveKit = false;
  try { execFileSync('which', ['livekit-server']); comLiveKit = true; } catch { log('sem livekit-server: a call e o menu de jogos ficam de fora'); }
  if (comLiveKit) {
    subir('livekit', 'livekit-server', ['--config', join(AQUI, 'ferramentas', 'livekit.yaml'), '--node-ip', '127.0.0.1'], { env: base });
    await esperarHttp(`http://127.0.0.1:${PORTA.livekit}/`);
  }

  const envSaga = {
    ...base,
    PORT: String(PORTA.saga),
    BANCO: join(EXEC, 'banco', 'cantinho.db'),
    DONO: 'TKP',
    SERVER_NAME: 'Servidor de casa',   // o semeado pelo .env; o DONO vira dono dele ao entrar (server/index.mjs:352)
    ROOMS: 'Geral',
    LIVEKIT_API_KEY: LK.chave,
    LIVEKIT_API_SECRET: LK.segredo,
    LIVEKIT_HOST: `http://127.0.0.1:${PORTA.livekit}`,
    LIVEKIT_PUBLIC_URL: `ws://127.0.0.1:${PORTA.livekit}`,
    SEM_NOTAS: '1', GIPHY_KEY: '', RESEND_KEY: '', EMAIL_DE: '',
  };
  const argsSaga = ['--import', join(AQUI, 'ferramentas', 'so-local.mjs'), join(RAIZ, 'server', 'index.mjs')];
  const BASE = `http://127.0.0.1:${PORTA.saga}`;
  subir('saga', process.execPath, argsSaga, { env: envSaga });
  await esperarHttp(`${BASE}/health`);
  const dados = await semear(BASE, { log });
  // O dono da Saga só é promovido no ARRANQUE (plataforma.garantirDonoDaSaga): reinicia.
  await derrubar('saga');
  subir('saga', process.execPath, argsSaga, { env: envSaga });
  await esperarHttp(`${BASE}/health`);
  await depoisDoDono(BASE, dados);
  const eu = await (await fetch(`${BASE}/eu`, { headers: { 'x-sessao': dados.contas.TKP.token } })).json();
  if (!eu.eu?.donoDaSaga) throw new Error('o TKP não virou dono da Saga');
  writeFileSync(join(EXEC, 'dados.json'), JSON.stringify(dados, null, 2));

  // Gente "viva" na lista: o sinal que o app mandaria de 30 em 30 s.
  // `comStatus` põe o status de cada um; sem ele é só o "estou vivo", que não mexe no status —
  // assim, quem entrar pela tela e escolher outro status não é desmentido pelo relógio. Sair da
  // conta pela tela apaga o sinal (presenca.saiu), e o relógio a devolve em poucos segundos.
  const vivos = { Marina: 'online', Rafa: 'ausente', Bia: 'ocupado', Duda: 'online' };
  const bater = (comStatus = false) => Promise.all(Object.entries(vivos).map(([p, status]) => fetch(`${BASE}/eu/presenca`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-sessao': dados.contas[p].token },
    body: JSON.stringify(comStatus ? { status } : {}),
  }).catch(() => {})));
  await bater(true);
  const relogio = setInterval(() => bater(), 4000);

  subir('vite', join(RAIZ, 'app', 'node_modules', '.bin', 'vite'), ['--config', join(AQUI, 'ferramentas', 'vite.config.mjs')], {
    env: { ...base, PORTA_SAGA: String(PORTA.saga), PORTA_VITE: String(PORTA.vite), VITE_CACHE: join(EXEC, 'vite-cache') },
  });
  await esperarHttp(`http://127.0.0.1:${PORTA.vite}/`, 60000);

  subir('chrome', CHROME, [
    '--headless=new', '--mute-audio',
    `--remote-debugging-port=${PORTA.cdp}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${PERFIL}`, `--window-size=${TAMANHOS[0].join(',')}`,
    '--use-mock-keychain', '--password-store=basic',          // sem pedir o Chaveiro do Mac
    '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-default-apps',
    '--disable-features=MediaRouter,DialMediaRouteProvider,Translate,OptimizationHints,GlobalMediaControls,WebRtcHideLocalIpsWithMdns',
    // O LiveKit das fotos só existe em 127.0.0.1: sem isto o WebRTC do Chrome ignora o
    // loopback e a call cai em "could not establish pc connection".
    '--allow-loopback-in-peer-connection',
    '--deny-permission-prompts', '--disable-notifications',
    // Aba nunca "em segundo plano": sem isto, uma aba que o Chrome abrisse sozinho parava a nossa.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--disable-crash-reporter', '--disable-breakpad',
    '--lang=pt-BR', '--force-device-scale-factor=1', 'about:blank',
  ], { env: base });
  await esperarHttp(`http://127.0.0.1:${PORTA.cdp}/json/version`);
  const alvos = await (await fetch(`http://127.0.0.1:${PORTA.cdp}/json/list`)).json();
  const pagina = alvos.find((t) => t.type === 'page');
  // O Chrome de verdade às vezes abre uma aba sozinho (vimos chrome://settings/help aparecer
  // quando o atualizador do Google acordou). Ela jogava a nossa para segundo plano e parava
  // tudo. Toda página que não for a nossa é fechada assim que nasce.
  const versao = await (await fetch(`http://127.0.0.1:${PORTA.cdp}/json/version`)).json();
  navegador = new CDP(versao.webSocketDebuggerUrl);
  await navegador.abrir();
  navegador.ouvintes.add((m) => {
    if (m.method !== 'Target.targetCreated' && m.method !== 'Target.targetInfoChanged') return;
    const t = m.params.targetInfo;
    if (t.type === 'page' && t.targetId !== pagina.id && !String(t.url).includes(`:${PORTA.vite}`)) {
      log('aba intrusa, fechando:', t.url);
      navegador.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
      cdp?.send('Page.bringToFront').catch(() => {});
    }
  });
  await navegador.send('Target.setDiscoverTargets', { discover: true });
  cdp = new CDP(pagina.webSocketDebuggerUrl);
  await cdp.abrir();

  const consola = join(EXEC, 'console.log');
  cdp.ouvintes.add((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn'].includes(m.params.type)) {
      appendFileSync(consola, `${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}\n`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      appendFileSync(consola, `exceção: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}\n`);
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      appendFileSync(consola, `log: ${m.params.entry.text} ${m.params.entry.url ?? ''}\n`);
    }
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.setBypassCSP', { enabled: true });
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Sao_Paulo' });
  await cdp.send('Emulation.setLocaleOverride', { locale: 'pt-BR' }).catch(() => {});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: stub(PLATAFORMA) });

  try {
    for (const [w, h] of TAMANHOS) {
      tamanhoAtual = [w, h];
      pasta = TAMANHOS.length > 1 && !(w === 1280 && h === 800) ? join(SAIDA, `${w}x${h}`) : SAIDA;
      mkdirSync(pasta, { recursive: true });
      await viewport(w, h).catch(() => {});
      // Cada tamanho começa do zero: sem crachá, sem apelido lembrado, e o grupo com o mesmo status.
      await bater(true);
      await cdp.send('Storage.clearDataForOrigin', { origin: `http://127.0.0.1:${PORTA.vite}`, storageTypes: 'all' });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORTA.vite}/` });
      await viewport(w, h);
      await roteiro(dados);
    }
  } finally {
    clearInterval(relogio);
    writeFileSync(join(SAIDA, 'manifesto.json'), JSON.stringify({ fotos: manifesto, falhas }, null, 2));
    cdp.fechar();
    navegador?.fechar();
  }
}

const MANTER = process.argv.includes('--manter');   // depurar: deixa tudo no ar até Ctrl+C
try {
  await principal();
  if (MANTER) { log('--manter: tudo no ar; Ctrl+C derruba'); await new Promise(() => {}); }
  log(`pronto: ${manifesto.length} fotos, ${falhas.length} falhas`);
  for (const f of falhas) log('falha:', f);
} catch (e) {
  log('ERRO:', e.stack ?? e.message);
  process.exitCode = 1;
} finally {
  await derrubarTudo();
  log('tudo derrubado');
}
