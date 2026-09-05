import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';
import { Icon } from './Icon';
import { QUALIDADES, lerQualidade, guardarQualidade, type Qualidade } from '../useRoom';

type Kind = 'audioinput' | 'audiooutput' | 'videoinput';
const labels: Record<Kind, string> = { audioinput: 'Microfone', audiooutput: 'Saída de som', videoinput: 'Câmera' };

const COMO_SE_LE: Record<Qualidade, string> = {
  '720p30':  '720p · 30 quadros — a mais leve',
  '1080p30': '1080p · 30 quadros — nítida, para slide e leitura',
  '720p60':  '720p · 60 quadros — fluida, para jogo e vídeo',
  '1080p60': '1080p · 60 quadros — a melhor, e a mais pesada',
};

export function DeviceSettings({ room, volumeDaTela, onVolumeDaTela, onClose }: {
  room: Room;
  volumeDaTela: number;
  onVolumeDaTela: (v: number) => void;
  onClose: () => void;
}) {
  const [qualidade, setQualidade] = useState<Qualidade>(lerQualidade);
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
                const q = e.target.value as Qualidade;
                setQualidade(q);
                guardarQualidade(q);
              }}
            >
              {(Object.keys(QUALIDADES) as Qualidade[]).map((q) => (
                <option key={q} value={q}>{COMO_SE_LE[q]}</option>
              ))}
            </select>
            <small className="muted">
              Vale a partir da próxima vez que você compartilhar. O servidor reenvia sua
              transmissão para cada pessoa na sala, então quanto mais gente, mais pesa.
            </small>
          </label>

          <label>
            Volume das transmissões · {Math.round(volumeDaTela * 100)}%
            <input
              type="range" min={0} max={150} value={Math.round(volumeDaTela * 100)}
              onChange={(e) => onVolumeDaTela(Number(e.target.value) / 100)}
            />
            <small className="muted">
              Só o som de quem está compartilhando tela, separado das vozes. Vale para a
              transmissão em destaque — as outras ficam mudas.
            </small>
          </label>

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
