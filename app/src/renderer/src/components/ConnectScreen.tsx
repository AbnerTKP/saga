import { useState, type FormEvent } from 'react';
import { cadastrar, entrar, guardarToken, type Sessao } from '../api';

type Modo = 'entrar' | 'criar';

export function ConnectScreen({ apelidoInicial, onPronto, onRegistro }: {
  apelidoInicial: string;
  onPronto: (s: Sessao) => void;
  onRegistro: () => void;
}) {
  const [modo, setModo] = useState<Modo>(apelidoInicial ? 'entrar' : 'criar');
  const [apelido, setApelido] = useState(apelidoInicial);
  const [senha, setSenha] = useState('');
  const [senhaRepetida, setSenhaRepetida] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const criando = modo === 'criar';

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const sessao = criando
        ? await cadastrar({ apelido, senha, senhaRepetida })
        : await entrar({ apelido, senha });
      guardarToken(sessao.token);
      onPronto(sessao);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setErro(null);
    setSenhaRepetida('');
  };

  return (
    <div className="connect">
      <form className="connect-card" onSubmit={enviar}>
        <h1>Saga</h1>
        <p className="muted">Voz, vídeo e tela entre amigos.</p>

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={!criando}
            className={!criando ? 'active' : ''} onClick={() => trocarModo('entrar')}>
            Entrar
          </button>
          <button type="button" role="tab" aria-selected={criando}
            className={criando ? 'active' : ''} onClick={() => trocarModo('criar')}>
            Criar conta
          </button>
        </div>

        <label>
          Apelido
          <input
            value={apelido}
            onChange={(e) => setApelido(e.target.value)}
            autoComplete="username"
            maxLength={24}
            required
            autoFocus
          />
          {criando && <small className="muted">De 3 a 24 caracteres, sem espaços. Não dá para mudar depois — mas o nome que os outros veem, sim.</small>}
        </label>

        <label>
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={criando ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {criando && (
          <>
            <label>
              Repita a senha
              <input
                type="password"
                value={senhaRepetida}
                onChange={(e) => setSenhaRepetida(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          </>
        )}

        {erro && <div className="error">{erro}</div>}

        <button className="primary" disabled={ocupado}>
          {ocupado ? (criando ? 'Criando…' : 'Entrando…') : (criando ? 'Criar conta' : 'Entrar')}
        </button>

        <div className="registro-link">
          <button type="button" className="link" onClick={onRegistro}>deu erro? ver o registro</button>
        </div>
      </form>
    </div>
  );
}
