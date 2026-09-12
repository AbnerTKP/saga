import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  verAmigos, pedirAmizade, responderAmizade, desfazerAmizade,
  type Amizades, type Conta, type Pedido,
} from '../api';
import { COMO_SE_LE as STATUS_SE_LE } from '../presenca';
import { aoDespertar } from '../despertar';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

/**
 * A tela de amigos — a única porta da conversa privada.
 *
 * Adicionar é pelo APELIDO, e não por uma lista de "pessoas que você talvez conheça":
 * o apelido é a identidade da conta, é o que o amigo te passa, e é o mesmo em toda a
 * Saga. Quem decide se aceita é o outro, então o que sai daqui é um pedido, nunca uma
 * amizade feita.
 *
 * As três seções existem porque são três coisas diferentes de fazer: responder um pedido,
 * esperar uma resposta, e falar com quem já é amigo. Misturadas, a pessoa procuraria o
 * botão certo em cada linha.
 */
export function TelaDeAmigos({ onConversar, onMudou }: {
  /** Abrir a conversa com um amigo. Quem cria a conversa, se não existir, é o servidor. */
  onConversar: (pessoaId: number) => void;
  /** Alguma coisa mudou (pedido, aceite, desfeita): a lista do app se atualiza junto. */
  onMudou: () => void;
}) {
  const [tudo, setTudo] = useState<Amizades | null>(null);
  const [erroDaBusca, setErroDaBusca] = useState<string | null>(null);
  const [apelido, setApelido] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // O desfazer arma no próprio botão, como o desistir do xadrez: uma janela a mais seria
  // ruído, e um clique só é fácil demais de errar.
  const [armado, setArmado] = useState<number | null>(null);
  const relogio = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(relogio.current), []);

  const buscar = useCallback(async () => {
    try {
      setTudo(await verAmigos());
      setErroDaBusca(null);
    } catch (e) {
      // Falhar em carregar não é o mesmo que não ter nada: sem ter carregado uma vez, a
      // tela não afirma que você não tem amigo nenhum.
      setErroDaBusca((e as Error).message);
    }
  }, []);

  // De dez em dez segundos, como a lista de pessoas: pedido de amizade não chega a cada
  // segundo, e quem age aqui já vê o resultado na hora pelo `agir`.
  useEffect(() => {
    buscar();
    const id = setInterval(buscar, 10_000);
    const pararDeDespertar = aoDespertar(buscar);
    return () => { clearInterval(id); pararDeDespertar(); };
  }, [buscar]);

  const agir = async (fazer: () => Promise<unknown>, conta?: string) => {
    setOcupado(true);
    setErro(null);
    try {
      await fazer();
      setRecado(conta ?? null);
      await buscar();
      onMudou();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const adicionar = async (e: FormEvent) => {
    e.preventDefault();
    const nome = apelido.trim();
    if (!nome) return;
    setRecado(null);
    await agir(async () => {
      const r = await pedirAmizade({ apelido: nome });
      setApelido('');
      // Pedidos cruzados viram amizade na hora: dizer "pedido enviado" nessa hora seria
      // mentira, e a pessoa ficaria esperando uma resposta que já veio.
      setRecado(r.estado === 'amigos'
        ? `${r.amigo.nome} já tinha te chamado: vocês agora são amigos.`
        : `Pedido enviado para ${r.amigo.nome}.`);
    });
  };

  const armar = (id: number) => {
    setArmado(id);
    window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(() => setArmado(null), 4000);
  };

  const linha = (pessoa: Conta, recadoDela: string, acoes: React.ReactNode) => (
    <div key={pessoa.id} className="linha-de-amigo">
      <Avatar nome={pessoa.nome} foto={pessoa.foto} enquadramento={pessoa.enquadramento?.foto}
        tamanho="big" status={pessoa.status} />
      <span className="quem">
        <span className="strong">{pessoa.nome}</span>
        <span className="muted small">{recadoDela}</span>
      </span>
      <span className="acoes-do-amigo">{acoes}</span>
    </div>
  );

  const amigo = (p: Conta) => linha(
    p,
    STATUS_SE_LE[(p.status ?? 'offline') as keyof typeof STATUS_SE_LE] ?? p.status,
    <>
      <button className="botao-miudo sim" disabled={ocupado} onClick={() => onConversar(p.id)}>
        Mandar mensagem
      </button>
      <button
        className={`botao-miudo ${armado === p.id ? 'armado' : 'nao'}`}
        disabled={ocupado}
        title="Desfazer a amizade: o que já foi dito continua lá, mas ninguém manda mensagem nova"
        onClick={() => (armado === p.id
          ? agir(() => desfazerAmizade(p.id), `Vocês não são mais amigos.`)
          : armar(p.id))}
      >
        {armado === p.id ? 'Desfazer mesmo?' : 'Desfazer'}
      </button>
    </>,
  );

  const recebido = (p: Pedido) => linha(p, 'quer ser seu amigo', (
    <>
      <button className="botao-miudo sim" disabled={ocupado}
        onClick={() => agir(() => responderAmizade(p.id, true), `${p.nome} agora é seu amigo.`)}>
        Aceitar
      </button>
      <button className="botao-miudo nao" disabled={ocupado}
        onClick={() => agir(() => responderAmizade(p.id, false))}>
        Recusar
      </button>
    </>
  ));

  const enviado = (p: Pedido) => linha(p, 'você mandou um pedido', (
    <button className="botao-miudo" disabled={ocupado} onClick={() => agir(() => desfazerAmizade(p.id))}>
      Cancelar
    </button>
  ));

  return (
    <>
      <header className="stage-head">
        <Icon name="pessoas" />
        <span className="strong">Amigos</span>
        {tudo && <span className="muted small">{tudo.amigos.length}</span>}
      </header>

      <div className="stage-body so-chat">
        <div className="tela-amigos">
          <form className="adicionar-amigo" onSubmit={adicionar}>
            <span className="rotulo">Adicionar amigo</span>
            <div className="linha">
              <input
                value={apelido}
                onChange={(e) => { setApelido(e.target.value); setErro(null); }}
                placeholder="Apelido de quem você quer adicionar"
                maxLength={24}
                autoFocus
              />
              <button className="primary" disabled={ocupado || !apelido.trim()}>Enviar pedido</button>
            </div>
            {erro
              ? <div className="error">{erro}</div>
              : <small className="muted">{recado ?? 'Precisa ser o apelido exato. Quem decide se aceita é ele.'}</small>}
          </form>

          {/* Sem ter carregado UMA vez, a tela não desenha seção nenhuma: não ter
              carregado não é não ter — ver o painel do servidor. */}
          {!tudo ? (
            <div className="muted small">
              {erroDaBusca
                ? <>Não consegui carregar seus amigos. <button className="link" onClick={buscar}>Tentar de novo</button></>
                : 'Carregando…'}
            </div>
          ) : (
            <>
              {tudo.recebidos.length > 0 && (
                <div className="grupo-de-cargo">
                  <div className="cabecalho-do-grupo">Pedidos — {tudo.recebidos.length}</div>
                  {tudo.recebidos.map(recebido)}
                </div>
              )}

              {tudo.enviados.length > 0 && (
                <div className="grupo-de-cargo">
                  <div className="cabecalho-do-grupo">Esperando resposta — {tudo.enviados.length}</div>
                  {tudo.enviados.map(enviado)}
                </div>
              )}

              <div className="grupo-de-cargo">
                <div className="cabecalho-do-grupo">Amigos — {tudo.amigos.length}</div>
                {tudo.amigos.length === 0
                  ? <div className="muted small pad">Ninguém ainda. Adicione alguém pelo apelido aqui em cima.</div>
                  : tudo.amigos.map(amigo)}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
