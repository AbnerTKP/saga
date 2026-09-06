import { useEffect, useRef, useState, type FormEvent } from 'react';
import { urlDoArquivo, type Mensagem } from '../api';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { EscolherGif } from './EscolherGif';

const hora = (t: number) =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * O mesmo chat serve à coluna lateral de uma sala de voz e à tela inteira de uma sala de
 * texto: muda o tamanho, não o comportamento.
 */
export function Chat({ mensagens, erro, onEnviar, onEnviarGif, onVerImagem, sala, meuId, grande }: {
  mensagens: Mensagem[];
  erro: string | null;
  onEnviar: (texto: string) => Promise<void>;
  onEnviarGif: (url: string) => Promise<void>;
  onVerImagem: (url: string) => void;
  sala: string | null;
  meuId: number;
  grande?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [gifAberto, setGifAberto] = useState(false);
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
              <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} />
              <span className="from"><Nome nome={m.nome} id={m.idExibido} turbo={m.turbo} /></span>
              <span className="time">{hora(m.criadoEm)}</span>
            </div>
            {m.texto && <div className="text">{m.texto}</div>}
            {m.imagem && (
              <button
                className="msg-imagem"
                title="Ver maior"
                onClick={() => onVerImagem(urlDoArquivo(m.imagem)!)}
              >
                <img src={urlDoArquivo(m.imagem)!} alt="GIF" draggable={false} />
              </button>
            )}
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={enviar}>
        <button
          type="button"
          className="icon"
          title="Mandar um GIF"
          disabled={semSala}
          onClick={() => setGifAberto(true)}
        >
          <Icon name="gif" size={18} />
        </button>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={semSala ? 'Escolha uma sala' : `Mensagem em ${sala}`}
          disabled={semSala}
          maxLength={2000}
        />
        <button disabled={semSala || !texto.trim()} title="Enviar"><Icon name="send" size={18} /></button>
      </form>

      {gifAberto && (
        <EscolherGif onEscolher={onEnviarGif} onClose={() => setGifAberto(false)} />
      )}
    </div>
  );
}
