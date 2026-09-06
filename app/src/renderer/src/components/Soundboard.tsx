import { useEffect, useRef, useState } from 'react';
import { pode, listarSons, subirSom, apagarSom, urlDoArquivo, type Membro, type Som } from '../api';
import { Icon } from './Icon';

export function Soundboard({ eu, naSala, onTocar, onParar, tocando, restantes, onClose }: {
  eu: Membro;
  naSala: boolean;
  onTocar: (url: string) => void;
  /** Corta o som que está tocando. Quem tocou não fica refém do próprio clique. */
  onParar: () => void;
  /** O endereço do som que está tocando agora, ou null. */
  tocando: string | null;
  /** Quantos ainda cabem nesta entrada na sala; `null` quando não há limite (Berserk). */
  restantes: number | null;
  onClose: () => void;
}) {
  const [sons, setSons] = useState<Som[] | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const podeGerir = pode(eu.cargo, 'gerirSons');

  const recarregar = () => listarSons().then(setSons).catch((e) => setErro((e as Error).message));
  useEffect(() => { recarregar(); }, []);

  const enviar = async (arquivo: File) => {
    setErro(null); setOcupado(true);
    try {
      await subirSom(nome.trim() || arquivo.name.replace(/\.[^.]+$/, ''), arquivo);
      setNome('');
      await recarregar();
    } catch (e) { setErro((e as Error).message); } finally {
      setOcupado(false);
      if (campo.current) campo.current.value = '';
    }
  };

  const remover = async (som: Som) => {
    setErro(null); setOcupado(true);
    try { await apagarSom(som.id); await recarregar(); }
    catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Soundboard</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {erro && <div className="error">{erro}</div>}
        {!naSala && (
          <div className="painel-bloco">
            <p className="muted small">Entre numa sala para os outros ouvirem o que você tocar.</p>
          </div>
        )}

        <section className="painel-bloco">
          {sons === null && <p className="muted small">Carregando…</p>}
          {sons?.length === 0 && (
            <p className="muted small">
              Nenhum som ainda.{podeGerir ? ' Suba o primeiro aí embaixo.' : ' Peça a quem pode subir.'}
            </p>
          )}
          <div className="sons">
            {sons?.map((s) => {
              const url = urlDoArquivo(s.arquivo)!;
              const esteToca = tocando === url;
              // Com um som no ar, os outros ficam fora de alcance: é a fila de um, dita
              // pelo botão em vez de recusada depois do clique.
              const bloqueado = !naSala || (!!tocando && !esteToca) || (!esteToca && restantes === 0);
              return (
              <div key={s.id} className={`som ${esteToca ? 'tocando' : ''}`}>
                <button
                  className="tocar"
                  disabled={bloqueado}
                  title={
                    !naSala ? 'Entre numa sala primeiro'
                    : esteToca ? `Parar ${s.nome}`
                    : tocando ? 'Espere o som que está tocando, ou pare ele'
                    : restantes === 0 ? 'Acabaram os sons desta entrada na sala — sem limite é do Berserk'
                    : `Tocar ${s.nome}`
                  }
                  onClick={() => (esteToca ? onParar() : onTocar(url))}
                >
                  <Icon name={esteToca ? 'close' : 'speaker'} size={16} />
                  <span>{s.nome}</span>
                </button>
                {podeGerir && (
                  <button className="apagar" disabled={ocupado} title={`Apagar (subido por ${s.porQuem ?? '?'})`}
                    onClick={() => remover(s)}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            );})}
          </div>

          {/* A conta só aparece para quem tem conta a fazer. */}
          {restantes !== null && naSala && (
            <p className="muted small" style={{ marginTop: 10 }}>
              {restantes > 0
                ? `Faltam ${restantes} ${restantes === 1 ? 'som' : 'sons'} nesta entrada na sala.`
                : 'Acabaram os sons desta entrada na sala.'}
              {' '}Soltar à vontade é do Berserk.
            </p>
          )}
        </section>

        {podeGerir && (
          <section className="painel-bloco">
            <h3>Subir um som</h3>
            <p className="muted small">Até 2 MB. MP3, WAV, OGG, M4A ou FLAC. Sem nome, uso o do arquivo.</p>
            <div className="linha-campo">
              <input
                placeholder="Nome do som"
                value={nome}
                maxLength={40}
                onChange={(e) => setNome(e.target.value)}
              />
              <button disabled={ocupado} onClick={() => campo.current?.click()}>
                {ocupado ? 'Enviando…' : 'Escolher arquivo'}
              </button>
            </div>
            <input
              ref={campo}
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/flac,.mp3,.wav,.ogg,.m4a,.flac"
              hidden
              onChange={(e) => { const a = e.target.files?.[0]; if (a) enviar(a); }}
            />
          </section>
        )}
      </div>
    </div>
  );
}
