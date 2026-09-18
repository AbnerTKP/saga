import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Room } from 'livekit-client';
import {
  mudarMeuNome, minhaFoto, meuBanner, usarGif, salvarEnquadramento, trocarMinhaSenha, urlDoArquivo,
  pedirCodigoDoEmail, confirmarEmail, desistirDoEmail, ErroDoServidor, type EstadoDoEmail, type Membro,
} from '../api';
import { lerQualidadeGuardada, guardarQualidade } from '../useRoom';
import { qualidadesDe, qualidadeValida, COMO_SE_LE, TODAS, type Qualidade } from '../qualidades';
import {
  avisoDaTroca, avisoDoCodigo, codigoCompleto, codigoDepoisDeColar, explicarFalha, formatarCodigo,
} from '../recuperacao';
import { pareceEmail } from '../email';
import { Icon } from './Icon';
import { Configuracoes, Linha, Pagina as Folha, Secao } from './Configuracoes';
import { CaixaDeRelato } from './Relatar';
import { PAGINAS_DA_CONTA, type Pagina, type PaginaDaConta } from '../paginasDeConfiguracao';
import { EscolherImagem } from './EscolherImagem';
import { BlocoDoMicrofone } from './AjustesDoMicrofone';
import type { MicrofoneDaCall } from '../useMicrofone';
import type { AberturaComOSistema } from '../desktop';
import { atalhoDoEvento, comoSeLe } from '../atalho';
import { anotar } from '../registro';
import { CHAVE_DOS_APARELHOS, comEscolha, opcoesDoSeletor, trocarAparelho, valorNoSeletor } from '../aparelhos';

type Kind = 'audioinput' | 'audiooutput' | 'videoinput';
const APARELHOS: Record<Kind, string> = {
  audioinput: 'Microfone', audiooutput: 'Saída de som', videoinput: 'Câmera',
};

// Pelo nome que a pessoa usa — e "encolhida" fica num lugar diferente em cada sistema.
const SISTEMAS: Record<string, { nome: string; encolhida: string }> = {
  win32: { nome: 'o Windows', encolhida: ' na barra de tarefas' },
  darwin: { nome: 'o macOS', encolhida: ' no Dock' },
};
// Sem inventar para o que não conhecemos.
const OUTRO_SISTEMA = { nome: 'o sistema', encolhida: '' };


/**
 * O atalho que trava e destrava a live por cima do jogo.
 *
 * O campo ESCUTA em vez de aceitar texto: "ctrl shift o" escrito à mão não é nada para o
 * atalho global, e o erro só apareceria com o jogo aberto — longe daqui. E o que fica na
 * tela é o que o SISTEMA aceitou: outro programa pode já estar com a combinação, e nesse
 * caso o certo é dizer, não fingir que deu.
 */
function AtalhoDoOverlay() {
  const [atalho, setAtalho] = useState('');
  const [ouvindo, setOuvindo] = useState(false);
  const [recusado, setRecusado] = useState<string | null>(null);
  const mac = window.desktop.platform === 'darwin';

  useEffect(() => {
    window.desktop.overlay.estado().then((e) => setAtalho(e.atalho)).catch(() => undefined);
  }, []);

  const teclou = async (e: React.KeyboardEvent) => {
    e.preventDefault();
    if (e.key === 'Escape') { setOuvindo(false); return; }
    const novo = atalhoDoEvento(e);
    if (!novo) return;                                  // ainda está no meio de apertar
    setOuvindo(false);
    setRecusado(null);
    const r = await window.desktop.overlay.definirAtalho(novo);
    setAtalho(r.atalho);
    if (!r.valeu) setRecusado(novo);
  };

  return (
    <div className="form">
      <label>
        Atalho para travar e destravar
        <button
          type="button"
          className={`campo-atalho ${ouvindo ? 'ouvindo' : ''}`}
          onClick={() => { setOuvindo(true); setRecusado(null); }}
          onBlur={() => setOuvindo(false)}
          onKeyDown={teclou}
        >
          {ouvindo ? 'aperte a combinação…' : (atalho ? comoSeLe(atalho, mac) : '—')}
        </button>
        <small className="muted">
          Travado, o overlay é só de olhar: o clique, a mira e o teclado vão todos para o
          jogo. Destravado, dá para arrastá-lo, esticá-lo pelas quinas e mexer no som dele.
          O atalho é do sistema inteiro, então funciona com o jogo na frente.
          {recusado && ` ${comoSeLe(recusado, mac)} já é de outro programa — continua valendo o de cima.`}
        </small>
      </label>
    </div>
  );
}

