import { useEffect, useRef, useState } from 'react';
import { audio, type AudioMixerState, type MixerChannel } from './audio';
import { FloatingWindow } from './FloatingWindow';
const CHANNELS: { key: MixerChannel; name: string; label: string; description: string }[] = [
  {
    key: 'masterVolume',
    name: 'Geral',
    label: 'Volume geral',
    description: 'Volume de toda a campanha.',
  },
  {
    key: 'musicVolume',
    name: 'Música',
    label: 'Volume da música',
    description: 'Cordas, alaúde e trilha estratégica em loop.',
  },
  {
    key: 'combatVolume',
    name: 'Combate',
    label: 'Volume de combate',
    description: 'Canhões graves e trompas de guerra.',
  },
  {
    key: 'marchVolume',
    name: 'Marcha',
    label: 'Volume de marcha',
    description: 'Passos curtos e abafados em terra.',
  },
  {
    key: 'sailVolume',
    name: 'Navegação',
    label: 'Volume de navegação',
    description: 'Água suave e cordas de madeira.',
  },
  {
    key: 'uiVolume',
    name: 'Interface',
    label: 'Volume da interface',
    description: 'Moedas, avisos e sinais do conselho.',
  },
];
export default function AudioSettingsModal({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLElement>(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const [mixer, setMixer] = useState<AudioMixerState>(audio.mixer),
    [muted, setMuted] = useState(audio.muted);
  useEffect(
    () =>
      audio.subscribe(() => {
        setMixer(audio.mixer);
        setMuted(audio.muted);
      }),
    [],
  );
  return (
    <FloatingWindow
      id="audio-mixer"
      rootRef={root}
      title="🔊 Mixer de Som"
      role="dialog"
      anchor="center"
      width={560}
      height={640}
      minWidth={320}
      minHeight={280}
      onClose={onClose}
      className="audio-mixer"
      bodyClassName="audio-mixer-controls"
    >
      <p>Ajuste os canais em tempo real. O volume geral controla música e efeitos.</p>
      {CHANNELS.map((channel) => (
        <section className="audio-mixer-row" key={channel.key} data-mixer-channel={channel.key}>
          <label htmlFor={`mixer-${channel.key}`}>
            <strong>{channel.name}</strong>
            <output>{Math.round(mixer[channel.key] * 100)}%</output>
          </label>
          <small>{channel.description}</small>
          <div>
            <input
              id={`mixer-${channel.key}`}
              type="range"
              aria-label={channel.label}
              min={0}
              max={1}
              step={0.01}
              value={mixer[channel.key]}
              onChange={(event) => {
                audio.setMixerVolume(channel.key, Number(event.target.value));
                audio.unlock();
              }}
            />
            <button
              type="button"
              aria-label={`Testar ${channel.name}`}
              onClick={() => audio.testChannel(channel.key)}
            >
              Testar
            </button>
          </div>
        </section>
      ))}
      <button
        type="button"
        className="audio-mixer-mute"
        aria-pressed={muted}
        onClick={() => {
          audio.setMuted(!muted);
          if (muted) audio.unlock();
        }}
      >
        {muted ? 'Ativar Todo o Som' : 'Mutar Tudo'}
      </button>
    </FloatingWindow>
  );
}
