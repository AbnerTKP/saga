import { useState } from 'react';
import { editarSala, type Cargo, type Membro, type RoomInfo } from '../api';
import { Icon } from './Icon';
import { useFecharComEsc } from '../useFechar';

/**
 * Quem enxerga esta sala.
 *
 * Por CARGO, e não por pessoa: é assim que o resto do servidor pensa, e é o que faz cargo
 * novo, pessoa que muda de cargo e pessoa que chega herdarem o acesso sem ninguém refazer
 * lista nenhuma.
 *
 * Trancada aqui quer dizer INVISÍVEL, e o texto diz isso: uma sala que aparece e recusa a
 * entrada é um convite a perguntar "por que eu não entro aí?".
 */
export function QuemPodeVer({ sala, cargos, eu, onPronto, onClose }: {
  sala: RoomInfo;
  cargos: Cargo[];
  /** Para avisar quando quem está trancando fica de fora da própria sala. */
  eu: Membro;
  onPronto: () => void;
  onClose: () => void;
}) {
  useFecharComEsc(onClose);
  const [privada, setPrivada] = useState(!!sala.privada);
  const [escolhidos, setEscolhidos] = useState<number[]>(sala.cargos ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const trocar = (id: number) =>
    setEscolhidos((antes) => (antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id]));

  /**
   * Quem tranca pode ficar de fora da própria sala, e é bom saber ANTES.
   *
   * Não é impedido: quem criou o servidor continua vendo tudo e pode desfazer. Mas
   * trancar uma sala e ela sumir da sua própria lista, sem aviso, é do tipo de surpresa
   * que faz a pessoa achar que apagou a sala sem querer.
   */
  const vouMeExcluir = privada && !eu.cargo?.dono && !escolhidos.includes(eu.cargo?.id ?? -1);

  const salvar = async () => {
    setErro(null); setOcupado(true);
    try {
      await editarSala(sala.id, { privada, cargos: privada ? escolhidos : [] });
      onPronto();
      onClose();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Quem pode ver #{sala.name}</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="pad form">
          <label className="check">
            <input type="checkbox" checked={privada} onChange={(e) => setPrivada(e.target.checked)} />
            <span>Só quem eu escolher</span>
          </label>
          <p className="muted small" style={{ marginTop: -6 }}>
            {privada
              ? 'Para quem não estiver na lista, a sala não aparece — nem na barra, nem no chat, nem na voz.'
              : 'Todo mundo do servidor vê esta sala.'}
          </p>

          {privada && (
            <div className="lista-de-cargos">
              {cargos.length === 0 && <p className="muted small">Este servidor ainda não tem cargos.</p>}
              {cargos.slice().sort((a, b) => b.nivel - a.nivel).map((c) => (
                <label key={c.id} className="check">
                  <input type="checkbox" checked={escolhidos.includes(c.id)} onChange={() => trocar(c.id)} />
                  <span style={c.cor ? { color: c.cor } : undefined}>{c.nome}</span>
                  <span className="muted small">nível {c.nivel}</span>
                </label>
              ))}
              {/* Quem criou o servidor não entra na lista porque não precisa: ele vê tudo,
                  e é a saída para uma sala que ficou sem cargo nenhum por engano. */}
              <p className="muted small">Quem criou o servidor vê todas as salas, sempre.</p>
            </div>
          )}

          {vouMeExcluir && (
            <div className="aviso-inline">
              Do jeito que está, <b>você</b> deixa de ver esta sala: o seu cargo não está na
              lista. Quem criou o servidor pode devolver o acesso.
            </div>
          )}
          {erro && <div className="error">{erro}</div>}

          <button className="primary" disabled={ocupado} onClick={salvar}>
            {ocupado ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