/**
 * O e-mail da conta: o que está valendo, e o jeito de trocar.
 *
 * O endereço novo passa pelo mesmo caminho do pedido ao entrar — código no endereço, e só
 * então ele vale. Até confirmar, continua valendo o de antes: trocar para um endereço que não
 * recebe deixaria a conta sem saída justo no dia em que a senha for esquecida.
 *
 * Não pede a senha atual, ao contrário da troca de senha: sozinho, pedir não muda nada, e
 * confirmar exige abrir a caixa do endereço novo. Ver a rota `/eu/email`, no servidor.
 */
function BlocoDoEmail({ estado, onEmail }: { estado: EstadoDoEmail; onEmail: (e: EstadoDoEmail) => void }) {
  const [passo, setPasso] = useState<'fechado' | 'email' | 'codigo'>(estado.emailPendente ? 'codigo' : 'fechado');
  const [endereco, setEndereco] = useState(estado.emailPendente ?? '');
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);

  const tentar = async (acao: () => Promise<void>) => {
    setErro(null); setConfirmado(false); setOcupado(true);
    try { await acao(); }
    catch (e) { setErro(explicarFalha(e instanceof ErroDoServidor ? e.status : 0, (e as Error).message)); }
    finally { setOcupado(false); }
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (passo === 'email') {
      tentar(async () => {
        const r = await pedirCodigoDoEmail(endereco.trim());
        setEndereco(r.emailPendente);
        setCodigo('');
        setPasso('codigo');
        onEmail({ ...estado, emailPendente: r.emailPendente });
      });
    } else {
      tentar(async () => {
        const { emailLigado, email, emailPendente, precisaDeEmail } = await confirmarEmail(codigo);
        onEmail({ emailLigado, email, emailPendente, precisaDeEmail });
        setPasso('fechado');
        setCodigo('');
        setConfirmado(true);
      });
    }
  };

  // Desistir no servidor, e não só fechar: senão o pendente reabriria este passo na próxima vez.
  const desistir = () => {
    if (passo === 'codigo') {
      desistirDoEmail().then(({ emailLigado, email, emailPendente, precisaDeEmail }) =>
        onEmail({ emailLigado, email, emailPendente, precisaDeEmail })).catch(() => undefined);
    }
    setErro(null);
    setCodigo('');
    setPasso('fechado');
  };

  const colarCodigo = (e: ClipboardEvent<HTMLInputElement>) => {
    const campo = e.currentTarget;
    e.preventDefault();
    setCodigo(codigoDepoisDeColar(
      campo.value, campo.selectionStart ?? campo.value.length, campo.selectionEnd ?? campo.value.length,
      e.clipboardData.getData('text'),
    ));
  };

  const aviso = passo === 'codigo' ? avisoDoCodigo(codigo, 'email') : null;
  const pronto = passo === 'email' ? pareceEmail(endereco) : codigoCompleto(codigo);

  return (
    <Secao titulo="E-mail">
      <form className="form bloco-da-senha" onSubmit={enviar}>
        {estado.email ? (
          <p className="muted small">
            Confirmado: <b>{estado.email}</b>. É por ele que você recupera a senha sozinho. Ninguém mais o vê.
          </p>
        ) : (
          <p className="muted small">
            A conta ainda não tem e-mail. Sem ele, quem esquece a senha depende do dono da Saga.
          </p>
        )}

        {passo === 'email' && (
          <label>
            {estado.email ? 'E-mail novo' : 'E-mail'}
            <input
              type="email" value={endereco} onChange={(e) => setEndereco(e.target.value)}
              autoComplete="email" spellCheck={false} maxLength={254} autoFocus
            />
          </label>
        )}

        {passo === 'codigo' && (
          <>
            <p className="muted small">
              Mandei um código para <b>{endereco}</b>. Ele vale uma hora.
              {estado.email && ' Até confirmar, continua valendo o de cima.'}
            </p>
            <label>
              Código
              <input
                className="connect-codigo" value={codigo} placeholder="XXXX-XXXX" maxLength={9}
                onChange={(e) => setCodigo(formatarCodigo(e.target.value))} onPaste={colarCodigo}
                autoComplete="one-time-code" spellCheck={false} autoFocus
              />
              {aviso && <small className="muted">{aviso}</small>}
            </label>
          </>
        )}

        {erro && <div className="error">{erro}</div>}
        {confirmado && <div className="aviso-ok">E-mail confirmado.</div>}

        <div className="linha-campo">
          {passo === 'fechado' ? (
            // Só com o envio ligado: sem ele, não há como confirmar endereço nenhum.
            estado.emailLigado && (
              <button type="button" className="primary sm" onClick={() => { setConfirmado(false); setEndereco(''); setPasso('email'); }}>
                {estado.email ? 'Trocar o e-mail' : 'Pôr um e-mail'}
              </button>
            )
          ) : (
            <>
              <button type="submit" className="primary sm" disabled={ocupado || !pronto}>
                {passo === 'email' ? (ocupado ? 'Mandando…' : 'Mandar código') : (ocupado ? 'Confirmando…' : 'Confirmar')}
              </button>
              <button type="button" className="link" onClick={desistir}>cancelar</button>
            </>
          )}
        </div>
      </form>
    </Secao>
  );
}

