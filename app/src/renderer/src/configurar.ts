import type { Cargo, Permissao } from './api';

/**
 * O que dá uma página nas Configurações do servidor. Ficam de fora `convidar` (vem ligado
 * para todo mundo, como o @everyone), `apagarMensagens` (age na conversa, não tem página) e
 * `definirId` (quem define o identificador é o dono da Saga, não o cargo).
 */
const CONFIGURA: Permissao[] = ['gerirServidor', 'gerirSalas', 'gerirCargos', 'definirCargo', 'gerirSons', 'banir', 'expulsar', 'timeout', 'mutar', 'desconectar'];

/**
 * Se a pessoa configura ALGUMA coisa neste servidor — é quem vê "Configurações do servidor"
 * e a engrenagem. Para quem não configura nada, o item abria uma lista de pessoas e um botão
 * de sair: prometia configuração e entregava outra coisa.
 */
export const podeConfigurar = (cargo: Cargo | null | undefined) =>
  !!cargo && (!!cargo.dono || cargo.permissoes.some((p) => CONFIGURA.includes(p)));
