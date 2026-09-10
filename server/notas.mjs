// A sala de notas de versão: o que mudou em cada versão, dentro do próprio app.
//
// Ela se mantém sozinha. O servidor lê os Releases do GitHub — que já saem com o que
// mudou, gerado dos assuntos dos commits — e publica o que ainda não está lá. Não há
// segredo envolvido e nada é empurrado de fora: é o servidor que vai buscar, então
// ninguém precisa lembrar de anunciar nada quando publica uma versão.
import * as tabelaDeSalas from './repositorios/salas.mjs';
import * as tabelaDeMensagens from './repositorios/mensagens.mjs';

const REPO = 'AbnerTKP/saga';
const MARCAS = /<!--\s*mudancas\s*-->([\s\S]*?)<!--\s*\/mudancas\s*-->/;
/**
 * A data é sempre a de São Paulo, não a da máquina.
 *
 * O servidor roda em UTC dentro do contêiner e o pessoal está no Brasil: uma versão
 * publicada às 23h daqui cairia no dia seguinte para quem lê. Prender o fuso faz a data
 * ser a que as pessoas viveram, e faz o texto não depender de onde o processo está.
 */
const DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'short', year: 'numeric',
});

export const NOME_DA_SALA = 'notas-da-versão';
export const PAPEL = 'notas';

/**
 * A sala existe, é de texto e fica no topo.
 *
 * Idempotente: procura pelo PAPEL, não pelo nome, então renomeá-la à mão no banco não
 * faria nascer uma segunda. `ordem` negativa a põe antes de qualquer sala criada pelo
 * pessoal, e `listarSalas` ainda a força para o topo por via das dúvidas.
 */
export function garantirSalaDeNotas(db, servidorId) {
  const existe = tabelaDeSalas.comOPapel(db, servidorId, PAPEL);
  if (existe) return existe;

  // Se já houver uma sala com este nome (criada à mão antes), adota-a em vez de brigar
  // com o UNIQUE(servidor_id, nome).
  const homonima = tabelaDeSalas.porNome(db, servidorId, NOME_DA_SALA);
  if (homonima) {
    tabelaDeSalas.virarSalaDeNotas(db, homonima.id, PAPEL);
    return tabelaDeSalas.porId(db, homonima.id);
  }

  const id = tabelaDeSalas.inserir(db, {
    servidorId, nome: NOME_DA_SALA, tipo: 'texto', ordem: -1, papel: PAPEL,
  });
  return tabelaDeSalas.porId(db, id);
}

export const salaDeNotas = (db, servidorId) => tabelaDeSalas.comOPapel(db, servidorId, PAPEL);

const dia = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : DATA.format(d);
};

/**
 * O texto de uma versão, do jeito que vai aparecer no chat.
 *
 * A primeira linha começa com a etiqueta e é por ela que se sabe se a versão já foi
 * publicada — sem coluna nova para um problema que uma busca resolve.
 */
export function textoDaVersao({ tag, quando, mudancas }) {
  const cabeca = quando ? `${tag} — ${quando}` : tag;
  return [cabeca, '', ...mudancas.map((m) => `• ${m}`)].join('\n');
}

/** O que mudou, tirado do corpo do Release: só o trecho entre as marcas. */
export function mudancasDoCorpo(corpo) {
  const m = MARCAS.exec(corpo ?? '');
  if (!m) return [];
  return m[1].split('\n')
    .map((l) => l.replace(/^\s*[-*]\s?/, '').trim())
    .filter((l) => l.length > 0);
}

/** As versões que ainda não estão na sala, da mais velha para a mais nova. */
export function versoesQueFaltam(lancamentos, jaPublicadas) {
  const tem = new Set(jaPublicadas);
  return lancamentos
    .filter((r) => !r.draft && !r.prerelease && r.tag_name && !tem.has(r.tag_name))
    .map((r) => ({
      tag: r.tag_name,
      quando: dia(r.published_at),
      // A hora da mensagem é a do LANÇAMENTO, não a de quando o servidor a copiou:
      // senão as 53 antigas apareceriam todas como sendo de hoje.
      em: Date.parse(r.published_at) || Date.now(),
      mudancas: mudancasDoCorpo(r.body),
    }))
    .filter((v) => v.mudancas.length > 0)
    // Da mais velha para a mais nova: o chat se lê de cima para baixo.
    .reverse();
}

/** As etiquetas que já têm mensagem na sala. A etiqueta é a primeira palavra do texto. */
export function jaPublicadas(db, salaId) {
  return new Set(
    tabelaDeMensagens.textosDaSala(db, salaId)
      .map((texto) => String(texto).split(/[\s—\n]/)[0])
      .filter((t) => /^v\d/.test(t)),
  );
}

async function buscarLancamentos(buscar = fetch) {
  const r = await buscar(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
    headers: { 'user-agent': 'saga-servidor', accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
  return r.json();
}

/**
 * Põe na sala o que faltar. Devolve quantas versões foram publicadas.
 *
 * As mensagens vão sem autor (`usuario_id` nulo): não foi ninguém que escreveu, foi a
 * Saga. `listarMensagens` sabe disso pela sala.
 */
export async function publicarNotas(db, servidorId, { buscar } = {}) {
  const sala = garantirSalaDeNotas(db, servidorId);
  const lancamentos = await buscarLancamentos(buscar);
  const faltam = versoesQueFaltam(lancamentos, jaPublicadas(db, sala.id));
  if (faltam.length === 0) return 0;

  for (const v of faltam) {
    tabelaDeMensagens.inserirDaSaga(db, {
      salaId: sala.id, texto: textoDaVersao(v), criadoEm: v.em ?? Date.now(),
    });
  }
  return faltam.length;
}
