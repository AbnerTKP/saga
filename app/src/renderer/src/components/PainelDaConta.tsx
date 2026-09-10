import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';
import {
  mudarMeuNome, minhaFoto, meuBanner, usarGif, salvarEnquadramento, type Membro,
} from '../api';
import { lerQualidadeGuardada, guardarQualidade } from '../useRoom';
import { qualidadesDe, qualidadeValida, COMO_SE_LE, TODAS, type Qualidade } from '../qualidades';
import { Icon } from './Icon';
import { EscolherImagem } from './EscolherImagem';
import { BlocosDaSaga } from './PainelDaSaga';
import type { AberturaComOSistema } from '../desktop';
import { useFecharComEsc } from '../useFechar';

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
 * Tudo que é seu, num lugar só, atrás da engrenagem.
 *
 * A sua foto e o seu nome moravam dentro das configurações do SERVIDOR, junto de salas e
 * cargos — e não são do servidor: a conta é global e a foto vai com você para todos eles.
 * Mudar de cara pelo painel de um servidor específico não faz sentido nenhum, e era o
 * único caminho que existia. A engrenagem já era "as suas coisas" (microfone, câmera);
 * agora é isso e o resto de você.
 */
export function PainelDaConta({
  eu, room, servidorNome, souBerserk, donoDaSaga, volumeDoSoundboard, onVolumeDoSoundboard, onEu, onRegistro, onClose,
}: {
  eu: Membro;
  room: Room;
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
  /** Só o dono da Saga vê o que vale em todos os servidores. */
  donoDaSaga: boolean;
  /** Quanto alto os sons do soundboard chegam AQUI — os seus e os dos outros. */
  volumeDoSoundboard: number;
  onVolumeDoSoundboard: (v: number) => void;
  onEu: (m: Membro) => void;
  onRegistro: () => void;
  onClose: () => void;
}) {
  // Esc fecha: uma saída que não depende de acertar o X — ver useFechar.ts.
  useFecharComEsc(onClose);
  const [meuNome, setMeuNome] = useState(eu.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // 'erro' e null são coisas diferentes: null é "ainda perguntando", 'erro' é "perguntei e
  // não soube". Nenhum dos dois pode virar uma chave desligada na tela, que seria afirmar
  // que não abre com o sistema sem ter como saber.
  const [respostaDoInicio, setRespostaDoInicio] = useState<AberturaComOSistema | 'erro' | null>(null);
  const abertura = respostaDoInicio && respostaDoInicio !== 'erro' ? respostaDoInicio : null;
  const sistema = SISTEMAS[window.desktop.platform] ?? OUTRO_SISTEMA;

  const [qualidade, setQualidade] = useState<Qualidade>(() => qualidadeValida(lerQualidadeGuardada(), souBerserk));
  const permitidas = qualidadesDe(souBerserk);
  const [aparelhos, setAparelhos] = useState<Record<Kind, MediaDeviceInfo[]>>({ audioinput: [], audiooutput: [], videoinput: [] });
  const [emUso, setEmUso] = useState<Record<Kind, string>>({
    audioinput: room.getActiveDevice('audioinput') ?? '',
    audiooutput: room.getActiveDevice('audiooutput') ?? '',
    videoinput: room.getActiveDevice('videoinput') ?? '',
  });

  useEffect(() => {
    window.desktop.aberturaComOSistema()
      .then(setRespostaDoInicio)
      .catch(() => setRespostaDoInicio('erro'));
  }, []);

  useEffect(() => {
    (async () => {
      const [a, o, v] = await Promise.all([
        Room.getLocalDevices('audioinput', true),
        Room.getLocalDevices('audiooutput', true),
        Room.getLocalDevices('videoinput', true),
      ]);
      setAparelhos({ audioinput: a, audiooutput: o, videoinput: v });
    })();
  }, []);

  const trocar = async (kind: Kind, id: string) => {
    setEmUso((s) => ({ ...s, [kind]: id }));
    await room.switchActiveDevice(kind, id).catch(() => undefined);
  };

  const salvarMeuNome = async () => {
    setErro(null); setOcupado(true);
    try { const r = await mudarMeuNome(meuNome); onEu(r.eu); setMeuNome(r.eu.nome); }
    catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
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

              {(Object.keys(APARELHOS) as Kind[]).map((kind) => (
                <label key={kind}>
                  {APARELHOS[kind]}
                  <select value={emUso[kind]} onChange={(e) => trocar(kind, e.target.value)}>
                    <option value="">Padrão do sistema</option>
                    {aparelhos[kind].map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
                  </select>
                </label>
              ))}
              <p className="muted small">Cancelamento de eco e supressão de ruído ficam sempre ligados.</p>
            </div>
          </section>

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

          {donoDaSaga && <BlocosDaSaga meuId={eu.id} />}

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
