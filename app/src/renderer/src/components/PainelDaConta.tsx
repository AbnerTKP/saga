import { useEffect, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Room } from 'livekit-client';
import {
  mudarMeuNome, minhaFoto, meuBanner, usarGif, salvarEnquadramento, trocarMinhaSenha,
  pedirCodigoDoEmail, confirmarEmail, desistirDoEmail, ErroDoServidor, type EstadoDoEmail, type Membro,
} from '../api';
import { lerQualidadeGuardada, guardarQualidade } from '../useRoom';
import { qualidadesDe, qualidadeValida, COMO_SE_LE, TODAS, type Qualidade } from '../qualidades';
import {
  avisoDaTroca, avisoDoCodigo, codigoCompleto, codigoDepoisDeColar, explicarFalha, formatarCodigo,
} from '../recuperacao';
import { pareceEmail } from '../email';
import { Icon } from './Icon';
import { EscolherImagem } from './EscolherImagem';
import { BlocoDoMicrofone } from './AjustesDoMicrofone';
import type { MicrofoneDaCall } from '../useMicrofone';
import type { AberturaComOSistema } from '../desktop';
import { useFecharComEsc } from '../useFechar';
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
    <section className="painel-bloco">
      <h3>E-mail</h3>
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
    </section>
  );
}

/**
 * Tudo que é seu, num lugar só, atrás da engrenagem.
 *
 * A sua foto e o seu nome moravam dentro das configurações do SERVIDOR, junto de salas e
 * cargos — e não são do servidor: a conta é global e a foto vai com você para todos eles.
 * Mudar de cara pelo painel de um servidor específico não faz sentido nenhum, e era o
 * único caminho que existia. A engrenagem já era "as suas coisas" (microfone, câmera);
 * agora é isso e o resto de você.
 */
