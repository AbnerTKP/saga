import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import {
  cadastrar, entrar, esqueciASenha, guardarToken, recuperarSenha, servidorMandaEmail, ErroDoServidor, type Sessao,
} from '../api';
import { avisoDoCodigo, codigoCompleto, codigoDepoisDeColar, explicarFalha, formatarCodigo } from '../recuperacao';
import { pareceEmail } from '../email';

/**
 * 'recuperar' é o "Esqueci a senha". Com um código se escolhe uma senha nova e já se entra.
 */
type Modo = 'entrar' | 'criar' | 'recuperar';

/**
 * De onde vem o código de quem esqueceu a senha.
 *
 * - 'pedir': o primeiro passo pelo e-mail — apelido ou e-mail, e "Mandar código".
 * - 'email': o código que chegou no e-mail, e a senha nova.
 * - 'dono': o código que o dono da Saga gerou e mandou por fora. É o caminho de quem não tem
 *   e-mail, e o único num servidor que não manda e-mail — onde a tela é a de antes.
 */
type Recuperacao = 'pedir' | 'email' | 'dono';

export function ConnectScreen({ apelidoInicial, onPronto, onRegistro }: {
  apelidoInicial: string;
  onPronto: (s: Sessao) => void;
  onRegistro: () => void;
}) {
  const [modo, setModo] = useState<Modo>(apelidoInicial ? 'entrar' : 'criar');
  const [recuperacao, setRecuperacao] = useState<Recuperacao>('dono');
  const [apelido, setApelido] = useState(apelidoInicial);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaRepetida, setSenhaRepetida] = useState('');
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Se este servidor manda e-mail — perguntado uma vez, ao abrir. Até a resposta chegar vale
   * `false`, a tela de antes do e-mail: é a que funciona com qualquer servidor, e o campo que
   * aparece um instante depois é melhor do que um campo obrigatório que o servidor ignora.
   */
  const [mandaEmail, setMandaEmail] = useState(false);
  const campoApelido = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const cartao = useRef<HTMLFormElement>(null);

  const criando = modo === 'criar';
  const recuperando = modo === 'recuperar';
  const pedindoCodigo = recuperando && recuperacao === 'pedir';
  const peloEmail = recuperando && recuperacao === 'email';
  const peloDono = recuperando && recuperacao === 'dono';

  useEffect(() => {
    let vivo = true;
    servidorMandaEmail().then((sim) => { if (vivo) setMandaEmail(sim); });
    return () => { vivo = false; };
  }, []);

  // O erro entra ACIMA do botão e o empurra para baixo: numa janela baixa, quem acabou de
  // clicar perdia o botão de vista junto com a resposta. O cartão rola até o FIM, e não só
  // até o botão: `scrollIntoView({ block: 'nearest' })` parava com o botão encostado na
  // borda de baixo, sem o respiro do cartão e com o "ver o registro" escondido — medido a
  // 900x560, base do botão em 535 e cartão até 536. Cartão que cabe inteiro não rola.
  useEffect(() => {
    const el = cartao.current;
    if (erro && el) el.scrollTop = el.scrollHeight;
  }, [erro]);

  // Quem chega pelo "Esqueci a senha" já digitou o apelido: o que falta é o código — ou, pelo
  // e-mail, o botão de mandar, que já está logo abaixo. A dep é o PASSO, nunca o apelido —
  // com ele, cada letra digitada no apelido jogaria o cursor para o campo do código.
  useEffect(() => {
    if (!recuperando) return;
    if (pedindoCodigo) { campoApelido.current?.focus(); return; }
    (peloEmail || apelido.trim() ? campoCodigo : campoApelido).current?.focus();
  }, [modo, recuperacao]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      if (pedindoCodigo) {
        // A resposta é a mesma para toda conta, então não há o que ler dela: segue-se para o
        // código de qualquer jeito, e a frase de lá diz "se essa conta tiver e-mail".
        await esqueciASenha(apelido.trim());
        setCodigo('');
        setRecuperacao('email');
        return;
      }
      const sessao = recuperando
        ? await recuperarSenha({ apelido, codigo, senha, senhaRepetida })
        : criando
          ? await cadastrar({ apelido, senha, senhaRepetida, ...(mandaEmail ? { email: email.trim() } : {}) })
          : await entrar({ apelido, senha });
      guardarToken(sessao.token);
      onPronto(sessao);
    } catch (e) {
      const mensagem = (e as Error).message;
      // Só a recuperação pode cair num servidor que ainda não a conhece.
      setErro(recuperando ? explicarFalha(e instanceof ErroDoServidor ? e.status : 0, mensagem) : mensagem);
    } finally {
      setOcupado(false);
    }
  };

  // A senha de entrar não pode reaparecer como "senha nova", nem um código pela metade ficar
  // esperando noutra tela. O apelido fica: quem clica em "Esqueci a senha" já o digitou.
  const trocarModo = (novo: Modo) => {
    setModo(novo);
    // Pelo e-mail quando o servidor manda: é o caminho que não depende de ninguém acordado.
    setRecuperacao(mandaEmail ? 'pedir' : 'dono');
    setErro(null);
    setSenha('');
    setSenhaRepetida('');
    setCodigo('');
  };

  // Entre os caminhos da recuperação, a mesma limpeza: um código pela metade do e-mail não
  // pode ficar esperando no campo do código do dono.
  const trocarRecuperacao = (nova: Recuperacao) => {
    setRecuperacao(nova);
    setErro(null);
    setSenha('');
    setSenhaRepetida('');
    setCodigo('');
  };

  // Colar passa pela mesma arrumação, mas antes de o navegador cortar: o `maxLength` apara o
  // texto colado antes de o onChange vê-lo, e um espaço na frente do código copiado de uma
  // conversa comeria a última letra — com o botão apagado e sem dizer por quê. Medido no
  // Electron deste projeto, inserindo o texto de uma vez: " K7QM-2XPA" num campo de 9 ficou
  // " K7QM-2XP". E o que se cola é quase sempre a mensagem inteira, ou um código novo por
  // cima do velho: a conta de o que fica mora em `codigoDepoisDeColar`, testada.
  const colarCodigo = (e: ClipboardEvent<HTMLInputElement>) => {
    const campo = e.currentTarget;
    const inicio = campo.selectionStart ?? campo.value.length;
    const fim = campo.selectionEnd ?? campo.value.length;
    e.preventDefault();
    setCodigo(codigoDepoisDeColar(campo.value, inicio, fim, e.clipboardData.getData('text')));
  };

  // Recuperando, o botão só acende com tudo preenchido, como em "Sua conta": com o código
  // completo e as senhas vazias, o clique não mandava nada e deixava o aviso por conta do
  // balão nativo do navegador. Criando com e-mail, o mesmo vale para o endereço: o botão
  // apagado diz "falta" antes de o servidor dizer "isso não é um e-mail".
  const faltaAlgo = pedindoCodigo
    ? !apelido.trim()
    : recuperando
      ? (!codigoCompleto(codigo) || !senha || !senhaRepetida)
      : criando && mandaEmail && !pareceEmail(email);
  const aviso = recuperando && !pedindoCodigo ? avisoDoCodigo(codigo, peloEmail ? 'email' : 'dono') : null;

  const rotulo = pedindoCodigo
    ? (ocupado ? 'Mandando…' : 'Mandar código')
    : recuperando
      ? (ocupado ? 'Trocando…' : 'Trocar e entrar')
      : criando
        ? (ocupado ? 'Criando…' : 'Criar conta')
        : (ocupado ? 'Entrando…' : 'Entrar');

  return (
    <div className="connect">
      <form ref={cartao} className="connect-card" onSubmit={enviar}>
        <h1>Saga</h1>
        <p className="muted">Voz, vídeo e tela entre amigos.</p>

        {/* Recuperando, as abas continuam — são o caminho de volta —, mas nenhuma acende:
            isto não é entrar nem criar conta. Por serem o caminho de volta, não há um link
            "voltar para entrar": ele repetia a aba Entrar e empurrava o botão para fora de
            uma janela de 700 px, numa tela que não rolava. */}
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={modo === 'entrar'}
            className={modo === 'entrar' ? 'active' : ''} onClick={() => trocarModo('entrar')}>
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={criando}
            className={criando ? 'active' : ''} onClick={() => trocarModo('criar')}>
            Criar conta
          </button>
        </div>

        {recuperando && (
          <div className="connect-recuperar">
            <h2>Recuperar a senha</h2>
            <p className="muted">
              {pedindoCodigo && 'Mando um código para o e-mail da conta. Ele vale uma hora e serve uma vez só.'}
              {/* Não diz PARA ONDE mandou: a resposta é a mesma para toda conta, e dizer
                  contaria a quem digitou o apelido de outro que ela existe e tem e-mail. */}
              {peloEmail && 'Se essa conta tiver e-mail, o código foi para lá. Ele vale uma hora e serve uma vez só. Não chegou? Olhe o spam.'}
              {peloDono && 'Peça um código ao dono da Saga. Ele vale uma hora e serve uma vez só.'}
            </p>
          </div>
        )}

        {/* Pelo e-mail, o apelido foi digitado no passo anterior e continua valendo por trás:
            pedi-lo de novo seria perguntar duas vezes a mesma coisa. */}
        {!peloEmail && (
          <label>
            {pedindoCodigo ? 'Apelido ou e-mail' : 'Apelido'}
            <input
              ref={campoApelido}
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              autoComplete="username"
              maxLength={pedindoCodigo ? 254 : 24}
              required
              autoFocus
            />
            {criando && <small className="muted">De 3 a 24 caracteres, sem espaços. Não dá para mudar depois — mas o nome que os outros veem, sim.</small>}
          </label>
        )}

        {criando && mandaEmail && (
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
            />
            <small className="muted">Serve para recuperar a senha. Chega um código para confirmar.</small>
          </label>
        )}

        {recuperando && !pedindoCodigo && (
          <label>
            Código
            <input
              ref={campoCodigo}
              className="connect-codigo"
              value={codigo}
              onChange={(e) => setCodigo(formatarCodigo(e.target.value))}
              onPaste={colarCodigo}
              placeholder="XXXX-XXXX"
              maxLength={9}
              autoComplete="one-time-code"
              spellCheck={false}
              required
            />
            {aviso && <small className="muted connect-aviso-codigo">{aviso}</small>}
          </label>
        )}

        {!pedindoCodigo && (
          <label>
            {recuperando ? 'Senha nova' : 'Senha'}
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              required
            />
          </label>
        )}

        {modo === 'entrar' && (
          <div className="connect-esqueci">
            <button type="button" className="link" onClick={() => trocarModo('recuperar')}>Esqueci a senha</button>
          </div>
        )}

        {(criando || (recuperando && !pedindoCodigo)) && (
          <label>
            {recuperando ? 'Repita a senha nova' : 'Repita a senha'}
            <input
              type="password"
              value={senhaRepetida}
              onChange={(e) => setSenhaRepetida(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
        )}

        {erro && <div className="error">{erro}</div>}

        <button className="primary" disabled={ocupado || faltaAlgo}>
          {rotulo}
        </button>

        {/* Os dois caminhos se alcançam um ao outro: quem não tem e-mail vai ao código do dono,
            e quem pediu pelo e-mail pode pedir de novo. Num servidor sem e-mail, nenhum aparece.
            Num bloco só com o "ver o registro": como itens soltos do cartão, cada link ganhava o
            vão inteiro do grid e o pé virava uma escada — visto na Saga escondida, a 1200x760. */}
        <div className="connect-links">
          {mandaEmail && pedindoCodigo && (
            <button type="button" className="link" onClick={() => trocarRecuperacao('dono')}>
              sem e-mail na conta? peça o código ao dono
            </button>
          )}
          {mandaEmail && (peloEmail || peloDono) && (
            <button type="button" className="link" onClick={() => trocarRecuperacao('pedir')}>
              {peloEmail ? 'não chegou? pedir outro código' : 'receber o código por e-mail'}
            </button>
          )}
          <button type="button" className="link" onClick={onRegistro}>deu erro? ver o registro</button>
        </div>
      </form>
    </div>
  );
}
