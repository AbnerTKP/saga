/**
 * O `window.desktop` da Saga no navegador.
 *
 * No Electron essa ponte é o preload (`src/preload/index.ts`), e a tela inteira fala com o
 * computador por ela. No navegador não há processo principal: cada função faz o que o
 * navegador sabe fazer, e o resto responde "não há" do jeito que a tela já entende — a
 * mesma coisa que o preload de mentira do `ferramentas/fotografar` sempre fez para as fotos,
 * agora de verdade. O que só existe no computador (transmitir a tela com o som, overlay,
 * atualizar, abrir junto com o sistema, bot de música) fica desligado aqui; a tela esconde os
 * botões pelo `platform: 'web'` — ver `recursosDaTela`, em celular.ts.
 *
 * Tem de ser importado ANTES do app: há módulos que leem `window.desktop` ao carregar.
 */
import type { UpdateState } from '../src/desktop';

const nada = () => Promise.resolve();
const semInscricao = () => () => {};

/** O registro de erros vive na memória da aba: não há arquivo para escrever. */
const REGISTRO: string[] = [];
const LINHAS_NO_REGISTRO = 1000;
const agora = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/**
 * Copiar no navegador é o `navigator.clipboard`: aqui não há porteiro de permissões nenhum
 * no caminho (no Electron há, e por isso lá a cópia vai pelo processo principal — ver
 * copiar.ts). Sem ele (página fora de HTTPS, navegador antigo), o caminho velho do
 * `execCommand`, que ainda funciona dentro de um clique.
 */
async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return;
  } catch { /* cai no caminho velho */ }
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  const deu = document.execCommand('copy');
  campo.remove();
  if (!deu) throw new Error('O navegador não deixou copiar.');
}

/**
 * Baixar o anexo: o arquivo vem do servidor da Saga, que é outro endereço — e o `download`
 * de um `<a>` só vale para o mesmo endereço da página. Então baixa primeiro e entrega o
 * arquivo pronto, com o nome dele.
 */
async function salvarArquivo(url: string, nome: string) {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, erro: `o servidor respondeu ${r.status}` };
    const blob = await r.blob();
    const local = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = local;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(local), 60_000);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * "A máquina acordou": no navegador, a aba que volta para a frente depois de um tempo
 * escondida. O celular congela a aba de trás — os relógios do app passam esse tempo parados,
 * e é justamente quando tudo precisa ser buscado de novo. Voltar da rede também conta.
 */
const ESCONDIDA_POR_QUANTO = 20_000;
function aoAcordar(cb: () => void) {
  let escondidaEm: number | null = document.hidden ? Date.now() : null;
  const visibilidade = () => {
    if (document.hidden) { escondidaEm = Date.now(); return; }
    if (escondidaEm !== null && Date.now() - escondidaEm >= ESCONDIDA_POR_QUANTO) cb();
    escondidaEm = null;
  };
  const voltouDoCache = (e: PageTransitionEvent) => { if (e.persisted) cb(); };
  document.addEventListener('visibilitychange', visibilidade);
  window.addEventListener('online', cb);
  window.addEventListener('pageshow', voltouDoCache);
  return () => {
    document.removeEventListener('visibilitychange', visibilidade);
    window.removeEventListener('online', cb);
    window.removeEventListener('pageshow', voltouDoCache);
  };
}

/**
 * Parado há quanto tempo. O navegador não sabe do teclado fora da aba; o que dá para saber
 * é o último toque NESTA página — e, com ela escondida, desde quando ela está escondida.
 */
let ultimoGesto = Date.now();
for (const tipo of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
  window.addEventListener(tipo, () => { ultimoGesto = Date.now(); }, { passive: true, capture: true });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) ultimoGesto = Date.now(); });

const NAO_TEM = 'Isso só existe na Saga do computador.';

window.desktop = {
  platform: 'web',
  listSources: () => Promise.resolve([]),
  chooseSource: () => Promise.reject(new Error(NAO_TEM)),
  screenPermission: () => Promise.resolve('denied'),
  usaSeletorDoSistema: () => Promise.resolve(false),
  openScreenSettings: nada,
  // Fora do build da web (o servidor de fotos, por exemplo) a versão não foi carimbada.
  version: () => Promise.resolve(typeof __VERSAO__ === 'string' ? __VERSAO__ : 'dev'),
  musica: {
    achar: () => Promise.resolve({ ok: false, erro: NAO_TEM }),
    preparar: () => Promise.resolve({ ok: false, erro: NAO_TEM }),
    ler: () => Promise.resolve(null),
  },
  janela: {
    minimizar: nada,
    alternarMaximizar: nada,
    fechar: nada,
    estaMaximizada: () => Promise.resolve(false),
    aoMaximizar: semInscricao,
  },
  registrar: (nivel, origem, mensagem) => {
    REGISTRO.push(`${agora()} [${nivel}] ${origem}: ${mensagem}`);
    if (REGISTRO.length > LINHAS_NO_REGISTRO) REGISTRO.splice(0, REGISTRO.length - LINHAS_NO_REGISTRO);
    return nada();
  },
  lerRegistro: () => Promise.resolve(REGISTRO.join('\n')),
  copiarRegistro: copiar,
  abrirPastaDoRegistro: nada,
  // Atualizar no navegador é recarregar a página: a versão nova já está no endereço.
  onUpdate: () => {},
  updateAtual: () => Promise.resolve<UpdateState>({ fase: 'nenhuma' }),
  installUpdate: () => { location.reload(); return nada(); },
  openExternal: (url) => { window.open(url, '_blank', 'noopener,noreferrer'); return nada(); },
  salvarArquivo,
  aoAcordar,
  ociosidade: () => Promise.resolve(Math.floor((Date.now() - ultimoGesto) / 1000)),
  aberturaComOSistema: () => Promise.resolve({ disponivel: false, loja: false, ligado: false }),
  definirAberturaComOSistema: () => Promise.resolve({ disponivel: false, loja: false, ligado: false }),
  overlay: {
    travar: () => Promise.resolve(false),
    estado: () => Promise.resolve({ aberto: false, travado: false, atalho: '' }),
    redimensionar: nada,
    fechar: nada,
    definirAtalho: (texto) => Promise.resolve({ atalho: texto, valeu: false }),
    aoTravar: semInscricao,
    aoFechar: semInscricao,
  },
};
