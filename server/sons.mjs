// Soundboard: quem sobe é o cargo mais alto do servidor; tocar é de todo mundo.
import { ErroDeConta } from './contas.mjs';
import { podeMexerNosSons } from './permissoes.mjs';
import * as tabela from './repositorios/sons.mjs';
import * as tabelaDeCargos from './repositorios/cargos.mjs';

const NOME_VALIDO = /^.{1,40}$/u;

export const listarSons = (db, servidorId) => tabela.listar(db, servidorId);

export const buscarSom = (db, servidorId, id) => tabela.buscar(db, servidorId, id);

/** Os níveis dos cargos daquele servidor: é com o TETO deles que a regra compara. */
const cargosDe = (db, servidorId) => tabelaDeCargos.niveis(db, servidorId);

export function adicionarSom(db, servidorId, quem, { nome, arquivo }) {
  const r = podeMexerNosSons(quem, cargosDe(db, servidorId));
  if (!r.pode) throw new ErroDeConta(`Não dá para subir sons: ${r.motivo}.`, 403);
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) throw new ErroDeConta('Dê um nome ao som, de 1 a 40 caracteres.');
  if (tabela.temONome(db, servidorId, limpo)) {
    throw new ErroDeConta('Já existe um som com esse nome.', 409);
  }
  const id = tabela.inserir(db, {
    servidorId, nome: limpo, arquivo, enviadoPor: quem.id, criadoEm: Date.now(),
  });
  return buscarSom(db, servidorId, id);
}

export function removerSom(db, servidorId, quem, id) {
  const r = podeMexerNosSons(quem, cargosDe(db, servidorId));
  if (!r.pode) throw new ErroDeConta(`Não dá para apagar sons: ${r.motivo}.`, 403);
  const som = buscarSom(db, servidorId, id);
  if (!som) throw new ErroDeConta('Esse som não existe.', 404);
  tabela.apagar(db, servidorId, som.id);
  // O arquivo em si fica: outro som pode apontar para o mesmo conteúdo, já que o nome
  // do arquivo é o hash. Apagar exigiria contar referências, e o ganho seria alguns KB.
  return { ok: true };
}
