import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';
import { Icon } from './Icon';
import { lerQualidadeGuardada, guardarQualidade } from '../useRoom';
import { qualidadesDe, qualidadeValida, COMO_SE_LE, TODAS, type Qualidade } from '../qualidades';

type Kind = 'audioinput' | 'audiooutput' | 'videoinput';
const labels: Record<Kind, string> = { audioinput: 'Microfone', audiooutput: 'Saída de som', videoinput: 'Câmera' };

export function DeviceSettings({ room, souTurbo, onRegistro, onClose }: {
  room: Room;
  /** 1080p e 60 quadros são do Vorcaro Turbo; sem ele, só 720p a 30. */
  souTurbo: boolean;
  onRegistro: () => void;
  onClose: () => void;
}) {
  const [qualidade, setQualidade] = useState<Qualidade>(() => qualidadeValida(lerQualidadeGuardada(), souTurbo));
  const permitidas = qualidadesDe(souTurbo);
  const [devices, setDevices] = useState<Record<Kind, MediaDeviceInfo[]>>({ audioinput: [], audiooutput: [], videoinput: [] });
  const [active, setActive] = useState<Record<Kind, string>>({
    audioinput: room.getActiveDevice('audioinput') ?? '',
    audiooutput: room.getActiveDevice('audiooutput') ?? '',
    videoinput: room.getActiveDevice('videoinput') ?? '',
  });

  useEffect(() => {
    (async () => {
      const [a, o, v] = await Promise.all([
        Room.getLocalDevices('audioinput', true),
        Room.getLocalDevices('audiooutput', true),
        Room.getLocalDevices('videoinput', true),
      ]);
      setDevices({ audioinput: a, audiooutput: o, videoinput: v });
    })();
  }, []);

  const change = async (kind: Kind, id: string) => {
    setActive((s) => ({ ...s, [kind]: id }));
    await room.switchActiveDevice(kind, id).catch(() => undefined);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="strong">Voz e vídeo</span>
          <button className="icon" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="pad form">
          <label>
            Qualidade da sua transmissão
            <select
              value={qualidade}
              onChange={(e) => {
                // Passa pela mesma régua do momento de transmitir: a lista some, mas
                // ninguém escolhe por engano o que não pode.
                const q = qualidadeValida(e.target.value, souTurbo);
                setQualidade(q);
                guardarQualidade(q);
              }}
            >
              {TODAS.map((q) => (
                <option key={q} value={q} disabled={!permitidas.includes(q)}>
                  {COMO_SE_LE[q]}{!permitidas.includes(q) ? ' — Vorcaro Turbo' : ''}
                </option>
              ))}
            </select>
            <small className="muted">
              Vale a partir da próxima vez que você compartilhar. Numa cena pesada não cabem
              nitidez e fluidez ao mesmo tempo: a 30 quadros a imagem fica nítida e os
              quadros é que caem; a 60, os quadros seguem e a imagem é que perde nitidez.
              O servidor reenvia sua transmissão para cada pessoa na sala, então quanto mais
              gente, mais pesa.
              {!souTurbo && ' 1080p e 60 quadros são do Vorcaro Turbo.'}
            </small>
          </label>

          <div className="linha-campo">
            <button type="button" onClick={onRegistro}>Ver registro de erros</button>
          </div>

          {(Object.keys(labels) as Kind[]).map((kind) => (
            <label key={kind}>
              {labels[kind]}
              <select value={active[kind]} onChange={(e) => change(kind, e.target.value)}>
                <option value="">Padrão do sistema</option>
                {devices[kind].map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
              </select>
            </label>
          ))}
          <p className="muted small">Cancelamento de eco e supressão de ruído ficam sempre ligados.</p>
        </div>
      </div>
    </div>
  );
}
