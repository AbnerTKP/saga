import { useCallback, useEffect, useState } from 'react';
import {
  pode, podeSobre, verServidor, renomearServidor, mudarMeuNome, moderar,
  minhaFoto, meuBanner, fotoDoServidor, bannerDoServidor, usarGif,
  criarSala, renomearSala, apagarSala,
  criarCargo, editarCargo, apagarCargo,
  type Acao, type AcaoDeModeracao, type Cargo, type CargoNovo, type Membro,
  type Permissao, type Servidor, type Sala, type TipoDeSala,
} from '../api';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { Nome } from './Nome';
import { EscolherImagem } from './EscolherImagem';

// Espelho da regra do servidor, só para não mostrar botão que será recusado. Quem decide
// de verdade é o servidor: aqui é conveniência, não segurança.
const PERMISSAO_DE: Record<AcaoDeModeracao, Permissao> = {
  mutar: 'mutar', desconectar: 'desconectar', timeout: 'timeout', tirarTimeout: 'timeout',
  expulsar: 'expulsar', banir: 'banir', desbanir: 'banir', cargo: 'definirCargo',
};
const posso = (eu: Membro, acao: AcaoDeModeracao, alvo: Membro) =>
  podeSobre(eu, PERMISSAO_DE[acao], alvo);

const emCastigo = (m: Membro) => !!m.castigoAte && m.castigoAte > Date.now();

