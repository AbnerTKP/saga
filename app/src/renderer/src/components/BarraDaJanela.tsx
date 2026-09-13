import { useEffect, useState } from 'react';
import logo from '../marca.png';
import { BotaoDeRelatar } from './Relatar';

/**
 * A barra da janela no Windows — a do sistema saiu, e esta entra no lugar.
 *
 * Só fora do Mac: lá os botões são os do sistema, e o uso já é o de lá. Aqui ela é a
 * mesma faixa que o Mac tem (logo e "Saga", 34 px), com os três botões na ponta direita.
 * Foi a escolha do dono entre três desenhos: botões da altura inteira e colados na borda,
 * como no próprio Windows e no Discord, porque com a janela maximizada o CANTO da tela
 * tem de ser o fechar — jogar o mouse lá e clicar é gesto de anos.
 *
 * Ela fica acima de todas as camadas (`.barra-da-janela` em styles.css): com um painel
 * aberto, a barra do sistema continuava ali para minimizar e fechar, e a nossa também.
 */
export function BarraDaJanela() {
  const [maximizada, setMaximizada] = useState(false);

  useEffect(() => {
    let vivo = true;
    window.desktop.janela.estaMaximizada().then((m) => { if (vivo) setMaximizada(m); }).catch(() => {});
    const parar = window.desktop.janela.aoMaximizar(setMaximizada);
    return () => { vivo = false; parar(); };
  }, []);

  return (
    <div className="barra-da-janela">
      <img src={logo} alt="" width={17} height={17} />
      <span>Saga</span>
      <BotaoDeRelatar />
      <div className="barra-da-janela-botoes">
        <button title="Minimizar" aria-label="Minimizar" onClick={() => window.desktop.janela.minimizar()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 5.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          title={maximizada ? 'Restaurar' : 'Maximizar'}
          aria-label={maximizada ? 'Restaurar' : 'Maximizar'}
          onClick={() => window.desktop.janela.alternarMaximizar()}
        >
          {maximizada ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M3.5 1.5h3a2 2 0 0 1 2 2v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="1" y="3.5" width="5.5" height="5.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <rect x="1" y="1" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
        <button className="fechar" title="Fechar" aria-label="Fechar" onClick={() => window.desktop.janela.fechar()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