/**
 * As SUAS configurações: uma página por assunto, com menu lateral.
 *
 * Era "Sua conta", um modal com dez blocos numa rolagem só, que misturava a conta (foto,
 * senha), o que fica guardado neste computador (aparelhos, microfone, atalho) e portas para
 * outros lugares (a administração, o registro de erros). Agora os grupos dizem de quem é
 * cada coisa: SUA CONTA vale em qualquer computador; ESTE COMPUTADOR fica só nesta máquina.
 * "Sair da conta" fica no fim do menu, como no Discord — e continua no menu de status.
 * A lógica de cada bloco veio de lá sem mudar (PainelDaConta, até a v0.61).
 */
export function ConfiguracoesDaConta({
  eu, room, microfone, servidorNome, souBerserk, donoDaSaga, volumeDoSoundboard, onVolumeDoSoundboard, onEu, onRegistro, onAdministracao, onSair, onClose,
  email, onEmail, inicial,
}: {
  eu: Membro;
  /** O e-mail da conta, como veio na sessão. Sem envio e sem endereço, o bloco não aparece. */
  email: EstadoDoEmail;
  onEmail: (e: EstadoDoEmail) => void;
  room: Room;
  /** Supressão de ruído e sensibilidade — o mesmo ajuste do botão direito no microfone. */
  microfone: MicrofoneDaCall;
  /**
   * O servidor aberto, ou null quando não há nenhum. O nome exibido é do VÍNCULO com um
   * servidor, não da conta: sem servidor nenhum ele não tem onde ser escrito.
   */
  servidorNome?: string | null;
  /** 1080p e 60 quadros são do Berserk; sem ele, só 720p a 30. */
  souBerserk: boolean;
  donoDaSaga: boolean;
  volumeDoSoundboard: number;
  onVolumeDoSoundboard: (v: number) => void;
  onEu: (m: Membro) => void;
  onRegistro: () => void;
  /** Quem chamou fecha esta caixa e abre a administração: duas caixas empilhadas seriam dois Esc. */
  onAdministracao: () => void;
  onSair: () => void;
  onClose: () => void;
  inicial?: PaginaDaConta;
}) {
  const [pagina, setPagina] = useState<PaginaDaConta>(inicial ?? 'perfil');
  const [relatando, setRelatando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const paginas: Pagina<PaginaDaConta | 'relatar' | 'registro' | 'admin' | 'sair'>[] = [
    ...PAGINAS_DA_CONTA,
    { id: 'relatar', titulo: 'Relatar um problema', icone: 'relatar', grupo: 'A Saga', busca: ['erro', 'bug', 'ideia', 'sugestão'], acao: () => setRelatando(true) },
    { id: 'registro', titulo: 'Registro de erros', icone: 'documento', grupo: 'A Saga', busca: ['log', 'erro', 'diagnóstico'], acao: onRegistro },
    ...(donoDaSaga ? [{ id: 'admin' as const, titulo: 'Administração da Saga', icone: 'grade', grupo: 'A Saga', busca: ['berserk', 'servidores', 'contas', 'código de senha'], acao: onAdministracao }] : []),
    {
      id: 'sair', titulo: saindo ? 'Sair mesmo da conta' : 'Sair da conta', icone: 'sair', fim: true, tom: 'perigo', armado: saindo,
      acao: () => { if (saindo) onSair(); else { setSaindo(true); setTimeout(() => setSaindo(false), 4000); } },
    },
  ];

  const escopo = {
    quadro: eu.foto ? <img src={urlDaFoto(eu.foto)} alt="" /> : eu.nome.slice(0, 1).toUpperCase(),
    nome: eu.nome,
    meta: `@${eu.apelido}`,
    pessoa: true,
  };

  return (
    <>
      <Configuracoes casa="Configurações" escopo={escopo} paginas={paginas} atual={pagina}
        onIr={(id) => { if (id === 'perfil' || id === 'conta' || id === 'voz' || id === 'atalhos' || id === 'inicio') setPagina(id); }} onClose={onClose}>
        {pagina === 'perfil' && <PaginaPerfil eu={eu} servidorNome={servidorNome} onEu={onEu} />}
        {pagina === 'conta' && <PaginaConta eu={eu} email={email} onEmail={onEmail} />}
        {pagina === 'voz' && <PaginaVoz room={room} microfone={microfone} souBerserk={souBerserk} donoDaSaga={donoDaSaga} volumeDoSoundboard={volumeDoSoundboard} onVolumeDoSoundboard={onVolumeDoSoundboard} />}
        {pagina === 'atalhos' && <PaginaAtalhos />}
        {pagina === 'inicio' && <PaginaInicio />}
      </Configuracoes>
      {relatando && <CaixaDeRelato onClose={() => setRelatando(false)} />}
    </>
  );
}

const urlDaFoto = (f: string) => urlDoArquivo(f) ?? '';

function PaginaPerfil({ eu, servidorNome, onEu }: { eu: Membro; servidorNome?: string | null; onEu: (m: Membro) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [meuNome, setMeuNome] = useState(eu.nome);
  const [ocupado, setOcupado] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const salvarMeuNome = async () => {
    setErro(null); setOcupado(true); setSalvo(false);
    try { const r = await mudarMeuNome(meuNome); onEu(r.eu); setMeuNome(r.eu.nome); setSalvo(true); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  };
  return (
    <Folha titulo="Seu perfil" descricao="A foto e a capa são da sua conta e vão com você para todos os servidores.">
      {erro && <div className="cfg-alerta" data-tom="perigo">{erro}</div>}
      <Secao titulo="Imagens">
        <div className="imagens">
          <EscolherImagem
            rotulo="Sua foto" formato="redondo" atual={eu.foto}
            papel="foto" enquadramento={eu.enquadramento?.foto}
            onEnquadrar={async (v) => { setErro(null); onEu(await salvarEnquadramento('foto', v)); }}
            onEnviar={async (a) => { setErro(null); try { onEu((await minhaFoto(a)).eu); } catch (e) { setErro((e as Error).message); } }}
            onGif={async (url) => { setErro(null); const r = await usarGif('usuario.foto', url); if (r.eu) onEu(r.eu); }}
          />
          <EscolherImagem
            rotulo="Sua capa" formato="faixa" atual={eu.banner}
            papel="banner" enquadramento={eu.enquadramento?.banner}
            onEnquadrar={async (v) => { setErro(null); onEu(await salvarEnquadramento('banner', v)); }}
            onEnviar={async (a) => { setErro(null); try { onEu((await meuBanner(a)).eu); } catch (e) { setErro((e as Error).message); } }}
            onGif={async (url) => { setErro(null); const r = await usarGif('usuario.banner', url); if (r.eu) onEu(r.eu); }}
          />
        </div>
        <p className="cfg-ajuda">{eu.turbo ? 'Foto e capa animadas (GIF) valem: você tem o Berserk.' : 'Imagem animada é do Berserk; parada, todo mundo pode.'}</p>
      </Secao>
      {servidorNome ? (
        <Secao titulo={`Seu nome em ${servidorNome}`}>
          <div className="cfg-campo">
            <div className="cfg-campo-linha">
              <input value={meuNome} maxLength={32} aria-label={`Seu nome em ${servidorNome}`} onChange={(e) => { setMeuNome(e.target.value); setSalvo(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && meuNome !== eu.nome) salvarMeuNome(); }} />
              <button className="cfg-botao" data-variante="primario" onClick={salvarMeuNome} disabled={ocupado || meuNome === eu.nome || !meuNome.trim()}>Salvar</button>
            </div>
            <span className="cfg-ajuda">
              {salvo ? 'Salvo. ' : ''}O nome que aparece é de cada servidor: este vale só em {servidorNome}. O apelido de entrada, @{eu.apelido}, não muda.
            </span>
          </div>
        </Secao>
      ) : (
        <p className="cfg-ajuda">O nome que aparece é de cada servidor. Entre num servidor para escolher o seu nele.</p>
      )}
      <div className="cfg-ponte">
        <Icon name="info" size={16} />
        <span>A senha e o e-mail ficam em <b>Conta e segurança</b>.</span>
      </div>
    </Folha>
  );
}

function PaginaConta({ eu, email, onEmail }: { eu: Membro; email: EstadoDoEmail; onEmail: (e: EstadoDoEmail) => void }) {
  // A troca de senha tem erro e acerto próprios, mostrados junto dos campos.
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaNovaRepetida, setSenhaNovaRepetida] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [erroDaSenha, setErroDaSenha] = useState<string | null>(null);
  const [senhaTrocada, setSenhaTrocada] = useState<string | null>(null);

  // Pede a senha atual mesmo com a sessão aberta: quem sentar num computador com a Saga
  // aberta não pode tomar a conta trocando a senha dela.
  const trocarSenha = async (e: FormEvent) => {
    e.preventDefault();
    setErroDaSenha(null); setSenhaTrocada(null); setTrocandoSenha(true);
    try {
      const r = await trocarMinhaSenha({ senhaAtual, senha: senhaNova, senhaRepetida: senhaNovaRepetida });
      setSenhaAtual(''); setSenhaNova(''); setSenhaNovaRepetida('');
      setSenhaTrocada(avisoDaTroca(r.encerradas));
    } catch (err) {
      setErroDaSenha(explicarFalha(err instanceof ErroDoServidor ? err.status : 0, (err as Error).message));
    } finally { setTrocandoSenha(false); }
  };

  return (
    <Folha titulo="Conta e segurança" descricao="O que protege a sua conta. Vale em qualquer computador.">
      <Secao titulo="Apelido de entrada">
        <Linha rotulo={`@${eu.apelido}`} explica="É com ele que você entra. Não muda — o nome que aparece em cada servidor, sim (em Seu perfil)." />
      </Secao>
      {(email.emailLigado || email.email) && <BlocoDoEmail estado={email} onEmail={onEmail} />}
      <Secao titulo="Senha">
        <form className="form bloco-da-senha" onSubmit={trocarSenha}>
          <label>
            Senha atual
            <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} autoComplete="current-password" />
          </label>
          <label>
            Senha nova
            <input type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} autoComplete="new-password" />
          </label>
          <label>
            Repita a senha nova
            <input type="password" value={senhaNovaRepetida} onChange={(e) => setSenhaNovaRepetida(e.target.value)} autoComplete="new-password" />
          </label>
          <p className="cfg-ajuda">Trocar a senha tira a sua conta dos outros computadores em que ela estava aberta. Neste você continua.</p>
          {erroDaSenha && <div className="cfg-alerta" data-tom="perigo">{erroDaSenha}</div>}
          {senhaTrocada && <div className="cfg-alerta" data-tom="ok">{senhaTrocada}</div>}
          <div>
            <button type="submit" className="cfg-botao" data-variante="primario" disabled={trocandoSenha || !senhaAtual || !senhaNova || !senhaNovaRepetida}>
              {trocandoSenha ? 'Trocando…' : 'Trocar senha'}
            </button>
          </div>
        </form>
      </Secao>
    </Folha>
  );
}

