import type { EstadoDaMusica, ItemDaMusica, MensagemDoBot } from '../api';
import { situacaoDoCartao, duracao } from '../cartaoDoBot';
import { Icon } from './Icon';

/**
 * O que o bot de música diz no chat. O desenho é a opção A que o dono escolheu na prancheta
 * (22/09/2026): o cartão com a capa e os botões Pular, Parar e Fila. Os botões mandam o
 * MESMO comando que se digita — é um caminho só, com as mesmas conferências.
 */
export function RespostaDoBot({ bot, estadoDaSala, soParaVoce, principal = true, onComando, onApagarLocal }: {
  bot: MensagemDoBot;
  /** A fila de agora da sala de voz do cartão; undefined quando não se sabe. */
  estadoDaSala: (salaVoz: number) => EstadoDaMusica | null | undefined;
  soParaVoce?: boolean;
  /**
   * Se este é o cartão mais recente desta música. A mesma música aparece em mais de um — o dela
   * na fila, e depois o do "pulou, agora toca…" —, e dois cartões grandes com os mesmos botões
   * eram ruído. Só o último fica inteiro; os de antes encolhem, sem botão.
   */
  principal?: boolean;
  onComando: (texto: string) => void;
  onApagarLocal?: () => void;
}) {
  if (bot.tipo === 'texto') {
    return (
      <>
        <div className="text">{bot.texto}</div>
        {soParaVoce && (
          <div className="bot-so-voce">
            Só você vê isto · <button type="button" onClick={onApagarLocal}>apagar</button>
          </div>
        )}
      </>
    );
  }

  if (bot.tipo === 'fila') {
    const passou = bot.tocouSegundos;
    return (
      <div className="bot-lista">
        <LinhaDaFila item={bot.tocando} marca="agora" detalhe={`${duracao(passou)} de ${duracao(bot.tocando.duracao)}`} />
        {bot.fila.map((f, i) => <LinhaDaFila key={f.uid} item={f} marca={String(i + 1)} detalhe={duracao(f.duracao)} />)}
        {bot.fila.length === 0 && <div className="bot-lista-vazia">Depois desta, nada. Ponha mais com /tocar.</div>}
      </div>
    );
  }

  const nasceu = bot.tipo === 'tocando' ? { tipo: 'tocando' as const } : { tipo: 'na-fila' as const, posicao: bot.posicao };
  const s = situacaoDoCartao(bot.item, nasceu, estadoDaSala(bot.sala.id));
  const rotulo = s.tipo === 'tocando' ? `Tocando agora na ${bot.sala.nome}`
    : s.tipo === 'na-fila' ? (s.posicao === 1 ? 'Na fila — é a próxima' : `Na fila — ${s.posicao}ª`)
    : 'Tocou';
  return (
    <>
      {bot.tipo === 'tocando' && bot.pulou && <div className="bot-pulou">Pulou "{bot.pulou}".</div>}
      <div className={`bot-cartao ${s.tipo === 'tocou' || !principal ? 'passou' : ''}`}>
        <img src={bot.item.capa} alt="" loading="lazy" draggable={false} />
        <div className="bot-info">
          <span className={`bot-rotulo ${s.tipo}`}><Icon name="nota" size={13} /> {rotulo}</span>
          <span className="bot-titulo" title={bot.item.titulo}>{bot.item.titulo}</span>
          <span className="bot-sub">
            {bot.item.autor && <>{bot.item.autor} · </>}{duracao(bot.item.duracao)} · pediu <b>{bot.item.pediu.nome}</b>
            {bot.item.origem === 'spotify' && ' · veio do Spotify'}
          </span>
          {s.tipo === 'tocando' && s.botoes && principal && (
            <div className="bot-botoes">
              <button type="button" onClick={() => onComando('/pular')}><Icon name="pular" size={16} /> Pular</button>
              <button type="button" onClick={() => onComando('/parar')}><Icon name="parar" size={16} /> Parar</button>
              <button type="button" onClick={() => onComando('/fila')}><Icon name="fila" size={16} /> Fila</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LinhaDaFila({ item, marca, detalhe }: { item: ItemDaMusica; marca: string; detalhe: string }) {
  const agora = marca === 'agora';
  return (
    <div className={`bot-item ${agora ? 'agora' : ''}`}>
      <span className="bot-n">{agora ? <Icon name="tocar" size={12} /> : marca}</span>
      <img src={item.capa} alt="" loading="lazy" draggable={false} />
      <span className="bot-item-texto">
        <span className="bot-titulo">{item.titulo}</span>
        <span className="bot-sub">{detalhe} · pediu {item.pediu.nome}</span>
      </span>
    </div>
  );
}
