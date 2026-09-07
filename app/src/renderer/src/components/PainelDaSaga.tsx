import { useEffect, useState } from 'react';
import { contasDaSaga, definirBerserk, urlDoArquivo, type ContaDaSaga } from '../api';
import { Icon } from './Icon';
import { Avatar } from './Avatar';

/**
 * O painel de quem cuida da Saga — não de um servidor.
 *
 * Fica separado das configurações do servidor de propósito: o que se decide aqui vale em
 * todos eles. O Berserk é da conta, então quem o concede tem de estar no plano da conta;
 * dentro das configurações do CARDUME, ele pareceria uma distinção do CARDUME.
 */
export function PainelDaSaga({ meuId, onClose }: { meuId: number; onClose: () => void }) {
  const [contas, setContas] = useState<ContaDaSaga[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    contasDaSaga().then(setContas).catch((e) => setErro((e as Error).message));
  }, []);

  const alternar = async (c: ContaDaSaga) => {
    setErro(null); setOcupado(c.id);
    try {
      const nova = await definirBerserk(c.id, !c.berserk);
      setContas((antes) => antes?.map((x) => (x.id === nova.id ? nova : x)) ?? null);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(null); }
  };

  const filtro = busca.trim().toLowerCase();
  const lista = (contas ?? []).filter((c) => !filtro || c.apelido.toLowerCase().includes(filtro));
  const comBerserk = (contas ?? []).filter((c) => c.berserk).length;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Saga</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>

        {erro && <div className="error">{erro}</div>}

        <section className="painel-bloco">
          <h3>Berserk</h3>
          <p className="muted small">
            Vale em toda a Saga, não num servidor: quem tem, tem em todo canto.
            {contas && ` ${comBerserk} de ${contas.length} ${contas.length === 1 ? 'conta' : 'contas'}.`}
          </p>

          {contas === null && <p className="muted small">Carregando…</p>}
          {contas && contas.length > 6 && (
            <input
              placeholder="Procurar apelido"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ marginTop: 10, width: '100%' }}
            />
          )}

          <div className="contas-da-saga">
            {lista.map((c) => (
              <div key={c.id} className={`conta-da-saga ${c.berserk ? 'berserk' : ''}`}>
                <Avatar nome={c.apelido} foto={c.foto} tamanho="big" />
                <div className="conta-quem">
                  <div className="strong">
                    {c.apelido}
                    {c.id === meuId && <span className="muted small"> · você</span>}
                    {c.dono && <span className="selo-berserk" style={{ marginLeft: 6 }}>DONO</span>}
                  </div>
                  <div className="muted small">
                    {c.servidores} {c.servidores === 1 ? 'servidor' : 'servidores'}
                  </div>
                </div>
                <button
                  className={c.berserk ? 'berserk-on' : ''}
                  disabled={ocupado === c.id}
                  title={c.berserk ? 'Tirar o Berserk' : 'Dar Berserk'}
                  onClick={() => alternar(c)}
                >
                  <Icon name="berserk" size={14} /> {c.berserk ? 'tirar' : 'dar'}
                </button>
              </div>
            ))}
            {contas && lista.length === 0 && <p className="muted small">Ninguém com esse apelido.</p>}
          </div>
        </section>

        <section className="painel-bloco">
          <h3>Como isto se separa do servidor</h3>
          <p className="muted small">
            Cada servidor tem o cargo mais alto dele — que pode se chamar o que o pessoal
            quiser — e esse cargo manda naquele servidor: salas, cargos, moderação. Isto
            aqui é o que vale acima deles. Uma coisa não dá a outra.
          </p>
        </section>
      </div>
    </div>
  );
}
