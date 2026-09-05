import { useCallback, useEffect, useState } from 'react';
import {
  CARGO, verServidor, renomearServidor, mudarMeuNome, moderar,
  minhaFoto, meuBanner, fotoDoServidor, bannerDoServidor,
  type Acao, type Membro, type Servidor,
} from '../api';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { EscolherImagem } from './EscolherImagem';

// Espelho da regra do servidor, só para não mostrar botão que vai ser recusado.
// Quem decide de verdade é o servidor: aqui é conveniência, não segurança.
const EXIGE: Record<Acao, number> = {
  mutar: CARGO.MODERADOR, desconectar: CARGO.MODERADOR, timeout: CARGO.MODERADOR,
  tirarTimeout: CARGO.MODERADOR, expulsar: CARGO.MODERADOR,
  banir: CARGO.DONO, desbanir: CARGO.DONO, cargo: CARGO.DONO,
};
const posso = (eu: Membro, acao: Acao, alvo: Membro) =>
  eu.id !== alvo.id && eu.cargo >= EXIGE[acao] && alvo.cargo < eu.cargo;

const emCastigo = (m: Membro) => !!m.castigoAte && m.castigoAte > Date.now();

export function PainelDoServidor({ eu, servidor, onEu, onServidor, onClose }: {
  eu: Membro; servidor: Servidor;
  onEu: (m: Membro) => void; onServidor: (s: Servidor) => void; onClose: () => void;
}) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [nomeServidor, setNomeServidor] = useState(servidor.nome);
  const [meuNome, setMeuNome] = useState(eu.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const r = await verServidor();
      setMembros(r.membros);
    } catch (e) { setErro((e as Error).message); }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  const agir = async (acao: Acao, alvo: Membro, extra?: { minutos?: number; cargo?: number }) => {
    setErro(null); setAviso(null); setOcupado(true);
    try {
      await moderar(acao, alvo.id, extra);
      setAviso(`Feito: ${acao} em ${alvo.nome}.`);
      await recarregar();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  const salvarNomeServidor = async () => {
    setErro(null); setOcupado(true);
    try { onServidor((await renomearServidor(nomeServidor)).servidor); setAviso('Nome do servidor salvo.'); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  const salvarMeuNome = async () => {
    setErro(null); setOcupado(true);
    try {
      const r = await mudarMeuNome(meuNome);
      onEu(r.eu); setMeuNome(r.eu.nome); setAviso('Seu nome foi salvo.');
      await recarregar();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{servidor.nome}</span>
          <button className="link" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>

        {/* O cabeçalho fica; o resto rola. Antes as seções cresciam junto com a lista de
            pessoas e transbordavam para fora do modal. */}
        <div className="painel-corpo">
        {erro && <div className="error">{erro}</div>}
        {aviso && <div className="aviso-ok">{aviso}</div>}

        <section className="painel-bloco">
          <h3>Seu perfil</h3>
          <div className="imagens">
            <EscolherImagem
              rotulo="Sua foto" formato="redondo" atual={eu.foto}
              onEnviar={async (a) => { setErro(null); try { onEu((await minhaFoto(a)).eu); await recarregar(); } catch (e) { setErro((e as Error).message); } }}
            />
            <EscolherImagem
              rotulo="Seu banner (aceita GIF)" formato="faixa" atual={eu.banner}
              onEnviar={async (a) => { setErro(null); try { onEu((await meuBanner(a)).eu); } catch (e) { setErro((e as Error).message); } }}
            />
          </div>
          <p className="muted small">
            Seu nome aqui é o que os outros veem. O apelido de entrada continua <b>{eu.apelido}</b> e não muda.
          </p>
          <div className="linha-campo">
            <input value={meuNome} onChange={(e) => setMeuNome(e.target.value)} maxLength={32} />
            <button onClick={salvarMeuNome} disabled={ocupado || meuNome === eu.nome}>Salvar</button>
          </div>
        </section>

        {eu.cargo >= CARGO.DONO && (
          <section className="painel-bloco">
            <h3>O servidor</h3>
            <div className="imagens">
              <EscolherImagem
                rotulo="Foto do servidor" formato="redondo" atual={servidor.foto}
                onEnviar={async (a) => { setErro(null); try { onServidor((await fotoDoServidor(a)).servidor); } catch (e) { setErro((e as Error).message); } }}
              />
              <EscolherImagem
                rotulo="Banner do servidor (aceita GIF)" formato="faixa" atual={servidor.banner}
                onEnviar={async (a) => { setErro(null); try { onServidor((await bannerDoServidor(a)).servidor); } catch (e) { setErro((e as Error).message); } }}
              />
            </div>
            <div className="linha-campo">
              <input value={nomeServidor} onChange={(e) => setNomeServidor(e.target.value)} maxLength={40} />
              <button onClick={salvarNomeServidor} disabled={ocupado || nomeServidor === servidor.nome}>Salvar</button>
            </div>
          </section>
        )}

        <section className="painel-bloco">
          <h3>Pessoas <span className="count">{membros.length}</span></h3>
          <ul className="membros">
            {membros.map((m) => (
              <li key={m.id} className={m.banido ? 'banido' : ''}>
                <Avatar nome={m.nome} foto={m.foto} />
                <div className="quem">
                  <div className="strong">
                    {m.nome}
                    {m.id === eu.id && <span className="muted small"> (você)</span>}
                  </div>
                  <div className="muted small">
                    {m.cargoNome} · {m.apelido}
                    {m.banido && ` · banido por ${m.banidoPor ?? 'alguém'}`}
                    {emCastigo(m) && ` · de castigo até ${new Date(m.castigoAte!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                </div>

                <div className="acoes">
                  {posso(eu, 'mutar', m) && (
                    <button title="Mutar o microfone" disabled={ocupado} onClick={() => agir('mutar', m)}>
                      <Icon name="micOff" size={14} />
                    </button>
                  )}
                  {posso(eu, 'desconectar', m) && (
                    <button title="Tirar da call" disabled={ocupado} onClick={() => agir('desconectar', m)}>
                      <Icon name="hangup" size={14} />
                    </button>
                  )}
                  {posso(eu, 'timeout', m) && (emCastigo(m)
                    ? <button title="Tirar do castigo" disabled={ocupado} onClick={() => agir('tirarTimeout', m)}>livrar</button>
                    : <button title="Castigo de 10 minutos" disabled={ocupado} onClick={() => agir('timeout', m, { minutos: 10 })}>castigo</button>
                  )}
                  {posso(eu, 'expulsar', m) && (
                    <button title="Expulsar (pode voltar)" disabled={ocupado} onClick={() => agir('expulsar', m)}>expulsar</button>
                  )}
                  {posso(eu, 'banir', m) && (m.banido
                    ? <button title="Desbanir" disabled={ocupado} onClick={() => agir('desbanir', m)}>desbanir</button>
                    : <button className="danger" title="Banir para sempre" disabled={ocupado} onClick={() => agir('banir', m)}>banir</button>
                  )}
                  {posso(eu, 'cargo', m) && (
                    <select
                      value={m.cargo}
                      disabled={ocupado}
                      onChange={(e) => agir('cargo', m, { cargo: Number(e.target.value) })}
                      title="Cargo"
                    >
                      <option value={CARGO.MEMBRO}>Membro</option>
                      <option value={CARGO.MODERADOR}>Moderador</option>
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
        </div>
      </div>
    </div>
  );
}
