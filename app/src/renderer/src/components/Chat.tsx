import { useEffect, useRef, useState, type FormEvent } from 'react';
import { urlDoArquivo, type Digitando, type Mensagem } from '../api';
import { Icon } from './Icon';
import { partirEmLinks } from '../links';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { EscolherGif } from './EscolherGif';
import { mudouDeDia, rotuloDoDia } from '../dias';
import { ehContinuacao } from '../agrupamento';
import { fraseDeQuemDigita } from '../digitando';
import type { LiveNoChat } from '../lives';

const hora = (t: number) =>
  new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
  // Vírgula, e não ponto: o app inteiro fala português, e "1.0 MB" ao lado de "22:08" é
  // a única coisa da tela escrita noutra língua.
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} ${PESO[i]}`;
}

/** A extensão, quando o nome tem uma que caiba. É o que diz "é uma imagem" de relance. */
function extensao(nome: string) {
  const ponto = nome.lastIndexOf('.');
  const ext = ponto > 0 ? nome.slice(ponto + 1) : '';
  return ext && ext.length <= 5 ? ext.toUpperCase() : null;
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

  const ext = extensao(arquivo.nome);
  return (
    <button className="msg-anexo" onClick={salvar} disabled={salvando} title={`Salvar ${arquivo.nome}`}>
      <span className="anexo-icone"><Icon name="anexo" size={18} /></span>
      <span className="anexo-quem">
        <span className="strong">{arquivo.nome}</span>
        <span className="muted small">
          {peso(arquivo.bytes)}{ext ? ` · ${ext}` : ''}
          {salvando ? ' · salvando…' : feito ? ` · ${feito}` : ''}
        </span>
      </span>
      {/* A seta não é outro botão: o cartão inteiro salva, e ela é o que diz isso sem
          precisar da frase "clique para salvar" ocupando a segunda linha. */}
      <span className="anexo-baixar"><Icon name="baixar" size={18} /></span>
    </button>
  );
}

/**
 * Alguém pôs a tela no ar enquanto você lia o chat.
 *
 * Antes isso não aparecia em lugar nenhum: para saber que tinha live era preciso voltar
 * à sala de voz e olhar. A linha vive no fim da conversa e some quando a transmissão
 * acaba — é um acontecimento de AGORA, não um recado guardado, e por isso não leva hora
 * nem fica no histórico de ontem.
 */
function LinhaDaLive({ live, naMinhaSala, assistindo, onAssistir }: {
  live: LiveNoChat;
  /** A sala de voz da live é a que você já está: assistir é um clique, sem entrar em nada. */
  naMinhaSala: boolean;
  assistindo: boolean;
  onAssistir?: (live: LiveNoChat) => void;
}) {
  return (
    <div className={`live-no-chat ${assistindo ? 'vendo' : ''}`}>
      <span className="live-icone"><Icon name="screen" size={16} /></span>
      <span className="live-texto">
        <span className="strong">{live.souEu ? 'Você' : live.nome}</span>
        {' está compartilhando a tela'}
        {!naMinhaSala && <span className="muted"> em {live.salaNome}</span>}
      </span>
      {/* Na sua transmissão o zero aparece: "ninguém ainda" é a informação, não a
          ausência dela. Nas dos outros, plateia vazia não desenha nada. */}
      {(live.souEu || live.espectadores.length > 0) && (
        <span
          className="live-plateia"
          title={live.espectadores.length ? `Assistindo: ${live.espectadores.join(', ')}` : 'Ninguém está assistindo'}
        >
          <Icon name="olho" size={13} />
          {live.espectadores.length}
        </span>
      )}
      {!live.souEu && onAssistir && (
        <button className="live-assistir" onClick={() => onAssistir(live)} disabled={assistindo}>
          {assistindo ? 'Assistindo' : naMinhaSala ? 'Assistir' : 'Entrar e assistir'}
        </button>
      )}
    </div>
  );
}

export function Chat({
  mensagens, digitando, erro, onEnviar, onEnviarGif, onEnviarArquivo, onDigitar, onVerImagem,
  sala, meuId, onPessoa, lives = [], assistindo, onAssistir, salaDaVozId,
}: {
  mensagens: Mensagem[];
  /** Quem está escrevendo agora, fora você. Vem na mesma busca das mensagens. */
  digitando: Digitando[];
  erro: string | null;
  onEnviar: (texto: string) => Promise<void>;
  /** Manda um arquivo qualquer. O chat mostra um cartão; salvar é escolha de quem lê. */
  onEnviarArquivo: (arquivo: File, texto: string, aoProgredir: (f: number) => void) => Promise<void>;
  onEnviarGif: (url: string) => Promise<void>;
  /** Chamado a cada tecla; quem freia é o useChat, nunca este componente. */
  onDigitar: () => void;
  onVerImagem: (url: string) => void;
  sala: string | null;
  meuId: number;
  /** Mesma abertura de perfil de todo lugar: a pessoa é a mesma, o gesto também. */
  /** Esquerdo abre o perfil; direito, as ações. */
  onPessoa?: (usuarioId: number, nome: string, em: { x: number; y: number }, tipo: 'perfil' | 'acoes') => void;
  /** As telas no ar agora, em qualquer sala de voz do servidor. */
  lives?: LiveNoChat[];
  /** A transmissão que você escolheu ver, se houver. */
  assistindo?: string | null;
  onAssistir?: (live: LiveNoChat) => void;
  /** Em que sala de voz você está, para a linha da live saber se é a mesma. */
  salaDaVozId?: number | null;
}) {
  const [texto, setTexto] = useState('');
  const [gifAberto, setGifAberto] = useState(false);
  /**
   * O arquivo escolhido espera aqui até a pessoa confirmar.
   *
   * Ia direto ao clicar, e isso é errado por dois motivos: engano não tem volta — não há
   * como apagar mensagem — e não dava para escrever nada junto. Agora ele vira uma ficha
   * ao lado do campo, com nome e peso, e sai no mesmo botão de sempre.
   */
  const [anexo, setAnexo] = useState<File | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erroDoAnexo, setErroDoAnexo] = useState<string | null>(null);
  const campoDeArquivo = useRef<HTMLInputElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  /**
   * Se a conversa está grudada no fim.
   *
   * Rolar para o fim a cada novidade é o certo enquanto se está lendo o fim — mas quem
   * subiu para procurar uma coisa de ontem não pode ser puxado de volta porque alguém
   * começou a digitar. Enquanto está lá em cima, as novidades chegam sem mexer na tela.
   */
  const grudado = useRef(true);

  useEffect(() => {
    if (grudado.current) fim.current?.scrollTo({ top: fim.current.scrollHeight });
  }, [mensagens.length, digitando.length, lives.length]);

  /**
   * Abriu a sala, já dá para digitar.
   *
   * Clicar na sala e depois ter de clicar no campo é um clique que não decide nada: quem
   * abre uma sala de texto vai escrever ou vai ler, e em nenhum dos dois casos o cursor
   * fazia falta noutro lugar. A dep é o NOME da sala, não a lista de mensagens — senão
   * cada mensagem que chega roubaria o cursor de volta no meio de uma frase.
   */
  useEffect(() => { if (sala) campo.current?.focus(); }, [sala]);

  const semSala = !sala;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (anexo) {
      const arquivo = anexo, t = texto;
      setErroDoAnexo(null);
      setProgresso(0);
      try {
        await onEnviarArquivo(arquivo, t, setProgresso);
        setAnexo(null);
        setTexto('');
      } catch (err) {
        // Fica com o arquivo na mão: quem tentou mandar 300 MB quer trocar o arquivo, não
        // recomeçar do zero sem saber o que aconteceu.
        setErroDoAnexo((err as Error).message);
      } finally {
        setProgresso(null);
      }
      return;
    }
    const t = texto;
    setTexto('');
    grudado.current = true;   // quem manda quer ver o que mandou
    await onEnviar(t);
  };

  /** Soltar arquivo em qualquer lugar da conversa escolhe — não manda. */
  const soltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    if (semSala) return;
    const a = e.dataTransfer.files?.[0];
    if (a) { setAnexo(a); setErroDoAnexo(null); }
  };

  const frase = fraseDeQuemDigita(digitando.map((q) => q.nome));

  return (
    <div
      className={`chat ${arrastando ? 'recebendo-arquivo' : ''}`}
      onDragOver={(e) => { if (!semSala) { e.preventDefault(); setArrastando(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false); }}
      onDrop={soltar}
    >
      {arrastando && <div className="solte-aqui"><Icon name="anexo" size={22} /> Solte para anexar</div>}

      <div
        className="chat-log"
        ref={fim}
        onScroll={(e) => {
          const el = e.currentTarget;
          grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {erro && <div className="error" style={{ margin: '8px 16px' }}>{erro}</div>}
        {!erro && mensagens.length === 0 && (
          <div className="muted small pad">
            {semSala ? 'Escolha uma sala à esquerda.' : 'Ninguém falou nada aqui ainda.'}
          </div>
        )}
        {mensagens.map((m, i) => {
          const anterior = i === 0 ? null : mensagens[i - 1];
          // O separador nasce da comparação com a mensagem ANTERIOR, e por isso não
          // precisa de estado nenhum: a lista já vem em ordem. `agora` é lido na hora de
          // desenhar para que "Hoje" continue certo numa janela aberta desde ontem.
          const outroDia = mudouDeDia(anterior?.criadoEm ?? null, m.criadoEm);
          // Três linhas seguidas da mesma pessoa são uma fala só: a foto e o nome não se
          // repetem, e a hora fica na margem, aparecendo com o mouse. Ver agrupamento.ts.
          const seguida = !outroDia && ehContinuacao(anterior, m);
          const abrirPerfil = (e: React.MouseEvent) =>
            m.autorId && onPessoa?.(m.autorId, m.nome, { x: e.clientX, y: e.clientY }, 'perfil');
          const abrirAcoes = (e: React.MouseEvent) => {
            if (!m.autorId) return;
            e.preventDefault(); e.stopPropagation();
            onPessoa?.(m.autorId, m.nome, { x: e.clientX, y: e.clientY }, 'acoes');
          };

          return (
            <div key={m.id}>
              {outroDia && (
                <div className="dia-separa"><span>{rotuloDoDia(m.criadoEm, Date.now())}</span></div>
              )}
              <div className={`msg ${seguida ? 'seguida' : ''} ${m.autorId === meuId ? 'mine' : ''}`}>
                <div className="msg-lado">
                  {seguida
                    ? <span className="msg-hora-margem">{hora(m.criadoEm)}</span>
                    : (
                      <button className="quem-falou" title={`${m.nome} — clique para o perfil`}
                        onClick={abrirPerfil} onContextMenu={abrirAcoes}>
                        <Avatar nome={m.nome} foto={m.foto} enquadramento={m.enquadramento?.foto} tamanho="big" />
                      </button>
                    )}
                </div>
                <div className="msg-corpo">
                  {!seguida && (
                    <div className="msg-topo">
                      <button className="msg-nome" title={`${m.nome} — clique para o perfil`}
                        onClick={abrirPerfil} onContextMenu={abrirAcoes}>
                        <Nome nome={m.nome} id={m.idExibido} turbo={m.turbo} />
                      </button>
                      <span className="time">{hora(m.criadoEm)}</span>
                    </div>
                  )}
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
              </div>
            </div>
          );
        })}

        {/* No fim da conversa, e não no meio dela: isto está acontecendo agora. */}
        {lives.map((l) => (
          <LinhaDaLive
            key={`${l.salaId}:${l.identity}`}
            live={l}
            naMinhaSala={l.salaId === salaDaVozId}
            assistindo={assistindo === l.identity && l.salaId === salaDaVozId}
            onAssistir={onAssistir}
          />
        ))}
      </div>

      {frase && (
        <div className="digitando" aria-live="polite">
          <span className="pontinhos"><i /><i /><i /></span>
          {frase}
        </div>
      )}

      {anexo && (
        <div className={`anexo-pendente ${erroDoAnexo ? 'com-erro' : ''}`}>
          <span className="anexo-icone"><Icon name="anexo" size={18} /></span>
          <span className="anexo-quem">
            <span className="strong">{anexo.name}</span>
            <span className="muted small">
              {erroDoAnexo ?? (progresso === null
                ? `${peso(anexo.size)} · escreva algo se quiser e clique em enviar`
                : `${peso(anexo.size)} · enviando ${Math.round(progresso * 100)}%`)}
            </span>
          </span>
          {progresso !== null && (
            <span className="anexo-barra"><span style={{ width: `${Math.round(progresso * 100)}%` }} /></span>
          )}
          <button
            type="button"
            className="icon"
            title="Tirar o arquivo"
            disabled={progresso !== null}
            onClick={() => { setAnexo(null); setErroDoAnexo(null); }}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      {/* Uma caixa só, com o anexo à esquerda e o resto à direita — o campo é a caixa,
          não um retângulo dentro dela. Antes eram quatro coisas soltas na mesma linha e
          nada dizia que formavam um lugar de escrever. */}
      <form className="chat-input" onSubmit={enviar}>
        {/* O input fica escondido e o botão é que aparece: o seletor de arquivo do
            navegador não combina com nada em volta, e não dá para estilizá-lo. */}
        <input
          ref={campoDeArquivo}
          type="file"
          hidden
          onChange={(e) => {
            const a = e.target.files?.[0];
            e.target.value = '';   // escolher o MESMO arquivo de novo tem de disparar
            if (a) { setAnexo(a); setErroDoAnexo(null); }
          }}
        />
        <button
          type="button"
          className="icon anexar"
          title="Anexar um arquivo (ou arraste para cá)"
          disabled={semSala || progresso !== null}
          onClick={() => campoDeArquivo.current?.click()}
        >
          <Icon name="mais" size={22} />
        </button>
        <input
          ref={campo}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            // Só quando há o que escrever: apagar o que se escreveu não é digitar.
            if (e.target.value.trim()) onDigitar();
          }}
          placeholder={semSala ? 'Escolha uma sala' : anexo ? 'Escreva algo junto, se quiser' : `Mensagem em #${sala}`}
          disabled={semSala || progresso !== null}
          maxLength={2000}
        />
        {/* `rotulo-gif`, e não `gif`: `gif` já era a classe do QUADRADINHO da busca, com
            fundo preto e proporção 1:1 — e ela caiu inteira neste botão, que virou uma
            caixa preta quadrada com a palavra torta dentro. Nome de classe curto e
            genérico é uma variável global com outro nome. */}
        <button
          type="button"
          className="rotulo-gif"
          title="Mandar um GIF"
          disabled={semSala}
          onClick={() => setGifAberto(true)}
        >
          GIF
        </button>
        <button
          className="enviar"
          disabled={semSala || progresso !== null || (!texto.trim() && !anexo)}
          title={anexo ? 'Enviar o arquivo' : 'Enviar'}
        >
          <Icon name="send" size={17} />
        </button>
      </form>

      {gifAberto && (
        <EscolherGif onEscolher={onEnviarGif} onClose={() => setGifAberto(false)} />
      )}
    </div>
  );
}
