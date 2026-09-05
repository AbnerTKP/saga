import { useEffect, useState } from 'react';
import type { UpdateState } from '../desktop';

// Depois disso, oferece entrar sem atualizar. Um download que trava sem nunca falhar
// deixaria a pessoa presa aqui, e ficar de fora da conversa é pior que ficar desatualizado.
const PACIENCIA = 20_000;

/**
 * Tela de partida enquanto o app procura e baixa atualização — antes isso acontecia
 * calado, e quem fechava no meio do download recomeçava do zero sem saber por quê.
 */
export function TelaDeAtualizacao({ estado, onPular }: { estado: UpdateState; onPular: () => void }) {
  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDemorou(true), PACIENCIA);
    return () => clearTimeout(id);
  }, []);

  // Baixou: reinicia sozinho. Segurar num botão só faria a pessoa adiar e voltar ao
  // problema antigo, de fechar o app antes de a atualização se aplicar.
  useEffect(() => {
    if (estado.fase !== 'pronto') return;
    const id = setTimeout(() => window.desktop.installUpdate(), 1500);
    return () => clearTimeout(id);
  }, [estado.fase]);

  const pct = Math.max(0, Math.min(100, estado.progress ?? 0));

  return (
    <div className="partida">
      <div className="partida-caixa">
        <h1>Cantinho do Vorcaro</h1>

        {estado.fase === 'procurando' && <p className="muted">Procurando atualizações…</p>}

        {estado.fase === 'baixando' && (
          <>
            <p className="muted">Baixando a versão {estado.version} — {pct}%</p>
            <div className="barra"><div className="barra-cheia" style={{ width: `${pct}%` }} /></div>
            <p className="muted small">Pode deixar aberto. O app se reinicia sozinho quando terminar.</p>
          </>
        )}

        {estado.fase === 'pronto' && (
          <>
            <p className="muted">Versão {estado.version} pronta. Reiniciando…</p>
            <div className="barra"><div className="barra-cheia" style={{ width: '100%' }} /></div>
          </>
        )}

        {estado.fase === 'erro' && (
          <p className="muted">Não consegui verificar atualizações. Entrando assim mesmo…</p>
        )}

        {demorou && estado.fase !== 'pronto' && (
          <button className="link" onClick={onPular}>Entrar sem atualizar</button>
        )}
      </div>
    </div>
  );
}
