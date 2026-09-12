import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  contasDaSaga, definirBerserk, emitirRecuperacao, urlDoArquivo, ErroDoServidor, type ContaDaSaga,
} from '../api';
import { explicarFalha, pendente } from '../recuperacao';
import { comLimite } from '../limite';
import { Icon } from './Icon';
import { Avatar } from './Avatar';

const hora = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Quanto se espera a ponte do processo principal responder antes de dar a cópia por falha. */
const PRAZO_DE_COPIAR = 3000;

/**
 * O que o dono da Saga decide, como bloco — não como janela.
 *
 * Viveu numa janela própria, escondida no menu de status, e o dono precisou perguntar
 * onde ficava. Hoje mora em "Sua conta", atrás da engrenagem, que é justamente o lugar
 * do que existe ACIMA dos servidores: a conta, o Berserk e isto. Fora das configurações
 * de servidor nenhum, de propósito: dentro do CARDUME, o Berserk pareceria uma distinção
 * do CARDUME, e ele vale em todos.
 */
export function BlocosDaSaga({ meuId }: { meuId: number }) {
  const [contas, setContas] = useState<ContaDaSaga[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  // O código só existe na resposta de quem o gerou — o servidor guarda o hash. Por isso ele
  // vive na memória desta tela e some ao fechar: o caminho de volta é gerar outro.
  const [codigos, setCodigos] = useState<Record<number, { codigo: string; expiraEm: number }>>({});
  const [copias, setCopias] = useState<Record<number, 'copiando' | 'copiado' | 'falhou' | undefined>>({});
  // A conta para a qual o dono está pedindo código, com a senha DELE sendo digitada: o servidor
  // a pede porque sessão aberta não prova quem está no teclado. Uma por vez.
  const [pedindo, setPedindo] = useState<{ id: number; senha: string; erro: string | null } | null>(null);
  // Qual tentativa de copiar é a mais nova, por conta. Resposta de uma tentativa velha — o
  // prazo de um clique anterior vencendo, ou a cópia de um código que já foi trocado por
  // outro — não pode escrever "Copiado" nem "Não consegui" sobre a da tela.
  const tentativas = useRef<Record<number, number>>({});

  useEffect(() => {
    contasDaSaga().then(setContas).catch((e) => setErro((e as Error).message));
  }, []);

  const alternar = async (c: ContaDaSaga) => {
    setErro(null); setOcupado(c.id);
    try {
      const nova = await definirBerserk(c.id, !c.berserk);
      setContas((antes) => antes?.map((x) => (x.id === nova.id ? nova : x)) ?? null);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  };

  const novaTentativa = (id: number) => (tentativas.current[id] = (tentativas.current[id] ?? 0) + 1);

  const gerarCodigo = async (e: FormEvent, c: ContaDaSaga) => {
    e.preventDefault();
    if (!pedindo || pedindo.id !== c.id) return;
    setErro(null); setOcupado(c.id);
    try {
      const r = await emitirRecuperacao(c.id, pedindo.senha);
      // O código mudou: uma cópia do anterior ainda a caminho não diz nada sobre este.
      novaTentativa(c.id);
      setCodigos((m) => ({ ...m, [c.id]: { codigo: r.codigo, expiraEm: r.expiraEm } }));
      setCopias((m) => ({ ...m, [c.id]: undefined }));
      setContas((antes) => antes?.map((x) => (x.id === r.conta.id ? r.conta : x)) ?? null);
      setPedindo(null);
    } catch (err) {
      // Junto do campo, e com a senha apagada para digitar de novo: o erro do alto do bloco
      // fica longe de quem está com o cursor no cartão da conta.
      const motivo = explicarFalha(err instanceof ErroDoServidor ? err.status : 0, (err as Error).message);
      setPedindo((p) => (p && p.id === c.id ? { ...p, senha: '', erro: motivo } : p));
    } finally { setOcupado(null); }
  };

  /**
   * Copia pelo processo principal, e só diz "copiado" depois que ele respondeu.
   *
   * É a ponte do "Copiar tudo" do registro de erros: o nome é do registro, mas ela escreve
   * qualquer texto com o `clipboard` do processo principal, e é o caminho de copiar que o
   * app já usa. O `navigator.clipboard` da janela depende de foco e passa pelo porteiro de
   * permissões do Electron, que só libera mídia, tela, notificação e tela cheia — como ele se
   * comporta ali não foi medido, e permissão negada naquele porteiro já deixou promessa
   * pendurada sem erro nenhum. O prazo faz uma resposta que não vem virar falha, e não um
   * botão esperando para sempre.
   */
  const copiar = async (id: number, codigo: string) => {
    const minha = novaTentativa(id);
    setCopias((m) => ({ ...m, [id]: 'copiando' }));
    let resultado: 'copiado' | 'falhou' = 'copiado';
    try {
      await comLimite(window.desktop.copiarRegistro(codigo), PRAZO_DE_COPIAR, 'sem resposta');
    } catch {
      resultado = 'falhou';
    }
    if (tentativas.current[id] === minha) setCopias((m) => ({ ...m, [id]: resultado }));
  };

  const filtro = busca.trim().toLowerCase();
  const lista = (contas ?? []).filter((c) => !filtro || c.apelido.toLowerCase().includes(filtro));
  const comBerserk = (contas ?? []).filter((c) => c.berserk).length;
  const agora = Date.now();

  return (
    <>
      {erro && <div className="error">{erro}</div>}

      <section className="painel-bloco">
        <h3>Berserk e senha</h3>
        <p className="muted small">
        O Berserk vale em toda a Saga, não num servidor: quem tem, tem em todo canto. A senha
        também é da conta, e as contas não têm e-mail — quem esqueceu a dele pede a você um
        código para escolher outra.
        {contas && ` Com Berserk: ${comBerserk} de ${contas.length} ${contas.length === 1 ? 'conta' : 'contas'}.`}
        </p>

        {contas === null && <p className="muted small">Carregando…</p>}
        {contas && contas.length > 6 && (
        <input
          placeholder="Procurar apelido"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ marginTop: 10, width: '100%' }}
        />
        )}

        <div className="contas-da-saga">
        {lista.map((c) => {
          const gerado = codigos[c.id];
          // "Pendente" é só para o código que não está na tela: o que está já diz até quando vale.
          const pendenteAte = !gerado && pendente(c.recuperacaoAte, agora) ? c.recuperacaoAte as number : null;
          const jaTemCodigo = !!gerado || pendenteAte !== null;
          const pedido = pedindo?.id === c.id ? pedindo : null;
          // A PRÓPRIA conta não tem código: quem sabe a senha troca em "Sua conta", e o código
          // derrubaria todas as sessões do único dono da Saga. O servidor também recusa.
          const souEu = c.id === meuId;
          return (
          <div key={c.id} className={`conta-da-saga ${c.berserk ? 'berserk' : ''} ${gerado || pedido ? 'com-codigo-de-senha' : ''}`}>
            <Avatar nome={c.apelido} foto={c.foto} tamanho="big" />
            <div className="conta-quem">
              <div className="strong">
                {c.apelido}
                {c.id === meuId && <span className="muted small"> · você</span>}
                {c.dono && <span className="selo-berserk" style={{ marginLeft: 6 }}>DONO</span>}
              </div>
              <div className="muted small">
                {c.servidores} {c.servidores === 1 ? 'servidor' : 'servidores'}
                {pendenteAte !== null && ` · código pendente até ${hora(pendenteAte)}`}
              </div>
            </div>
            {!souEu && (
              <button
                className="conta-botao-codigo"
                disabled={ocupado === c.id || !!pedido}
                title={jaTemCodigo
                  ? `Gerar outro código de senha para ${c.apelido}. O anterior deixa de valer.`
                  : `Gerar um código para ${c.apelido} escolher outra senha`}
                onClick={() => setPedindo({ id: c.id, senha: '', erro: null })}
              >
                <Icon name="cadeado" size={14} /> {jaTemCodigo ? 'novo código' : 'código de senha'}
              </button>
            )}
            <button
              className={`conta-botao-berserk ${c.berserk ? 'berserk-on' : ''}`}
              disabled={ocupado === c.id}
              title={c.berserk ? 'Tirar o Berserk' : 'Dar Berserk'}
              onClick={() => alternar(c)}
            >
              <Icon name="berserk" size={14} /> {c.berserk ? 'tirar' : 'dar'}
            </button>

            {pedido ? (
              <form className="codigo-de-senha" onSubmit={(e) => gerarCodigo(e, c)}>
                <p className="muted small">
                  Para gerar o código de <b>{c.apelido}</b>, confirme a <b>sua</b> senha: com ele
                  se entra na conta de {c.apelido}.
                  {jaTemCodigo && ' O código anterior deixa de valer.'}
                </p>
                <div className="linha-campo">
                  <input
                    type="password"
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    autoFocus
                    value={pedido.senha}
                    onChange={(e) => { const senha = e.target.value; setPedindo((p) => (p ? { ...p, senha } : p)); }}
                  />
                  <button type="submit" disabled={ocupado === c.id || !pedido.senha}>
                    {ocupado === c.id ? 'Gerando…' : 'Gerar código'}
                  </button>
                  <button type="button" disabled={ocupado === c.id} onClick={() => setPedindo(null)}>Cancelar</button>
                </div>
                {pedido.erro && <div className="error">{pedido.erro}</div>}
              </form>
            ) : gerado && (
              <div className="codigo-de-senha">
                <div className="codigo-de-senha-linha">
                  <span className="codigo-de-senha-valor">{gerado.codigo}</span>
                  <button type="button" disabled={copias[c.id] === 'copiando'} onClick={() => copiar(c.id, gerado.codigo)}>
                    {copias[c.id] === 'copiado' ? 'Copiado' : copias[c.id] === 'copiando' ? 'Copiando…' : 'Copiar'}
                  </button>
                </div>
                <p className="muted small">
                  Mande para <b>{c.apelido}</b> por fora — WhatsApp, por exemplo. Vale
                  até {hora(gerado.expiraEm)} e serve uma vez só. Ele não aparece de novo:
                  gerar outro invalida este.
                </p>
                {copias[c.id] === 'falhou' && (
                  <p className="codigo-de-senha-falha">Não consegui copiar. Selecione o código e copie à mão.</p>
                )}
              </div>
            )}
          </div>
          );
        })}
        {contas && lista.length === 0 && <p className="muted small">Ninguém com esse apelido.</p>}
        </div>
      </section>

      <section className="painel-bloco">
        <h3>Como isto se separa do servidor</h3>
        <p className="muted small">
        Cada servidor tem o cargo mais alto dele — que pode se chamar o que o pessoal
        quiser — e esse cargo manda naquele servidor: salas, cargos, moderação. Isto
        aqui é o que vale acima deles. Uma coisa não dá a outra.
        </p>
      </section>
    </>
  );
}