function PaginaVoz({ room, microfone, souBerserk, donoDaSaga, volumeDoSoundboard, onVolumeDoSoundboard }: {
  room: Room; microfone: MicrofoneDaCall; souBerserk: boolean; donoDaSaga: boolean;
  volumeDoSoundboard: number; onVolumeDoSoundboard: (v: number) => void;
}) {
  const [qualidade, setQualidade] = useState<Qualidade>(() => qualidadeValida(lerQualidadeGuardada(), souBerserk));
  const permitidas = qualidadesDe(souBerserk);
  const [aparelhos, setAparelhos] = useState<Record<Kind, MediaDeviceInfo[]>>({ audioinput: [], audiooutput: [], videoinput: [] });
  /**
   * O que foi clicado e ainda está trocando. Fora isso, o seletor mostra o aparelho EM USO, lido
   * da sala: antes ele mostrava o clique, e a troca que falhava calada ficava parecendo feita.
   */
  const [trocando, setTrocando] = useState<Partial<Record<Kind, string>>>({});
  const [erroDoAparelho, setErroDoAparelho] = useState<Partial<Record<Kind, string>>>({});

  // A lista acompanha o aparelho que chega e o que sai.
  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      const [a, o, v] = await Promise.all([
        Room.getLocalDevices('audioinput', true),
        Room.getLocalDevices('audiooutput', true),
        Room.getLocalDevices('videoinput', true),
      ]);
      if (vivo) setAparelhos({ audioinput: a, audiooutput: o, videoinput: v });
    };
    carregar().catch((e) => anotar('erro', 'aparelhos', e));
    navigator.mediaDevices.addEventListener('devicechange', carregar);
    return () => { vivo = false; navigator.mediaDevices.removeEventListener('devicechange', carregar); };
  }, []);

  const trocar = async (kind: Kind, valor: string) => {
    setTrocando((s) => ({ ...s, [kind]: valor }));
    setErroDoAparelho((s) => ({ ...s, [kind]: undefined }));
    try {
      await trocarAparelho(room, kind, valor);
      // Os três são lembrados: a Saga os põe de volta ao abrir, ao entrar na call e quando o
      // aparelho volta a ser conectado (`conferirMicrofone` e `conferirSaidaECamera`, no useRoom).
      try { localStorage.setItem(CHAVE_DOS_APARELHOS, comEscolha(localStorage.getItem(CHAVE_DOS_APARELHOS), kind, valor)); } catch { /* vale até fechar */ }
    } catch (e) {
      anotar('erro', 'aparelhos', e);
      const motivo = (e as Error).message ? `: ${(e as Error).message}` : '.';
      setErroDoAparelho((s) => ({ ...s, [kind]: `Não deu para usar esse aparelho${motivo}${kind === 'audiooutput' ? '' : ' Voltei para o padrão do sistema.'}` }));
    } finally {
      setTrocando((s) => ({ ...s, [kind]: undefined }));
    }
  };

  const seletor = (kind: Kind, explica: string) => {
    const { lista, nomeDoPadrao } = opcoesDoSeletor(aparelhos[kind]);
    const valor = trocando[kind] ?? valorNoSeletor(room.getActiveDevice(kind));
    return (
      <Linha rotulo={APARELHOS[kind]} explica={erroDoAparelho[kind] ?? explica}>
        <select value={valor} onChange={(e) => trocar(kind, e.target.value)} aria-label={APARELHOS[kind]}>
          <option value="">Padrão do sistema{nomeDoPadrao ? ` (${nomeDoPadrao})` : ''}</option>
          {lista.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
          {/* o aparelho em uso que saiu da lista continua no seletor, em vez de ele mentir outro */}
          {valor && aparelhos[kind].length > 0 && !lista.some((d) => d.deviceId === valor) && <option value={valor}>Aparelho desconectado</option>}
        </select>
      </Linha>
    );
  };

  return (
    <Folha titulo="Voz e vídeo" descricao="Fica guardado neste computador. Em outro, você ajusta de novo.">
      <Secao titulo="Microfone" selo={<span className="cfg-selo">neste computador</span>}>
        {seletor('audioinput', 'De onde sai a sua voz.')}
        <div className="cfg-linha" data-empilhada=""><BlocoDoMicrofone microfone={microfone} semTitulo /></div>
      </Secao>
      <Secao titulo="Saída de som">
        {seletor('audiooutput', 'Onde você ouve as pessoas.')}
      </Secao>
      <Secao titulo="Câmera">
        {seletor('videoinput', 'A câmera que liga na call.')}
      </Secao>
      <Secao titulo="Compartilhar tela">
        <Linha rotulo="Qualidade da sua tela"
          explica={<>Vale a partir da próxima vez que você compartilhar. A 30 quadros a imagem fica nítida e os quadros é que caem; a 60, os quadros seguem e a imagem perde nitidez.{!souBerserk && ' 1080p e 60 quadros são do Berserk.'}</>}>
          <select
            value={qualidade} aria-label="Qualidade da sua tela"
            onChange={(e) => {
              // Passa pela mesma régua do momento de transmitir: ninguém escolhe o que não pode.
              const q = qualidadeValida(e.target.value, souBerserk);
              setQualidade(q);
              guardarQualidade(q);
            }}
          >
            {TODAS.map((q) => (
              <option key={q} value={q} disabled={!permitidas.includes(q)}>
                {COMO_SE_LE[q]}{!permitidas.includes(q) ? ' — Berserk' : ''}
              </option>
            ))}
          </select>
        </Linha>
      </Secao>
      {/* A régua do soundboard é só do DONO DA SAGA, por enquanto — pedido dele em 18/09/2026.
          Para devolvê-la a todo mundo, é só apagar esta condição. */}
      {donoDaSaga && (
        <Secao titulo="Soundboard">
          <Linha rotulo={`Volume dos sons · ${Math.round(volumeDoSoundboard * 100)}%`}
            explica="Vale para os sons que você OUVE — os seus e os dos outros — e já na hora. Não muda o volume com que eles chegam para os outros." empilhada>
            <input type="range" min={0} max={100} value={Math.round(volumeDoSoundboard * 100)} aria-label="Volume dos sons"
              onChange={(e) => onVolumeDoSoundboard(Number(e.target.value) / 100)} style={{ width: '100%' }} />
          </Linha>
        </Secao>
      )}
      <div className="cfg-ponte">
        <Icon name="info" size={16} />
        <span>O volume de cada pessoa fica nela mesma: clique ou botão direito sobre o nome.</span>
      </div>
    </Folha>
  );
}

