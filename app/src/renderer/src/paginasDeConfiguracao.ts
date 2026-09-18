import type { ReactNode } from 'react';
import type { Cargo, Permissao } from './api';

/**
 * As páginas das casas de configuração, e a busca por elas.
 *
 * A lista é UMA por casa e alimenta o menu lateral, a busca e o submenu do botão direito no
 * quadrado do servidor — é o `generateSections` do Discord: com uma lista só, os três
 * caminhos não têm como divergir. Antes, "criar sala" existia em três lugares com três
 * nomes, e o que se achava pelo botão direito não estava no painel.
 */
export type Pagina<Id extends string = string> = {
  id: Id;
  titulo: string;
  icone: string;
  /** O cabeçalho do grupo no menu (em versalete). Sem ele, a página fica no alto, solta. */
  grupo?: string;
  /** Outras palavras que levam a esta página: "microfone" acha "Voz e vídeo". */
  busca?: string[];
  /** Vai para o pé do menu, depois de um risco (sair). */
  fim?: boolean;
  tom?: 'perigo';
  /** Ação em vez de página: abrir o registro, a administração, sair. */
  acao?: () => void;
  armado?: boolean;
  fimDoItem?: ReactNode;
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** As páginas que respondem ao que foi digitado: pelo título primeiro, depois pelos sinônimos. */
export function buscarPaginas<P extends { titulo: string; busca?: string[] }>(paginas: P[], busca: string): P[] {
  const b = semAcento(busca);
  if (!b) return [];
  const peloTitulo = paginas.filter((p) => semAcento(p.titulo).includes(b));
  const pelosSinonimos = paginas.filter((p) => !peloTitulo.includes(p) && (p.busca ?? []).some((s) => semAcento(s).includes(b)));
  return [...peloTitulo, ...pelosSinonimos];
}

export type PaginaDoServidor = 'perfil' | 'pessoas' | 'cargos' | 'convites' | 'banidos' | 'salas';

type Pode = (p: Permissao) => boolean;

/**
 * As páginas das Configurações do servidor que ESTE cargo usa. Quem não pode, não vê: a lista
 * fica curta para cada pessoa, em vez de páginas que só dizem "seu cargo não deixa".
 */
export function paginasDoServidor(cargo: Cargo | null | undefined): Pagina<PaginaDoServidor>[] {
  const pode: Pode = (p) => !!cargo && (!!cargo.dono || cargo.permissoes.includes(p));
  const moderaAlguem = (['mutar', 'desconectar', 'timeout', 'expulsar', 'banir', 'definirCargo'] as Permissao[]).some(pode);
  const lista: (Pagina<PaginaDoServidor> | false)[] = [
    pode('gerirServidor') && { id: 'perfil', titulo: 'Perfil do servidor', icone: 'imagem', busca: ['nome', 'foto', 'capa', 'banner', 'ícone', 'imagem'] },
    moderaAlguem && { id: 'pessoas', titulo: 'Pessoas', icone: 'pessoas', grupo: 'Pessoas e cargos', busca: ['membros', 'castigo', 'expulsar', 'mutar', 'identificador', 'moderar'] },
    pode('gerirCargos') && { id: 'cargos', titulo: 'Cargos', icone: 'escudo', grupo: 'Pessoas e cargos', busca: ['permissões', 'permissao', 'nível', 'hierarquia', 'cor'] },
    pode('convidar') && { id: 'convites', titulo: 'Convites', icone: 'link', grupo: 'Pessoas e cargos', busca: ['convidar', 'código', 'chamar'] },
    pode('banir') && { id: 'banidos', titulo: 'Banidos', icone: 'banir', grupo: 'Pessoas e cargos', busca: ['banir', 'desbanir', 'ban'] },
    pode('gerirSalas') && { id: 'salas', titulo: 'Salas e categorias', icone: 'lista', grupo: 'Salas', busca: ['sala', 'canal', 'categoria', 'privada', 'quem pode ver', 'renomear', 'apagar sala'] },
  ];
  return lista.filter((p): p is Pagina<PaginaDoServidor> => !!p);
}

export type PaginaDaConta = 'perfil' | 'conta' | 'voz' | 'atalhos' | 'inicio';

/** As páginas das SUAS configurações (as ações — relatar, registro, administração, sair — quem monta é a tela). */
export const PAGINAS_DA_CONTA: Pagina<PaginaDaConta>[] = [
  { id: 'perfil', titulo: 'Seu perfil', icone: 'perfil', grupo: 'Sua conta', busca: ['foto', 'capa', 'banner', 'nome', 'enquadrar', 'gif', 'avatar'] },
  { id: 'conta', titulo: 'Conta e segurança', icone: 'escudo', grupo: 'Sua conta', busca: ['senha', 'e-mail', 'email', 'apelido', 'segurança'] },
  { id: 'voz', titulo: 'Voz e vídeo', icone: 'mic', grupo: 'Este computador', busca: ['microfone', 'mic', 'câmera', 'camera', 'saída de som', 'fone', 'supressão', 'ruído', 'sensibilidade', 'qualidade', 'tela', 'transmissão', 'soundboard'] },
  { id: 'atalhos', titulo: 'Atalhos', icone: 'teclado', grupo: 'Este computador', busca: ['teclado', 'overlay', 'live por cima do jogo', 'travar'] },
  { id: 'inicio', titulo: 'Inicialização', icone: 'atualizar', grupo: 'Este computador', busca: ['ligar o computador', 'abrir com o sistema', 'windows', 'mac', 'versão', 'atualização'] },
];
