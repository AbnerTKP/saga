import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { confirmarEmail, desistirDoEmail, pedirCodigoDoEmail, ErroDoServidor, type EstadoDoEmail } from '../api';
import { avisoDoCodigo, codigoCompleto, codigoDepoisDeColar, explicarFalha, formatarCodigo } from '../recuperacao';
import { falhaDoLadoDeCa, pareceEmail } from '../email';

type Falha = { mensagem: string; doLadoDeCa: boolean };

const falhaDe = (e: unknown): Falha => {
  const status = e instanceof ErroDoServidor ? e.status : 0;
  const mensagem = (e as Error).message;
  return { mensagem: explicarFalha(status, mensagem), doLadoDeCa: falhaDoLadoDeCa(status, mensagem) };
};

/**
 * "Falta o seu e-mail": o pedido de quem entrou numa conta sem e-mail confirmado.
 *
 * Mora no MESMO cartão da tela de entrar, e não numa tela própria nem numa caixa por cima
 * do app — escolha do dono entre as três, desenhadas com o `styles.css` de verdade em
 * 17/09/2026. É a continuação do login: o app só aparece depois, e nada dele se desenha pela
 * metade atrás de um pedido.
 *
 * TRAVA, por decisão do dono: sem e-mail confirmado não se entra. As duas saídas são "sair
 * da conta" — para quem entrou na conta errada — e "entrar sem e-mail por agora", que só
 * aparece quando a falha foi do lado de cá (`falhaDoLadoDeCa`): o Resend fora, a conta dele
 * em modo de teste, o teto de envios estourado. Travar alguém por um defeito nosso seria
 * deixá-lo do lado de fora sem nada que ele possa fazer.
 *
 * Dois passos: o endereço e o código que chegou nele. Quem já pediu — no cadastro, ou numa
 * abertura anterior — começa pelo código.
 */
export function ConfirmarEmail({ emailPendente, erroInicial, onConfirmado, onEntrarSemEmail, onSair, onRegistro }: {
  emailPendente: string | null;
  /** O motivo de o código do cadastro não ter saído. A conta existe; o e-mail, não. */
  erroInicial?: string | null;
  onConfirmado: (estado: EstadoDoEmail) => void;
  onEntrarSemEmail: () => void;
  onSair: () => void;
  onRegistro: () => void;
}) {
  const [passo, setPasso] = useState<'email' | 'codigo'>(emailPendente ? 'codigo' : 'email');
  const [email, setEmail] = useState(emailPendente ?? '');
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // O erro do cadastro é sempre do lado de cá: o endereço já tinha passado pela régua dele.
  const [falha, setFalha] = useState<Falha | null>(erroInicial ? { mensagem: erroInicial, doLadoDeCa: true } : null);
  const [mandouOutro, setMandouOutro] = useState(false);
  const cartao = useRef<HTMLFormElement>(null);

  // Como na tela de entrar: o erro entra acima do botão e o cartão rola até o fim, senão
  // numa janela baixa o botão e a resposta somem de vista juntos.
  useEffect(() => {
    const el = cartao.current;
    if (falha && el) el.scrollTop = el.scrollHeight;
  }, [falha]);

  const tentar = async (acao: () => Promise<void>) => {
    setFalha(null);
    setMandouOutro(false);
    setOcupado(true);
    try { await acao(); } catch (e) { setFalha(falhaDe(e)); } finally { setOcupado(false); }
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (passo === 'email') {
      tentar(async () => {
        const r = await pedirCodigoDoEmail(email.trim());
        setEmail(r.emailPendente);
        setCodigo('');
        setPasso('codigo');
      });
    } else {
      tentar(async () => { onConfirmado(await confirmarEmail(codigo)); });
    }
  };

  const mandarOutro = () => tentar(async () => {
    await pedirCodigoDoEmail(email);
    setCodigo('');
    setMandouOutro(true);
  });

  // Desiste no servidor também: sem isso, a próxima abertura voltaria ao código do endereço
  // errado. Falhar em desistir não prende ninguém — pedir para outro endereço substitui o
  // pendente de qualquer jeito —, então a tela volta ao endereço sem esperar a resposta.
  const trocarEmail = () => {
    desistirDoEmail().catch(() => undefined);
    setFalha(null);
    setMandouOutro(false);
    setCodigo('');
    setPasso('email');
  };

  // Mesma arrumação do campo de código da recuperação: o `maxLength` apararia o colado antes
  // de o onChange vê-lo, e a mensagem inteira do e-mail colada viraria um código errado.
  const colarCodigo = (e: ClipboardEvent<HTMLInputElement>) => {
    const campo = e.currentTarget;
    e.preventDefault();
    setCodigo(codigoDepoisDeColar(
      campo.value, campo.selectionStart ?? campo.value.length, campo.selectionEnd ?? campo.value.length,
      e.clipboardData.getData('text'),
    ));
  };

  const pronto = passo === 'email' ? pareceEmail(email) : codigoCompleto(codigo);
  const rotulo = passo === 'email'
    ? (ocupado ? 'Mandando…' : 'Mandar código')
    : (ocupado ? 'Confirmando…' : 'Confirmar e entrar');

  return (
    <div className="connect">
      <form ref={cartao} className="connect-card" onSubmit={enviar}>
        <h1>Saga</h1>
        <p className="muted">Voz, vídeo e tela entre amigos.</p>

        {passo === 'email' ? (
          <>
            <div className="connect-recuperar">
              <h2>Falta o seu e-mail</h2>
              <p className="muted">
                A Saga passa a guardar um e-mail por conta: é por ele que dá para recuperar a
                senha sozinho, sem depender de ninguém. Pede-se uma vez.
              </p>
            </div>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                spellCheck={false}
                maxLength={254}
                required
                autoFocus
              />
            </label>
          </>
        ) : (
          <>
            <div className="connect-recuperar">
              <h2>Confirme o e-mail</h2>
              <p className="muted">
                Mandei um código para <b>{email}</b>. Ele vale uma hora. Não chegou? Olhe o spam.
              </p>
            </div>
            <label>
              Código
              <input
                className="connect-codigo"
                value={codigo}
                onChange={(e) => setCodigo(formatarCodigo(e.target.value))}
                onPaste={colarCodigo}
                placeholder="XXXX-XXXX"
                maxLength={9}
                autoComplete="one-time-code"
                spellCheck={false}
                required
                autoFocus
              />
              {avisoDoCodigo(codigo, 'email') && (
                <small className="muted connect-aviso-codigo">{avisoDoCodigo(codigo, 'email')}</small>
              )}
            </label>
          </>
        )}

        {falha && <div className="error">{falha.mensagem}</div>}
        {falha?.doLadoDeCa && (
          <div className="connect-adiar">
            <button type="button" className="link" onClick={onEntrarSemEmail}>entrar sem e-mail por agora</button>
          </div>
        )}
        {mandouOutro && <div className="aviso-ok">Mandei outro código. O anterior deixou de valer.</div>}

        <button className="primary" disabled={ocupado || !pronto}>{rotulo}</button>

        <div className="connect-rodape">
          {passo === 'email' ? (
            <>
              <button type="button" className="link" onClick={onSair}>sair da conta</button>
              <button type="button" className="link" onClick={onRegistro}>deu erro? ver o registro</button>
            </>
          ) : (
            <>
              <button type="button" className="link" disabled={ocupado} onClick={mandarOutro}>mandar outro código</button>
              <button type="button" className="link" disabled={ocupado} onClick={trocarEmail}>trocar o e-mail</button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
