import { useEffect, useState } from 'react';
import { urlDoArquivo } from '../api';
import { estilo } from '../enquadramento';
import { Icon } from './Icon';
import { Nome } from './Nome';
import { VerImagem } from './VerImagem';
import type { PessoaNaCall } from './MenuDaPessoa';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const desde = (t: number | null | undefined) => {
  if (!t) return null;
  const d = new Date(t);
  return `${d.getDate()} de ${MESES[d.getMonth()]}. de ${d.getFullYear()}`;
};

/**
 * O perfil da pessoa em tamanho de gente: banner, foto grande, nome, cargo e desde quando
 * ela está no servidor. Clicar na foto pequena abria só a imagem esticada, o que não dizia
 * nada sobre quem é a pessoa.
 *
 * O enquadramento que ela escolheu vale aqui também — é a mesma imagem, vista de perto.
 */
export function CartaoDoPerfil({ pessoa, naVoz, souEu, onClose }: {
  pessoa: PessoaNaCall;
  /** Está numa sala de voz agora. */
  naVoz?: boolean;
  souEu?: boolean;
  onClose: () => void;
}) {
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  const bannerNoBanco = urlDoArquivo(pessoa.banner);
  // Mesma história da foto: banner que não carrega vira o banner vazio, não um rasgo.
  const [bannerQuebrado, setBannerQuebrado] = useState<string | null>(null);
  const banner = bannerNoBanco && bannerQuebrado !== bannerNoBanco ? bannerNoBanco : null;
  const foto = urlDoArquivo(pessoa.foto);
  const entrou = desde(pessoa.entrouEm);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !imagemAberta) onClose(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onClose, imagemAberta]);

  return (
    <>
      <div className="modal-back" onClick={onClose}>
        <div className="modal perfil" onClick={(e) => e.stopPropagation()}>
          <button className="icon perfil-fechar" title="Fechar" onClick={onClose}>
            <Icon name="close" />
          </button>

          <div className={`perfil-banner ${pessoa.turbo ? 'berserk' : ''} ${banner ? '' : 'vazio'}`}>
            {banner && (
              <img
                src={banner}
                alt=""
                draggable={false}
                style={estilo(pessoa.enquadramento?.banner)}
                onClick={() => setImagemAberta(banner)}
                title="Ver o banner maior"
                onError={() => setBannerQuebrado(bannerNoBanco)}
              />
            )}
          </div>

          <div className="perfil-corpo">
            <div
              className={`perfil-foto ${foto ? 'com-foto' : ''} ${pessoa.turbo ? 'berserk' : ''}`}
              onClick={() => foto && setImagemAberta(foto)}
              title={foto ? 'Ver a foto maior' : undefined}
            >
              {foto
                ? <img src={foto} alt="" draggable={false} style={estilo(pessoa.enquadramento?.foto)} />
                : pessoa.nome.slice(0, 1).toUpperCase()}
            </div>

            <div className="perfil-nome">
              <Nome nome={pessoa.nome} id={pessoa.idExibido} turbo={pessoa.turbo} />
            </div>

            <div className="perfil-selos">
              <span
                className="perfil-cargo"
                style={pessoa.cargo?.cor ? { color: pessoa.cargo.cor } : undefined}
              >
                {pessoa.cargo?.nome ?? 'Sem cargo'}
              </span>
              {souEu && <span className="perfil-selo">você</span>}
              {pessoa.turbo && (
                <span className="perfil-selo berserk"><Icon name="mjolnir" size={12} /> Berserk</span>
              )}
              {naVoz && <span className="perfil-selo ok"><Icon name="speaker" size={12} /> na call</span>}
            </div>

            <dl className="perfil-dados">
              {entrou && (
                <div><dt>No servidor desde</dt><dd>{entrou}</dd></div>
              )}
              {pessoa.idExibido && (
                <div><dt>Identificador</dt><dd>{pessoa.idExibido}</dd></div>
              )}
              <div><dt>Cargo</dt><dd>{pessoa.cargo?.nome ?? 'Sem cargo'}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      {imagemAberta && (
        <VerImagem url={imagemAberta} onClose={() => setImagemAberta(null)} />
      )}
    </>
  );
}
