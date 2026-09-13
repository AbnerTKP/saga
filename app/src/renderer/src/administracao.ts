/**
 * As contas da administração da Saga que dão para fazer longe da tela.
 *
 * A administração é do dono da Saga e mostra TODOS os servidores, inclusive os de que ele
 * não faz parte — como estão montados, nunca a conversa. O que mora aqui é ordem e redação:
 * que servidor vem antes, como se diz "há quanto tempo", em que grupo cada pessoa e cada
 * sala aparecem.
 *
 * `agora` entra por parâmetro, como em `dias.ts`: uma janela aberta desde ontem não pode
 * congelar o "hoje" do momento em que abriu.
 */
import { rotuloDoDia } from './dias.ts';
import { rotaQueNaoExiste } from './resposta.ts';
import type { Categoria, CargoDaSaga, Membro, SalaDaSaga, ServidorDaSaga } from './api.ts';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Sem maiúscula nem acento: quem procura "agora" quer achar "Ágora". */
const paraProcurar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Os servidores na ordem em que a lista os mostra, filtrados pela busca — pelo nome do
 * servidor ou pelo apelido de quem o criou.
 *
 * Por NOME, e não por atividade, de propósito: a lista se atualiza de 10 em 10 s, e ordenar
 * pelo mais movimentado faria as linhas trocarem de lugar debaixo do mouse — o clique cairia
 * no servidor que acabou de subir. Nome igual desempata pelo id, senão dois "Geral" trocariam
 * de lugar entre uma volta e outra.
 */
export function servidoresNaOrdem(lista: ServidorDaSaga[], busca: string): ServidorDaSaga[] {
  const termo = paraProcurar(busca.trim());
  return lista
    .filter((s) => !termo
      || paraProcurar(s.nome).includes(termo)
      || (!!s.criador && paraProcurar(s.criador.apelido).includes(termo)))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) || a.id - b.id);
}

/** O dia civil à meia-noite, no fuso de quem lê. */
const meiaNoite = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * "Há quanto tempo", do jeito que se fala.
 *
 * Os dias contam pelo CALENDÁRIO de quem lê, e não em blocos de 24 h: 23h do dia 7 lida à
 * 1h do dia 9 são 26 h — um bloco só —, e ninguém diria "há 1 dia" de uma coisa de
 * anteontem. Passada uma semana, a data diz mais que a conta, e sai do jeito que o separador
 * do chat já a escreve.
 */
