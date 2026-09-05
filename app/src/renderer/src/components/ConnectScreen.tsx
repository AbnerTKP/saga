import { useState, type FormEvent } from 'react';

export type Settings = { password: string; name: string };

export function ConnectScreen({ initial, onEnter }: { initial: Settings; onEnter: (s: Settings) => Promise<void> }) {
  const [s, setS] = useState<Settings>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await onEnter(s);
    } catch (e) {
      setErr((e as Error).message === 'Failed to fetch' ? 'Servidor não respondeu. Confira o endereço.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="connect">
      <form className="connect-card" onSubmit={submit}>
        <h1>Cantinho do Vorcaro</h1>
        <p className="muted">Voz, vídeo e tela entre amigos.</p>
        <label>
          Senha do grupo
          <input type="password" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} required />
        </label>
        <label>
          Seu apelido
          <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} maxLength={32} required />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Conectando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
