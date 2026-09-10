import logo from '../marca.png';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Nome } from './Nome';
import type { Membro } from '../api';

/**
 * A Saga sem servidor nenhum.
 *
 * Toda conta nova começa aqui. Antes ela caía direto no servidor de casa — ele era o
 * único que existia, e a senha do grupo fazia as vezes de porta —, e isso deixou de ser
 * verdade quando os servidores voltaram: entrar num servidor é uma decisão de quem chega
 * e de quem convida, não um efeito de ter criado uma conta.
 *
 * A tela também é o que aparece para quem foi banido de todos os servidores em que
 * estava: a conta continua entrando, e é aqui que ela lê o motivo em vez de bater numa
 * tela que não explica nada.
 */
export function TelaInicial({ eu, impedimento, onEntrar, onCriar, onConta, onRegistro, onSair }: {
  eu: Membro;
  /** Por que você está de fora, quando é o caso: banimento, castigo. */
  impedimento?: string | null;
  onEntrar: () => void;
  onCriar: () => void;
  onConta: () => void;
  onRegistro: () => void;
  onSair: () => void;
}) {
  return (
    <div className="tela-inicial">
      <div className="inicial-meio">
        <img src={logo} alt="" width={76} height={76} className="inicial-marca" />
        <h1>Sua Saga começa aqui</h1>
        {impedimento
          ? <p className="inicial-impedimento">{impedimento}</p>
          : (
            <p className="muted">
              Você ainda não está em nenhum servidor. Peça o código de convite a quem já
              está dentro — ou crie o seu, com uma sala de voz e uma de texto para começar.
            </p>
          )}

        <div className="inicial-acoes">
          <button className="primary" onClick={onEntrar}>Entrar com um convite</button>
          <button className="secundario" onClick={onCriar}>Criar um servidor</button>
        </div>
      </div>

      {/* Você continua sendo você mesmo sem servidor nenhum: a foto, o nome e o caminho
          de sair moram na conta, que é o que existe acima dos servidores. */}
      <div className="inicial-conta">
        <Avatar nome={eu.nome} foto={eu.foto} enquadramento={eu.enquadramento?.foto} tamanho="big" />
        <span className="uname">
          <span className="strong"><Nome membro={eu} /></span>
          <span className="muted small">@{eu.apelido}</span>
        </span>
        <button className="icon" onClick={onConta} title="Sua conta: perfil, microfone e câmera">
          <Icon name="gear" />
        </button>
        <button className="link" onClick={onRegistro}>ver o registro</button>
        <button className="link" onClick={onSair}>sair da conta</button>
      </div>
    </div>
  );
}
