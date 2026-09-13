// O botão "Relatar": um erro ou uma ideia de melhoria, guardados para o dono da Saga decidir.
//
// Da SAGA, e não de um servidor — quem decide o que vale é o dono do app. Nenhum amigo lê o
// relato de outro. O que se guarda é o que o dono pergunta primeiro quando alguém diz "deu
// erro": o que aconteceu, em que versão, em que sistema, em que tela, e o registro de erros
// quando a pessoa deixa ir junto (ele já é gravado sem senhas nem crachás de sessão).
import { ErroDeConta } from './contas.mjs';
import * as repo from './repositorios/relatos.mjs';

export const TIPOS = ['erro', 'melhoria'];
export const TEXTO_MAXIMO = 4000;
/** O registro vai do fim: é onde está o que acabou de acontecer. */
export const REGISTRO_MAXIMO = 60_000;
/** Por conta, por hora: o bastante para quem encontrou três coisas, pouco para um laço. */
export const POR_HORA = 10;
/**
 * Sem conta, por hora, somando TODO MUNDO. Não é por IP: o CLAUDE.md conta como um freio por
 * IP trancou o grupo inteiro atrás do mesmo roteador. Aqui o pior caso de um teto global é
 * alguém sem conta esperar a hora virar — e quem tem conta nunca passa por ele.
 */
export const SEM_CONTA_POR_HORA = 30;
const HORA = 60 * 60_000;

const curto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : null);

/** O contexto que o app manda, só com os campos conhecidos e cada um curto. */
export function limparContexto(contexto) {
  const c = contexto && typeof contexto === 'object' ? contexto : {};
  return {
    versao: curto(c.versao, 20),
    sistema: curto(c.sistema, 20),
    servidor: curto(c.servidor, 60),
    tela: curto(c.tela, 80),
  };
}

export function relatar(db, usuario, { tipo, texto, contexto, registro } = {}, agora = Date.now()) {
  if (!TIPOS.includes(tipo)) throw new ErroDeConta('Diga se é um erro ou uma ideia de melhoria.', 400);
  const limpo = typeof texto === 'string' ? texto.trim() : '';
  if (limpo.length < 3) throw new ErroDeConta('Conte o que aconteceu, com pelo menos algumas palavras.', 400);
  if (limpo.length > TEXTO_MAXIMO) throw new ErroDeConta(`O relato passa de ${TEXTO_MAXIMO} caracteres.`, 400);

  const usuarioId = usuario?.id ?? null;
  const teto = usuarioId === null ? SEM_CONTA_POR_HORA : POR_HORA;
  if (repo.contarDesde(db, usuarioId, agora - HORA) >= teto) {
    throw new ErroDeConta('Muitos relatos em pouco tempo — tente de novo daqui a pouco.', 429);
  }
  const doRegistro = typeof registro === 'string' && registro.trim() ? registro.slice(-REGISTRO_MAXIMO) : null;
  const id = repo.inserir(db, {
    usuarioId,
    tipo,
    texto: limpo,
    contexto: JSON.stringify(limparContexto(contexto)),
    registro: doRegistro,
    criadoEm: agora,
  });
  return { id };
}
