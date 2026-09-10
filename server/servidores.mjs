// Vários servidores. O banco já era assim desde o começo — cargo e banimento pertencem ao
// vínculo entre pessoa e servidor, não à pessoa — então aqui é só criar, convidar e entrar.
import { randomBytes } from 'node:crypto';
import { ErroDeConta } from './contas.mjs';
import { garantirCargos } from './banco.mjs';
import { temPermissao } from './permissoes.mjs';
import * as tabela from './repositorios/servidores.mjs';
import * as tabelaDeConvites from './repositorios/convites.mjs';
import * as tabelaDeMembros from './repositorios/membros.mjs';
import * as tabelaDeCargos from './repositorios/cargos.mjs';
import * as tabelaDeSalas from './repositorios/salas.mjs';

const NOME_VALIDO = /^[^\r\n]{2,40}$/;
const DURACAO_DO_CONVITE = 7 * 24 * 60 * 60 * 1000;   // uma semana

const paraFora = (s) => s && ({ id: s.id, nome: s.nome, foto: s.foto ?? null, banner: s.banner ?? null });

/** Os servidores de que a pessoa faz parte, sem os que a baniram. */
export const meusServidores = (db, usuarioId) => tabela.doUsuario(db, usuarioId).map(paraFora);

export const buscarServidor = (db, id) => paraFora(tabela.buscar(db, id));

export function criarServidor(db, usuario, { nome }) {
  const limpo = String(nome ?? '').trim();
  if (!NOME_VALIDO.test(limpo)) {
    throw new ErroDeConta('O nome do servidor precisa ter de 2 a 40 caracteres, numa linha só.');
  }

  const servidorId = tabela.inserir(db, { nome: limpo, criadoEm: Date.now(), criadoPor: usuario.id });

  garantirCargos(db, servidorId);
  // Um servidor sem sala nenhuma abriria numa tela vazia; quem criou não saberia o que fazer.
  tabelaDeSalas.inserir(db, { servidorId, nome: 'Geral', tipo: 'voz', ordem: 0 });
  tabelaDeSalas.inserir(db, { servidorId, nome: 'Avisos', tipo: 'texto', ordem: 1 });

  // Quem cria entra com o cargo mais alto que existe. O poder não vem daí — vem de
  // `criado_por` —, mas a pessoa precisa de um cargo como qualquer outra.
  const oMaisAlto = tabelaDeCargos.oMaisAlto(db, servidorId);
  tabelaDeMembros.inserir(db, {
    servidorId, usuarioId: usuario.id, cargoId: oMaisAlto?.id ?? null,
    nivel: oMaisAlto?.nivel ?? 10, entrouEm: Date.now(),
  });

  return buscarServidor(db, servidorId);
}

// Sem letras que se confundem lidas em voz alta ou copiadas à mão: O e 0, I e 1.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const gerarCodigo = () =>
  [...randomBytes(8)].map((b) => ALFABETO[b % ALFABETO.length]).join('');

export function criarConvite(db, servidorId, quem, { maxUsos } = {}) {
  if (!temPermissao(quem?.cargo, 'gerirServidor')) {
    throw new ErroDeConta('Seu cargo não permite convidar.', 403);
  }
  const codigo = gerarCodigo();
  tabelaDeConvites.inserir(db, {
    codigo, servidorId, criadoPor: quem.id, criadoEm: Date.now(),
    expiraEm: Date.now() + DURACAO_DO_CONVITE,
    maxUsos: maxUsos ? Math.max(1, Number(maxUsos)) : null,
  });
  return { codigo, expiraEm: Date.now() + DURACAO_DO_CONVITE, maxUsos: maxUsos ?? null };
}

export const listarConvites = (db, servidorId) =>
  tabelaDeConvites.doServidor(db, servidorId)
    .map((c) => ({ codigo: c.codigo, criadoEm: c.criado_em, expiraEm: c.expira_em, usos: c.usos, maxUsos: c.max_usos }));

export function usarConvite(db, usuario, codigo) {
  const limpo = String(codigo ?? '').trim().toUpperCase();
  const convite = tabelaDeConvites.buscar(db, limpo);
  // A mesma mensagem para inexistente, vencido e esgotado: dizer qual é entregaria
  // quais códigos existem a quem estiver tentando adivinhar.
  const recusa = () => { throw new ErroDeConta('Convite inválido ou vencido.', 404); };

  if (!convite) recusa();
  if (convite.expira_em && convite.expira_em < Date.now()) recusa();
  if (convite.max_usos && convite.usos >= convite.max_usos) recusa();

  const jaEsta = tabelaDeMembros.situacao(db, convite.servidor_id, usuario.id);
  if (jaEsta?.banido_em) throw new ErroDeConta('Você foi banido deste servidor.', 403);
  if (jaEsta) return buscarServidor(db, convite.servidor_id);

  const maisBaixo = tabelaDeCargos.oMaisBaixo(db, convite.servidor_id);
  tabelaDeMembros.inserir(db, {
    servidorId: convite.servidor_id, usuarioId: usuario.id, cargoId: maisBaixo?.id ?? null,
    nivel: maisBaixo?.nivel ?? 10, entrouEm: Date.now(),
  });
  tabelaDeConvites.contarUso(db, limpo);

  return buscarServidor(db, convite.servidor_id);
}

export function sairDoServidor(db, servidorId, usuario) {
  if (!tabelaDeMembros.situacao(db, servidorId, usuario.id)) {
    throw new ErroDeConta('Você não faz parte deste servidor.', 404);
  }
  // Quem criou o servidor saindo deixaria ele sem ninguém capaz de administrá-lo, e sem
  // jeito de voltar. Mandar não é mais um cargo que se passe adiante: é ter criado.
  if (tabela.quemCriou(db, servidorId) === usuario.id) {
    throw new ErroDeConta('Quem criou o servidor não pode sair dele.', 409);
  }

  tabelaDeMembros.apagar(db, servidorId, usuario.id);
  return { ok: true };
}
