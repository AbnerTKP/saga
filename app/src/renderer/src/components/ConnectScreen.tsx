import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { cadastrar, entrar, guardarToken, recuperarSenha, ErroDoServidor, type Sessao } from '../api';
import { avisoDoCodigo, codigoCompleto, codigoDepoisDeColar, explicarFalha, formatarCodigo } from '../recuperacao';

/**
 * 'recuperar' é o "Esqueci a senha": as contas não têm e-mail, então quem atesta que é a
 * pessoa é o dono da Saga, que gera um código e manda por fora. Com ele se escolhe uma
 * senha nova e já se entra.
 */
type Modo = 'entrar' | 'criar' | 'recuperar';

export function ConnectScreen({ apelidoInicial, onPronto, onRegistro }: {
  apelidoInicial: string;
  onPronto: (s: Sessao) => void;
  onRegistro: () => void;
}) {
  const [modo, setModo] = useState<Modo>(apelidoInicial ? 'entrar' : 'criar');
  const [apelido, setApelido] = useState(apelidoInicial);
  const [senha, setSenha] = useState('');
  const [senhaRepetida, setSenhaRepetida] = useState('');
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoApelido = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const cartao = useRef<HTMLFormElement>(null);

  const criando = modo === 'criar';
  const recuperando = modo === 'recuperar';

  // O erro entra ACIMA do botão e o empurra para baixo: numa janela baixa, quem acabou de
  // clicar perdia o botão de vista junto com a resposta. O cartão rola até o FIM, e não só
  // até o botão: `scrollIntoView({ block: 'nearest' })` parava com o botão encostado na
  // borda de baixo, sem o respiro do cartão e com o "ver o registro" escondido — medido a
  // 900x560, base do botão em 535 e cartão até 536. Cartão que cabe inteiro não rola.
  useEffect(() => {
    const el = cartao.current;
    if (erro && el) el.scrollTop = el.scrollHeight;
  }, [erro]);

  // Quem chega pelo "Esqueci a senha" já digitou o apelido: o que falta é o código. A dep é
  // o MODO, nunca o apelido — com ele, cada letra digitada no apelido jogaria o cursor para
  // o campo do código.
  useEffect(() => {
    if (modo !== 'recuperar') return;
    (apelido.trim() ? campoCodigo : campoApelido).current?.focus();
  }, [modo]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const sessao = recuperando
        ? await recuperarSenha({ apelido, codigo, senha, senhaRepetida })
        : criando
          ? await cadastrar({ apelido, senha, senhaRepetida })
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
  // balão nativo do navegador.
  const faltaAlgo = recuperando && (!codigoCompleto(codigo) || !senha || !senhaRepetida);
  const aviso = recuperando ? avisoDoCodigo(codigo) : null;

  const rotulo = recuperando
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
            <p className="muted">Peça um código ao dono da Saga. Ele vale uma hora e serve uma vez só.</p>
          </div>
        )}

        <label>
          Apelido
          <input
            ref={campoApelido}
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            autoComplete="username"
            maxLength={24}
            required
            autoFocus
          />
          {criando && <small className="muted">De 3 a 24 caracteres, sem espaços. Não dá para mudar depois — mas o nome que os outros veem, sim.</small>}
        </label>

        {recuperando && (
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

        {modo === 'entrar' && (
          <div className="connect-esqueci">
            <button type="button" className="link" onClick={() => trocarModo('recuperar')}>Esqueci a senha</button>
          </div>
        )}

        {(criando || recuperando) && (
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

        <div className="registro-link">
          <button type="button" className="link" onClick={onRegistro}>deu erro? ver o registro</button>
        </div>
      </form>
    </div>
  );
}