export function PainelDaConta({
  eu, room, microfone, servidorNome, souBerserk, donoDaSaga, volumeDoSoundboard, onVolumeDoSoundboard, onEu, onRegistro, onAdministracao, onClose,
  email, onEmail,
}: {
  eu: Membro;
  /** O e-mail da conta, como veio na sessão. Sem envio e sem endereço, o bloco não aparece. */
  email: EstadoDoEmail;
  onEmail: (e: EstadoDoEmail) => void;
  room: Room;
  /** Supressão de ruído e sensibilidade — o mesmo ajuste do botão direito no microfone. */
  microfone: MicrofoneDaCall;
  /**
   * O servidor aberto, ou null quando não há nenhum.
   *
   * O nome exibido é do VÍNCULO com um servidor, não da conta — dá para ser "Bagre" num
   * e "Bagre TKP" noutro. Com os servidores de volta isso deixou de ser detalhe: sem
   * dizer de qual servidor se está falando, o campo promete uma coisa e faz outra. E sem
   * servidor nenhum ele não tem onde escrever, então não aparece.
   */
  servidorNome?: string | null;
  /** 1080p e 60 quadros são do Berserk; sem ele, só 720p a 30. */
  souBerserk: boolean;
  /** Só o dono da Saga vê a porta da administração. */
  donoDaSaga: boolean;
  /** Quanto alto os sons do soundboard chegam AQUI — os seus e os dos outros. */
  volumeDoSoundboard: number;
  onVolumeDoSoundboard: (v: number) => void;
  onEu: (m: Membro) => void;
  onRegistro: () => void;
  /** Quem chamou fecha a conta e abre a administração: dois painéis empilhados seriam dois Esc. */
  onAdministracao: () => void;
  onClose: () => void;
}) {
  // Esc fecha: uma saída que não depende de acertar o X — ver useFechar.ts.
  useFecharComEsc(onClose);
  const [meuNome, setMeuNome] = useState(eu.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // A troca de senha tem erro e acerto próprios, mostrados junto dos campos: o erro do alto
  // do painel fica longe de quem está digitando lá embaixo.
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaNovaRepetida, setSenhaNovaRepetida] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [erroDaSenha, setErroDaSenha] = useState<string | null>(null);
  const [senhaTrocada, setSenhaTrocada] = useState<string | null>(null);

  // 'erro' e null são coisas diferentes: null é "ainda perguntando", 'erro' é "perguntei e
  // não soube". Nenhum dos dois pode virar uma chave desligada na tela, que seria afirmar
  // que não abre com o sistema sem ter como saber.
  const [respostaDoInicio, setRespostaDoInicio] = useState<AberturaComOSistema | 'erro' | null>(null);
  const abertura = respostaDoInicio && respostaDoInicio !== 'erro' ? respostaDoInicio : null;
  const sistema = SISTEMAS[window.desktop.platform] ?? OUTRO_SISTEMA;

  const [qualidade, setQualidade] = useState<Qualidade>(() => qualidadeValida(lerQualidadeGuardada(), souBerserk));
  const permitidas = qualidadesDe(souBerserk);
  const [aparelhos, setAparelhos] = useState<Record<Kind, MediaDeviceInfo[]>>({ audioinput: [], audiooutput: [], videoinput: [] });
  /**
   * O que foi clicado e ainda está trocando. Fora isso, o seletor mostra o aparelho EM USO, lido
   * da sala: antes ele mostrava o clique, e a troca que falhava calada ficava parecendo feita.
   */
  const [trocando, setTrocando] = useState<Partial<Record<Kind, string>>>({});
  const [erroDoAparelho, setErroDoAparelho] = useState<Partial<Record<Kind, string>>>({});

  useEffect(() => {
    window.desktop.aberturaComOSistema()
      .then(setRespostaDoInicio)
      .catch(() => setRespostaDoInicio('erro'));
  }, []);

  // A lista acompanha o aparelho que chega e o que sai: carregada uma vez só, o microfone
  // conectado com a tela aberta não aparecia.
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

  const salvarMeuNome = async () => {
    setErro(null); setOcupado(true);
    try { const r = await mudarMeuNome(meuNome); onEu(r.eu); setMeuNome(r.eu.nome); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  };

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
    <div className="modal-back" onClick={onClose}>
      <div className="modal painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Sua conta</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="painel-corpo">
          {erro && <div className="error">{erro}</div>}

          <section className="painel-bloco">
            <h3>Seu perfil</h3>
            <div className="imagens">
              <EscolherImagem
                rotulo="Sua foto" formato="redondo" atual={eu.foto}
                papel="foto" enquadramento={eu.enquadramento?.foto}
                onEnquadrar={async (v) => { setErro(null); onEu(await salvarEnquadramento('foto', v)); }}
                onEnviar={async (a) => { setErro(null); try { onEu((await minhaFoto(a)).eu); } catch (e) { setErro((e as Error).message); } }}
                onGif={async (url) => { setErro(null); const r = await usarGif('usuario.foto', url); if (r.eu) onEu(r.eu); }}
              />
              <EscolherImagem
                rotulo="Seu banner" formato="faixa" atual={eu.banner}
                papel="banner" enquadramento={eu.enquadramento?.banner}
                onEnquadrar={async (v) => { setErro(null); onEu(await salvarEnquadramento('banner', v)); }}
                onEnviar={async (a) => { setErro(null); try { onEu((await meuBanner(a)).eu); } catch (e) { setErro((e as Error).message); } }}
                onGif={async (url) => { setErro(null); const r = await usarGif('usuario.banner', url); if (r.eu) onEu(r.eu); }}
              />
            </div>
            <p className="muted small">
              A foto e o banner são da conta: vão com você para todos os servidores. O
              apelido de entrada continua <b>{eu.apelido}</b> e não muda.
              {!eu.turbo && ' Imagem animada é do Berserk; parada, todo mundo pode.'}
            </p>
            {servidorNome && (
              <>
                <p className="muted small">
                  Já o nome que aparece é de cada servidor. Este é o seu
                  em <b>{servidorNome}</b>.
                </p>
                <div className="linha-campo">
                  <input value={meuNome} onChange={(e) => setMeuNome(e.target.value)} maxLength={32} />
                  <button onClick={salvarMeuNome} disabled={ocupado || meuNome === eu.nome}>Salvar</button>
                </div>
              </>
            )}
          </section>

          {(email.emailLigado || email.email) && <BlocoDoEmail estado={email} onEmail={onEmail} />}

          <section className="painel-bloco">
            <h3>Senha</h3>
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
              <p className="muted small">
                Trocar a senha tira a sua conta dos outros computadores em que ela estava
                aberta. Neste você continua.
              </p>
              {erroDaSenha && <div className="error">{erroDaSenha}</div>}
              {senhaTrocada && <div className="aviso-ok">{senhaTrocada}</div>}
              <div className="linha-campo">
                <button
                  type="submit"
                  className="primary sm"
                  disabled={trocandoSenha || !senhaAtual || !senhaNova || !senhaNovaRepetida}
                >
                  {trocandoSenha ? 'Trocando…' : 'Trocar senha'}
                </button>
              </div>
            </form>
          </section>

          <section className="painel-bloco">
            <h3>Voz e vídeo</h3>
            <div className="form">
              <label>
                Qualidade da sua transmissão
                <select
                  value={qualidade}
                  onChange={(e) => {
                    // Passa pela mesma régua do momento de transmitir: a lista some, mas
                    // ninguém escolhe por engano o que não pode.
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
                <small className="muted">
                  Vale a partir da próxima vez que você compartilhar. Numa cena pesada não cabem
                  nitidez e fluidez ao mesmo tempo: a 30 quadros a imagem fica nítida e os
                  quadros é que caem; a 60, os quadros seguem e a imagem é que perde nitidez.
                  O servidor reenvia sua transmissão para cada pessoa na sala, então quanto mais
                  gente, mais pesa.
                  {!souBerserk && ' 1080p e 60 quadros são do Berserk.'}
                </small>
              </label>

              {(Object.keys(APARELHOS) as Kind[]).map((kind) => {
                const { lista, nomeDoPadrao } = opcoesDoSeletor(aparelhos[kind]);
                const valor = trocando[kind] ?? valorNoSeletor(room.getActiveDevice(kind));
                return (
                  <label key={kind}>
                    {APARELHOS[kind]}
                    <select value={valor} onChange={(e) => trocar(kind, e.target.value)}>
                      <option value="">Padrão do sistema{nomeDoPadrao ? ` (${nomeDoPadrao})` : ''}</option>
                      {lista.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
                      {/* o aparelho em uso que saiu da lista continua no seletor, em vez de ele mentir outro */}
                      {valor && aparelhos[kind].length > 0 && !lista.some((d) => d.deviceId === valor) && <option value={valor}>Aparelho desconectado</option>}
                    </select>
                    {erroDoAparelho[kind] && <div className="error">{erroDoAparelho[kind]}</div>}
                  </label>
                );
              })}
            </div>
          </section>

          <BlocoDoMicrofone microfone={microfone} />

          {/* A régua do soundboard ficou só para o DONO DA SAGA, por enquanto — pedido dele em
              18/09/2026. Quem não é dono continua ouvindo no volume guardado no próprio
              computador (100% para quem nunca mexeu), e nada muda para quem toca os sons: o que
              sai para a sala é tirado antes do ganho. Para devolvê-la a todo mundo, é só apagar
              esta condição. */}
          {donoDaSaga && (
          <section className="painel-bloco">
            <h3>Soundboard</h3>
            <div className="form">
              <label>
                Volume dos sons · {Math.round(volumeDoSoundboard * 100)}%
                <input
                  type="range" min={0} max={100} value={Math.round(volumeDoSoundboard * 100)}
                  onChange={(e) => onVolumeDoSoundboard(Number(e.target.value) / 100)}
                />
                <small className="muted">
                  Vale para os sons que você OUVE — os seus e os dos outros — e já na hora:
                  dá para acertar com um som tocando. Não muda o volume com que eles chegam
                  para os outros. A voz de cada pessoa é à parte, no botão direito sobre ela.
                </small>
              </label>
            </div>
          </section>
          )}

          <section className="painel-bloco">
            <h3>Ao ligar o computador</h3>
            <label className="check">
              <input
                type="checkbox"
                disabled={!abertura?.disponivel}
                checked={!!abertura?.ligado}
                onChange={async (e) => {
                  setErro(null);
                  // O que fica marcado é o que o SISTEMA respondeu, não o que foi clicado:
                  // recusando, a chave volta sozinha em vez de mentir.
                  try { setRespostaDoInicio(await window.desktop.definirAberturaComOSistema(e.target.checked)); }
                  catch (err) { setRespostaDoInicio('erro'); setErro((err as Error).message); }
                }}
              />
              Abrir a Saga junto com {sistema.nome}
            </label>
            <p className="muted small">
              Aberta pelo sistema, ela vem encolhida{sistema.encolhida} — você já entra
              online para o pessoal sem uma janela na cara, e é só clicar no ícone para
              trazê-la à frente.
              {respostaDoInicio === 'erro' && ' Não deu para saber como está agora.'}
              {abertura && !abertura.disponivel && ' Só vale no app instalado.'}
            </p>
          </section>

          <section className="painel-bloco">
            <h3>A live por cima do jogo</h3>
            <p className="muted small">
              Assistindo a uma transmissão, o botão do quadrado com a seta manda a imagem
              para fora da Saga, numa janela que fica acima de tudo — dá para jogar e
              assistir na mesma tela. O som continua saindo pela Saga.
            </p>
            <AtalhoDoOverlay />
          </section>

          {/* O Berserk e o código de senha moravam aqui e foram para a aba Contas da
              administração, junto dos servidores todos: é lá que o dono olha a Saga inteira.
              Aqui fica a porta — e ela importa, porque quem não está em servidor nenhum não tem
              trilha onde achar a outra. A frase diz o que mudou de lugar: o dono aprendeu a gerar
              o código de senha aqui. */}
          {donoDaSaga && (
            <section className="painel-bloco">
              <h3>Administração da Saga</h3>
              <p className="muted small">
                Todos os servidores e as contas — o Berserk e o código de senha — num lugar só.
                Também abre pelo quadrado da grade na trilha.
              </p>
              <div className="linha-campo">
                <button type="button" onClick={onAdministracao}>Abrir a administração</button>
              </div>
            </section>
          )}

          <section className="painel-bloco">
            <h3>Quando alguma coisa der errado</h3>
            <p className="muted small">
              O registro guarda o que o app fez, sem senha nenhuma — é feito para circular
              no grupo quando algo não funciona na sua máquina.
            </p>
            <div className="linha-campo">
              <button type="button" onClick={onRegistro}>Ver registro de erros</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