export function haQuanto(quando: number | null, agora: number): string {
  if (quando === null) return 'nunca';
  const passou = agora - quando;
  // Relógio desta máquina atrás do servidor dá diferença negativa: é "agora", não o futuro.
  if (passou < MINUTO) return 'agora há pouco';
  if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`;
  const rotulo = rotuloDoDia(quando, agora);
  if (rotulo === 'Hoje') return `há ${Math.floor(passou / HORA)} h`;
  if (rotulo === 'Ontem') return 'ontem';
  // Arredondado, e não truncado: onde há horário de verão, um dia tem 23 ou 25 h.
  const dias = Math.round((meiaNoite(agora) - meiaNoite(quando)) / DIA);
  return dias < 7 ? `há ${dias} dias` : rotulo;
}

/**
 * A data no meio de uma frase: "banido por TKP hoje", "banido por TKP em 4 de set.".
 * `rotuloDoDia` escreve para um separador, com maiúscula e sem preposição.
 */
export function emQueDia(quando: number, agora: number): string {
  const rotulo = rotuloDoDia(quando, agora);
  return rotulo === 'Hoje' || rotulo === 'Ontem' ? rotulo.toLowerCase() : `em ${rotulo}`;
}

/** "1 pessoa", "5 pessoas" — e "0 pessoas", que em português vai no plural. */
export const contar = (n: number, singular: string, plural: string) =>
  `${n} ${n === 1 ? singular : plural}`;

/**
 * O que dizer quando a busca falha.
 *
 * App e servidor sobem separados: app novo contra servidor antigo pergunta por uma rota que
 * lá não existe (`rotaQueNaoExiste`, em resposta.ts). Mostrado cru, o "não encontrado" do
 * roteador faria o dono achar que a administração quebrou — ou pior, que os servidores
 * sumiram. O outro 404, "Esse servidor não existe.", é resposta de verdade e passa como veio.
 */
export function explicarFalha(status: number, mensagem: string): string {
  if (rotaQueNaoExiste(status, mensagem)) {
    return 'O servidor da Saga ainda não conhece a administração: ela chega quando o servidor for publicado.';
  }
  return mensagem;
}

/** Do nível mais alto ao mais baixo, como se lê uma hierarquia; empatados, na ordem de criação. */
export const cargosDoMaisAlto = (cargos: CargoDaSaga[]): CargoDaSaga[] =>
  cargos.slice().sort((a, b) => b.nivel - a.nivel || a.id - b.id);

export type GrupoDeSalas = { categoria: Categoria | null; salas: SalaDaSaga[] };

/**
 * As salas agrupadas como a barra as mostra: as sem gaveta primeiro — são as que ninguém
 * guardou ainda —, depois cada categoria pela ordem dela. Dentro do grupo, a ordem que veio.
 *
 * Sala de uma gaveta que não veio na lista cai no grupo sem gaveta, e não some. A barra só
 * desenha o que acha; aqui a pergunta é "o que existe neste servidor", e a sala que não
 * aparecesse em lugar nenhum seria justamente a que ninguém acharia para consertar.
 */
export function salasPorCategoria(salas: SalaDaSaga[], categorias: Categoria[]): GrupoDeSalas[] {
  const existem = new Set(categorias.map((c) => c.id));
  const soltas = salas.filter((s) => s.categoriaId == null || !existem.has(s.categoriaId));
  const gavetas = categorias
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.id - b.id)
    .map((categoria) => ({ categoria, salas: salas.filter((s) => s.categoriaId === categoria.id) }));
  return [{ categoria: null, salas: soltas }, ...gavetas].filter((g) => g.salas.length > 0);
}

export type GrupoDePessoas = { cargo: CargoDaSaga | null; pessoas: Membro[] };

/**
 * Quem faz parte do servidor, por cargo, do mais alto ao mais baixo — o desenho da lista da
 * direita. Banido não entra: não faz mais parte, e tem seção própria.
 *
 * Quem criou o servidor fica no grupo do cargo que VESTE: o cargo dele chega montado com
 * `dono` e nível 1000, mas com o id do cargo de verdade. Sem cargo nenhum o id vem nulo, e
 * ele cai em "Sem cargo" como qualquer um — quem diz que ele criou é o selo, não o grupo.
 */
export function pessoasPorCargo(membros: Membro[], cargos: CargoDaSaga[]): GrupoDePessoas[] {
  const presentes = membros.filter((m) => !m.banido);
  const conhecidos = new Set(cargos.map((c) => c.id));
  const grupos: GrupoDePessoas[] = cargosDoMaisAlto(cargos)
    .map((cargo) => ({ cargo, pessoas: presentes.filter((m) => m.cargo?.id === cargo.id) }));
  // Cargo que não está na lista também vem para cá: nesta tela ninguém pode sumir.
  grupos.push({ cargo: null, pessoas: presentes.filter((m) => m.cargo?.id == null || !conhecidos.has(m.cargo.id)) });
  return grupos.filter((g) => g.pessoas.length > 0);
}

/**
 * Os nomes dos cargos que veem uma sala privada, do mais alto ao mais baixo.
 *
 * Sala aberta devolve vazio mesmo que tenha cargos guardados: todo mundo a vê, e listar
 * cargos ali sugeriria uma tranca que não existe.
 */
export function quemVe(sala: Pick<SalaDaSaga, 'privada' | 'cargos'>, cargos: CargoDaSaga[]): string[] {
  if (!sala.privada) return [];
  return cargosDoMaisAlto(cargos.filter((c) => sala.cargos.includes(c.id))).map((c) => c.nome);
}
