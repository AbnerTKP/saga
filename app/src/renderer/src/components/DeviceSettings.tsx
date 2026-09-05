import { useEffect, useState } from 'react';
import { Room } from 'livekit-client';
import { Icon } from './Icon';

type Kind = 'audioinput' | 'audiooutput' | 'videoinput';
const labels: Record<Kind, string> = { audioinput: 'Microfone', audiooutput: 'Saída de som', videoinput: 'Câmera' };

export function DeviceSettings({ room, onClose }: { room: Room; onClose: () => void }) {
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
