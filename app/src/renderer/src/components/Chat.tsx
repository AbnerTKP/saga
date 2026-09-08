import { useEffect, useRef, useState, type FormEvent } from 'react';
import { urlDoArquivo, type Mensagem } from '../api';
import { Icon } from './Icon';
import { partirEmLinks } from '../links';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { EscolherGif } from './EscolherGif';

const hora = (t: number) =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * O mesmo chat serve à coluna lateral de uma sala de voz e à tela inteira de uma sala de
 * texto: muda o tamanho, não o comportamento.
 */
/**
 * O texto da mensagem com os endereços clicáveis.
 *
 * Nada de HTML montado a partir do que a pessoa escreveu: `partirEmLinks` devolve pedaços
 * e o React desenha `<a>` só onde este código disse que é link. O `setWindowOpenHandler`
 * do processo principal manda para o navegador do sistema — abrir dentro do app seria
 * navegar a janela do app para fora dele.
 */
function comLinks(texto: string) {
  return partirEmLinks(texto).map((p, i) => (
    p.tipo === 'link'
      ? <a key={i} href={p.href} target="_blank" rel="noreferrer noopener">{p.valor}</a>
      : <span key={i}>{p.valor}</span>
  ));
}

const PESO = ['B', 'KB', 'MB', 'GB'];
function peso(bytes: number) {
  let n = bytes, i = 0;
  while (n >= 1024 && i < PESO.length - 1) { n /= 1024; i += 1; }
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${PESO[i]}`;
}

/**
 * O anexo é um cartão, e salvar é escolha de quem lê.
 *
 * Nada é aberto nem executado: o arquivo veio de fora e vai para o disco no lugar que a
 * pessoa escolher, pelo diálogo do sistema. É o processo principal que baixa — dentro da
 * tela não há para onde escrever, e a alternativa seria abrir no navegador, que é
 * exatamente o que não se quer.
 */
function Anexo({ arquivo }: { arquivo: NonNullable<Mensagem['arquivo']> }) {
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await window.desktop.salvarArquivo(urlDoArquivo(arquivo.url)!, arquivo.nome);
      if (r.ok) setFeito('salvo');
      else if (r.erro) setFeito('não deu');
    } finally { setSalvando(false); }
  };

  return (
    <button className="msg-anexo" onClick={salvar} disabled={salvando} title={`Salvar ${arquivo.nome}`}>
      <span className="anexo-icone"><Icon name="anexo" size={18} /></span>
      <span className="anexo-quem">
        <span className="strong">{arquivo.nome}</span>
        <span className="muted small">
          {peso(arquivo.bytes)}
          {salvando ? ' · salvando…' : feito ? ` · ${feito}` : ' · clique para salvar'}
        </span>
      </span>
    </button>
  );
}

export function Chat({ mensagens, erro, onEnviar, onEnviarGif, onEnviarArquivo, onVerImagem, sala, meuId, grande, onPessoa }: {
  mensagens: Mensagem[];
  erro: string | null;
  onEnviar: (texto: string) => Promise<void>;
  /** Manda um arquivo qualquer. O chat mostra um cartão; salvar é escolha de quem lê. */
  onEnviarArquivo: (arquivo: File) => Promise<void>;
  onEnviarGif: (url: string) => Promise<void>;
  onVerImagem: (url: string) => void;
  sala: string | null;
  meuId: number;
  grande?: boolean;
  /** Mesma abertura de perfil de todo lugar: a pessoa é a mesma, o gesto também. */
  /** Esquerdo abre o perfil; direito, as ações. */
  onPessoa?: (usuarioId: number, nome: string, em: { x: number; y: number }, tipo: 'perfil' | 'acoes') => void;
}) {
  const [texto, setTexto] = useState('');
  const [gifAberto, setGifAberto] = useState(false);
  const [mandando, setMandando] = useState(false);
  const campoDeArquivo = useRef<HTMLInputElement>(null);
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
              <button className="quem-falou" title={`${m.nome} — clique para o perfil`}
                onClick={(e) => m.autorId && onPessoa?.(m.autorId, m.nome, { x: e.clientX, y: e.clientY }, 'perfil')}
                onContextMenu={(e) => { if (!m.autorId) return; e.preventDefault(); e.stopPropagation(); onPessoa?.(m.autorId, m.nome, { x: e.clientX, y: e.clientY }, 'acoes'); }}>
                <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} tamanho="big" />
                <span className="from"><Nome nome={m.nome} id={m.idExibido} turbo={m.turbo} /></span>
              </button>
              <span className="time">{hora(m.criadoEm)}</span>
            </div>
            {m.texto && <div className="text">{comLinks(m.texto)}</div>}
            {m.imagem && (
              <button
                className="msg-imagem"
                title="Ver maior"
                onClick={() => onVerImagem(urlDoArquivo(m.imagem)!)}
              >
                <img src={urlDoArquivo(m.imagem)!} alt="GIF" draggable={false} />
              </button>
            )}
            {m.arquivo && <Anexo arquivo={m.arquivo} />}
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
        {/* O input fica escondido e o botão é que aparece: o seletor de arquivo do
            navegador não combina com nada em volta, e não dá para estilizá-lo. */}
        <input
          ref={campoDeArquivo}
          type="file"
          hidden
          onChange={async (e) => {
            const a = e.target.files?.[0];
            e.target.value = '';   // escolher o MESMO arquivo de novo tem de disparar
            if (!a) return;
            setMandando(true);
            try { await onEnviarArquivo(a); } finally { setMandando(false); }
          }}
        />
        <button
          type="button"
          className="icon"
          title="Mandar um arquivo"
          disabled={semSala || mandando}
          onClick={() => campoDeArquivo.current?.click()}
        >
          <Icon name="anexo" size={18} />
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