function PaginaAtalhos() {
  return (
    <Folha titulo="Atalhos" descricao="Atalhos do sistema inteiro: funcionam com o jogo na frente.">
      <Secao titulo="A live por cima do jogo">
        <p className="cfg-ajuda" style={{ marginTop: 0 }}>
          Assistindo a uma transmissão, o botão do quadrado com a seta manda a imagem para fora da Saga, numa janela que
          fica acima de tudo — dá para jogar e assistir na mesma tela. O som continua saindo pela Saga.
        </p>
        <AtalhoDoOverlay />
      </Secao>
    </Folha>
  );
}

function PaginaInicio() {
  // 'erro' e null são coisas diferentes: null é "ainda perguntando", 'erro' é "perguntei e
  // não soube". Nenhum dos dois pode virar uma chave desligada na tela.
  const [resposta, setResposta] = useState<AberturaComOSistema | 'erro' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState('');
  const abertura = resposta && resposta !== 'erro' ? resposta : null;
  const sistema = SISTEMAS[window.desktop.platform] ?? OUTRO_SISTEMA;
  useEffect(() => {
    window.desktop.aberturaComOSistema().then(setResposta).catch(() => setResposta('erro'));
    window.desktop.version().then(setVersao).catch(() => setVersao(''));
  }, []);
  return (
    <Folha titulo="Inicialização" descricao="Como a Saga abre neste computador.">
      {erro && <div className="cfg-alerta" data-tom="perigo">{erro}</div>}
      <Secao>
        <Linha rotulo={`Abrir a Saga junto com ${sistema.nome}`}
          explica={<>Aberta pelo sistema, ela vem encolhida{sistema.encolhida} — você já entra online para o pessoal sem uma janela na cara.
            {resposta === 'erro' && ' Não deu para saber como está agora.'}
            {abertura && !abertura.disponivel && ' Só vale no app instalado.'}</>}
          travada={!abertura?.disponivel}>
          <input
            type="checkbox" role="switch" className="cfg-chave" aria-label={`Abrir a Saga junto com ${sistema.nome}`}
            disabled={!abertura?.disponivel} checked={!!abertura?.ligado}
            onChange={async (e) => {
              setErro(null);
              // O que fica marcado é o que o SISTEMA respondeu, não o que foi clicado.
              try { setResposta(await window.desktop.definirAberturaComOSistema(e.target.checked)); }
              catch (err) { setResposta('erro'); setErro((err as Error).message); }
            }}
          />
        </Linha>
      </Secao>
      {versao && (
        <Secao titulo="Versão">
          <Linha rotulo={`Saga v${versao}`} explica="A atualização é sozinha: quando sai uma versão nova, um aviso aparece no canto." />
        </Secao>
      )}
    </Folha>
  );
}
