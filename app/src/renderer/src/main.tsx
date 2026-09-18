import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BarraDaJanela } from './components/BarraDaJanela';
import './tokens.css';
import './styles.css';
import './configuracoes.css';
import { capturarErrosGlobais } from './registro';

capturarErrosGlobais();

// No Windows a barra da janela é do app e fica ACIMA de toda tela — atualização, entrada,
// tela inicial e o app —, por isso ela mora aqui e não em cada uma delas. No Mac não há
// nada a acrescentar: a faixa de lá continua dentro do App, com os botões do sistema.
const barraPropria = window.desktop.platform !== 'darwin';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {barraPropria ? (
      <div className="janela-propria">
        <BarraDaJanela />
        <div className="corpo-da-janela"><App /></div>
      </div>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
