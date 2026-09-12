// Amizade: quem pode falar com quem.
//
// A conversa privada é a única coisa da Saga que não passa por cargo nenhum — não há
// moderação entre duas pessoas. O que existe no lugar é a amizade: **só quem você
// aceitou consegue te mandar mensagem**. Pedir é bater na porta; quem abre é o outro.
//
// Saber o apelido de alguém, por isso, não abre porta nenhuma — é a mesma regra do
// convite de servidor ("saber o número de um servidor alheio não abre porta"), com a
// diferença de que aqui a porta é a pessoa e não o lugar.
//
// Puro de regra, sem HTTP: quem fala com a rede é o index.mjs.
import { ErroDeConta } from './contas.mjs';
import * as presenca from './presenca.mjs';
import { ler as lerEnquadramento } from './enquadramento.mjs';
import * as tabela from './repositorios/amizades.mjs';
import * as usuarios from './repositorios/usuarios.mjs';

/**
 * Como uma pessoa aparece na tela de amigos: a CONTA, e só ela.
 *
 * Sem cargo, sem nome exibido e sem identificador — os três pertencem ao vínculo com um
 * servidor, e uma amizade não tem servidor. Mostrar o cargo de um servidor aqui seria o
 * mesmo erro do cartão de perfil, que levava "Peixe Souris" do CORNUME para o "teste".
 */
export const verConta = (u) => ({
  id: u.id,
  nome: u.nome ?? u.apelido,
  foto: u.foto ?? null,
  enquadramento: lerEnquadramento(u.enquadramento),
  turbo: !!u.turbo,
  status: presenca.statusDeVerdade(u.status, u.visto_em),
});

/** Somos amigos AGORA? É a pergunta que toda mensagem privada faz antes de sair. */
export const saoAmigos = (db, x, y) => tabela.buscar(db, x, y)?.estado === 'amigos';

/**
 * Manda um pedido de amizade — pelo apelido digitado, ou pelo id de quem já está na tela.
 *
 * Pelo apelido porque é o que a pessoa sabe de cor e o que é global: id é número que
 * ninguém decora, e nome exibido é de um servidor. O apelido é a identidade da conta.
 *
 * Dois casos que não são erro e viram amizade na hora ou recusa clara:
 * - o outro JÁ tinha te mandado um pedido: aceitar é o que qualquer um esperaria de
 *   "adicionar" nesse momento — dois pedidos cruzados nunca poderiam ficar esperando um
 *   ao outro para sempre;
 * - vocês já são amigos: dizer isso é melhor que criar uma segunda linha.
 */
export function pedir(db, eu, { apelido, alvo } = {}) {
  // Dois caminhos para a mesma porta: a tela de amigos manda o APELIDO, que é o que a
  // pessoa digita; o menu de alguém que já está na sua frente manda o id, que é exato.
  // Pelo nome exibido nunca: aquele é de um servidor, e a amizade não é.
  let outro = null;
  if (alvo !== undefined && alvo !== null) {
    outro = usuarios.buscarPorId(db, alvo);
  } else {
    const chave = String(apelido ?? '').trim().toLowerCase();
    if (!chave) throw new ErroDeConta('Escreva o apelido de quem você quer adicionar.');
    outro = usuarios.buscarPorApelidoChave(db, chave);
  }
  // Conta que não existe e conta que existe respondem a mesma coisa: descobrir quem tem
  // conta na Saga tentando apelidos não é uma porta que precise ficar aberta.
  if (!outro) throw new ErroDeConta('Não achei ninguém com esse apelido.', 404);
  if (outro.id === eu.id) throw new ErroDeConta('Você não precisa se adicionar.');

  const ja = tabela.buscar(db, eu.id, outro.id);
  if (ja?.estado === 'amigos') throw new ErroDeConta(`Você e ${outro.apelido} já são amigos.`, 409);
  if (ja?.pedido_de === eu.id) throw new ErroDeConta(`Você já mandou um pedido para ${outro.apelido}.`, 409);
  if (ja) {
    tabela.aceitar(db, eu.id, outro.id, Date.now());
    return { amigo: verConta(outro), estado: 'amigos' };
  }

  tabela.pedir(db, { de: eu.id, para: outro.id, quando: Date.now() });
  return { amigo: verConta(outro), estado: 'pedido' };
}

/**
 * Responde a um pedido. Só quem NÃO pediu pode aceitar — senão bastaria mandar um pedido
 * e aceitá-lo sozinho, que é exatamente a porta que a amizade existe para fechar.
 *
 * Recusar apaga a linha em vez de guardar um "recusado": quem recusou hoje pode aceitar
 * amanhã, e o outro não fica sabendo que foi recusado — ele só volta a poder pedir.
 */
export function responder(db, eu, outroId, aceitar) {
  const linha = tabela.buscar(db, eu.id, outroId);
  if (!linha || linha.estado !== 'pedido') throw new ErroDeConta('Esse pedido não existe mais.', 404);
  if (linha.pedido_de === eu.id) throw new ErroDeConta('Esse pedido é seu: quem responde é o outro.', 403);

  if (aceitar) tabela.aceitar(db, eu.id, outroId, Date.now());
  else tabela.apagar(db, eu.id, outroId);
  return { ok: true, estado: aceitar ? 'amigos' : null };
}

/**
 * Desfaz: cancela o pedido que você mandou, ou desfaz a amizade.
 *
 * A conversa NÃO é apagada. O que foi dito continua lá — apagar a conversa de alguém
 * porque a amizade acabou seria destruir o registro dos dois por decisão de um. O que
 * muda é que ninguém consegue mandar mensagem nova até serem amigos de novo.
 */
export function desfazer(db, eu, outroId) {
  const linha = tabela.buscar(db, eu.id, outroId);
  if (!linha) throw new ErroDeConta('Vocês não são amigos.', 404);
  tabela.apagar(db, eu.id, outroId);
  return { ok: true };
}

/**
 * A tela de amigos inteira, numa busca só: amigos, pedidos que chegaram e pedidos que
 * você mandou. Separados aqui e não na tela, porque "de quem é o pedido" é regra — a
 * tela só desenha o que pode ser respondido e o que só pode ser cancelado.
 */
export function listar(db, eu) {
  const linhas = tabela.minhas(db, eu.id);
  const amigos = [];
  const recebidos = [];
  const enviados = [];
  for (const l of linhas) {
    const pessoa = verConta(l);
    if (l.estado === 'amigos') amigos.push(pessoa);
    else if (l.pedido_de === eu.id) enviados.push({ ...pessoa, desde: l.criada_em });
    else recebidos.push({ ...pessoa, desde: l.criada_em });
  }
  return { amigos, recebidos, enviados };
}