export function PainelDoServidor({ eu, servidor, onEu, onServidor, onClose }: {
  eu: Membro; servidor: Servidor;
  onEu: (m: Membro) => void; onServidor: (s: Servidor) => void; onClose: () => void;
}) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [permissoes, setPermissoes] = useState<Record<string, string>>({});
  const [editando, setEditando] = useState<CargoNovo & { id?: number } | null>(null);
  const [novaSala, setNovaSala] = useState('');
  const [tipoNovo, setTipoNovo] = useState<TipoDeSala>('voz');
  const [nomeServidor, setNomeServidor] = useState(servidor.nome);
  const [meuNome, setMeuNome] = useState(eu.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const r = await verServidor();
      setMembros(r.membros);
      setSalas(r.salas);
      setCargos(r.cargos);
      setPermissoes(r.permissoes);
    } catch (e) { setErro((e as Error).message); }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  const agir = async (
    acao: Acao,
    alvo: Membro,
    extra?: { minutos?: number; cargo?: number; turbo?: boolean; idExibido?: string },
  ) => {
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
              onGif={async (url) => { setErro(null); const r = await usarGif('usuario.foto', url); if (r.eu) { onEu(r.eu); await recarregar(); } }}
            />
            <EscolherImagem
              rotulo="Seu banner" formato="faixa" atual={eu.banner}
              onEnviar={async (a) => { setErro(null); try { onEu((await meuBanner(a)).eu); } catch (e) { setErro((e as Error).message); } }}
              onGif={async (url) => { setErro(null); const r = await usarGif('usuario.banner', url); if (r.eu) onEu(r.eu); }}
            />
          </div>
          <p className="muted small">
            Seu nome aqui é o que os outros veem. O apelido de entrada continua <b>{eu.apelido}</b> e não muda.
            {!eu.turbo && ' Imagem animada é do Vorcaro Turbo; parada, todo mundo pode.'}
          </p>
          <div className="linha-campo">
            <input value={meuNome} onChange={(e) => setMeuNome(e.target.value)} maxLength={32} />
            <button onClick={salvarMeuNome} disabled={ocupado || meuNome === eu.nome}>Salvar</button>
          </div>
        </section>

        {pode(eu.cargo, 'gerirServidor') && (
          <section className="painel-bloco">
            <h3>O servidor</h3>
            <div className="imagens">
              <EscolherImagem
                rotulo="Foto do servidor" formato="redondo" atual={servidor.foto}
                onEnviar={async (a) => { setErro(null); try { onServidor((await fotoDoServidor(a)).servidor); } catch (e) { setErro((e as Error).message); } }}
                onGif={async (url) => { setErro(null); const r = await usarGif('servidor.foto', url); if (r.servidor) onServidor(r.servidor); }}
              />
              <EscolherImagem
                rotulo="Banner do servidor" formato="faixa" atual={servidor.banner}
                onEnviar={async (a) => { setErro(null); try { onServidor((await bannerDoServidor(a)).servidor); } catch (e) { setErro((e as Error).message); } }}
                onGif={async (url) => { setErro(null); const r = await usarGif('servidor.banner', url); if (r.servidor) onServidor(r.servidor); }}
              />
            </div>
            <div className="linha-campo">
              <input value={nomeServidor} onChange={(e) => setNomeServidor(e.target.value)} maxLength={40} />
              <button onClick={salvarNomeServidor} disabled={ocupado || nomeServidor === servidor.nome}>Salvar</button>
            </div>
          </section>
        )}

        {pode(eu.cargo, 'gerirSalas') && (
          <section className="painel-bloco">
            <h3>Salas <span className="count">{salas.length}</span></h3>
            <p className="muted small">
              Sala de voz é onde se conversa; sala de texto ocupa a tela e guarda o que
              foi escrito. Não dá para apagar a última — sem sala, ninguém teria para onde ir.
            </p>

            <ul className="lista-salas">
              {salas.map((s) => (
                <li key={s.id}>
                  <span className="tipo-da-sala">{s.tipo === 'texto' ? 'texto' : 'voz'}</span>
                  <input
                    defaultValue={s.nome}
                    maxLength={32}
                    title="ENTER renomeia"
                    disabled={ocupado}
                    onKeyDown={async (e) => {
                      if (e.key !== 'Enter') return;
                      const nome = (e.target as HTMLInputElement).value;
                      setErro(null); setOcupado(true);
                      try { await renomearSala(s.id, nome); setAviso('Sala renomeada.'); await recarregar(); }
                      catch (err) { setErro((err as Error).message); } finally { setOcupado(false); }
                    }}
                  />
                  <button
                    className="danger"
                    disabled={ocupado || salas.length <= 1}
                    title={salas.length <= 1 ? 'É a única sala' : `Apagar ${s.nome} e tudo que foi escrito nela`}
                    onClick={async () => {
                      setErro(null); setOcupado(true);
                      try { await apagarSala(s.id); setAviso('Sala apagada.'); await recarregar(); }
                      catch (err) { setErro((err as Error).message); } finally { setOcupado(false); }
                    }}
                  >
                    apagar
                  </button>
                </li>
              ))}
            </ul>

            <div className="linha-campo" style={{ marginTop: 10 }}>
              <input
                placeholder="Nome da sala nova"
                value={novaSala}
                maxLength={32}
                onChange={(e) => setNovaSala(e.target.value)}
              />
              <select value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value as TipoDeSala)}>
                <option value="voz">Voz</option>
                <option value="texto">Texto</option>
              </select>
              <button
                disabled={ocupado || !novaSala.trim()}
                onClick={async () => {
                  setErro(null); setOcupado(true);
                  try { await criarSala(novaSala, tipoNovo); setNovaSala(''); setAviso('Sala criada.'); await recarregar(); }
                  catch (err) { setErro((err as Error).message); } finally { setOcupado(false); }
                }}
              >
                Criar
              </button>
            </div>
          </section>
        )}

        {pode(eu.cargo, 'gerirCargos') && (
          <section className="painel-bloco">
            <h3>Cargos <span className="count">{cargos.length}</span></h3>
            <p className="muted small">
              O nível decide a hierarquia: ninguém age sobre alguém de nível igual ou
              maior. O cargo de dono tem tudo e não se edita.
            </p>

            <ul className="lista-cargos">
              {cargos.map((c) => (
                <li key={c.id} className={c.dono ? 'intocavel' : ''}>
                  <span className="bolinha-cargo" style={{ background: c.cor ?? 'var(--text3)' }} />
                  <span className="nome-cargo">{c.nome}</span>
                  <span className="muted small">nível {c.nivel}</span>
                  <span className="muted small">
                    {c.dono ? 'tudo' : `${c.permissoes.length} permiss${c.permissoes.length === 1 ? 'ão' : 'ões'}`}
                  </span>
                  {!c.dono && (
                    <>
                      <button disabled={ocupado} onClick={() => setEditando({ ...c })}>editar</button>
                      <button
                        className="danger"
                        disabled={ocupado}
                        title={`Apagar ${c.nome}. Quem estiver nele desce para o cargo mais baixo.`}
                        onClick={async () => {
                          setErro(null); setOcupado(true);
                          try { await apagarCargo(c.id); setAviso('Cargo apagado.'); await recarregar(); }
                          catch (err) { setErro((err as Error).message); } finally { setOcupado(false); }
                        }}
                      >
                        apagar
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            {editando ? (
              <div className="editor-cargo">
                <div className="linha-campo">
                  <input
                    placeholder="Nome do cargo"
                    value={editando.nome}
                    maxLength={24}
                    onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                  />
                  <input
                    type="color"
                    className="cor-cargo"
                    value={editando.cor ?? '#99aab5'}
                    title="Cor do nome"
                    onChange={(e) => setEditando({ ...editando, cor: e.target.value })}
                  />
                  <input
                    type="number"
                    className="nivel-cargo"
                    min={1}
                    max={99}
                    value={editando.nivel}
                    title="Nível: 1 a 99"
                    onChange={(e) => setEditando({ ...editando, nivel: Number(e.target.value) })}
                  />
                </div>

                <div className="permissoes">
                  {Object.entries(permissoes).map(([chave, descricao]) => (
                    <label key={chave} className="check">
                      <input
                        type="checkbox"
                        checked={editando.permissoes.includes(chave as Permissao)}
                        onChange={(e) => setEditando({
                          ...editando,
                          permissoes: e.target.checked
                            ? [...editando.permissoes, chave as Permissao]
                            : editando.permissoes.filter((p) => p !== chave),
                        })}
                      />
                      {descricao}
                    </label>
                  ))}
                </div>

                <div className="linha-campo">
                  <button
                    className="primary"
                    disabled={ocupado || !editando.nome.trim()}
                    onClick={async () => {
                      setErro(null); setOcupado(true);
                      try {
                        const dados = {
                          nome: editando.nome, cor: editando.cor,
                          nivel: editando.nivel, permissoes: editando.permissoes,
                        };
                        if (editando.id) await editarCargo(editando.id, dados);
                        else await criarCargo(dados);
                        setEditando(null); setAviso('Cargo salvo.'); await recarregar();
                      } catch (err) { setErro((err as Error).message); } finally { setOcupado(false); }
                    }}
                  >
                    Salvar
                  </button>
                  <button onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button
                style={{ marginTop: 10 }}
                onClick={() => setEditando({ nome: '', cor: '#99aab5', nivel: 20, permissoes: [] })}
              >
                Criar cargo
              </button>
            )}
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
                    <Nome membro={m} />
                    {m.turbo && <span className="selo-turbo" title="Vorcaro Turbo">TURBO</span>}
                    {m.id === eu.id && <span className="muted small"> (você)</span>}
                  </div>
                  <div className="muted small">
                    <span style={m.cargo?.cor ? { color: m.cargo.cor } : undefined}>{m.cargoNome}</span> · {m.apelido}
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
                  {pode(eu.cargo, 'concederTurbo') && (
                    <button
                      className={m.turbo ? 'turbo-on' : ''}
                      title={m.turbo ? 'Tirar o Vorcaro Turbo' : 'Dar Vorcaro Turbo'}
                      disabled={ocupado}
                      onClick={() => agir('turbo', m, { turbo: !m.turbo })}
                    >
                      turbo
                    </button>
                  )}
                  {pode(eu.cargo, 'definirId') && (
                    <input
                      className="campo-id"
                      defaultValue={m.idExibido ?? ''}
                      placeholder="id"
                      maxLength={8}
                      title="Identificador que aparece antes do nome. ENTER salva."
                      disabled={ocupado}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        agir('id', m, { idExibido: (e.target as HTMLInputElement).value });
                      }}
                    />
                  )}
                  {posso(eu, 'cargo', m) && (
                    <select
                      value={m.cargo?.id ?? ''}
                      disabled={ocupado}
                      onChange={(e) => agir('cargo', m, { cargo: Number(e.target.value) })}
                      title="Cargo"
                    >
                      {cargos
                        .filter((c) => !c.dono && c.nivel < (eu.cargo?.nivel ?? 0))
                        .map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
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
