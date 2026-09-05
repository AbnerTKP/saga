import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Mensagem } from '../api';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Nome } from './Nome';

const hora = (t: number) =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * O mesmo chat serve à coluna lateral de uma sala de voz e à tela inteira de uma sala de
 * texto: muda o tamanho, não o comportamento.
 */
export function Chat({ mensagens, erro, onEnviar, sala, meuId, grande }: {
  mensagens: Mensagem[];
  erro: string | null;
  onEnviar: (texto: string) => Promise<void>;
  sala: string | null;
  meuId: number;
  grande?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  // Rola para o fim quando chega mensagem — é onde a conversa está.
  useEffect(() => { fim.current?.scrollTo({ top: fim.current.scrollHeight }); }, [mensagens.length]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto;
    setTexto('');
    await onEnviar(t);
  };

  const semSala = !sala;

  return (
    <div className={`chat ${grande ? 'chat-grande' : ''}`}>
      {!grande && <div className="chat-head">{sala ? `Chat de ${sala}` : 'Chat'}</div>}

      <div className="chat-log" ref={fim}>
        {erro && <div className="error" style={{ margin: '8px 16px' }}>{erro}</div>}
        {!erro && mensagens.length === 0 && (
          <div className="muted small pad">
            {semSala ? 'Escolha uma sala à esquerda.' : 'Ninguém falou nada aqui ainda.'}
          </div>
        )}
        {mensagens.map((m) => (
          <div key={m.id} className={`msg ${m.autorId === meuId ? 'mine' : ''}`}>
            <div className="msg-topo">
              <Avatar nome={m.nome} foto={m.foto} />
              <span className="from"><Nome nome={m.nome} id={m.idExibido} turbo={m.turbo} /></span>
              <span className="time">{hora(m.criadoEm)}</span>
            </div>
            <div className="text">{m.texto}</div>
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={enviar}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={semSala ? 'Escolha uma sala' : `Mensagem em ${sala}`}
          disabled={semSala}
          maxLength={2000}
        />
        <button disabled={semSala || !texto.trim()} title="Enviar"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
