import { useEffect, useRef, useState } from 'react';
import { audio, SOUNDTRACKS, type AudioMixerState, type MixerChannel, type Sound } from './audio';
import { FloatingWindow } from './FloatingWindow';
import './audio-settings.css';
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
    description: 'Cinco temas originais para paz, guerra, batalha, vitória e derrota.',
  },
  {
    key: 'combatVolume',
    name: 'Combate',
    label: 'Volume de combate',
    description: 'Canhões, mosquetes, aço, cargas e combates navais.',
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
const EFFECTS: { key: Sound; label: string }[] = [
  { key: 'cannon', label: 'Artilharia' },
  { key: 'musket', label: 'Mosquetes' },
  { key: 'steel', label: 'Aço' },
  { key: 'charge', label: 'Carga' },
  { key: 'impact', label: 'Impacto' },
  { key: 'naval', label: 'Batalha naval' },
  { key: 'march', label: 'Marcha' },
  { key: 'sail', label: 'Navegação' },
  { key: 'season', label: 'Estação' },
  { key: 'victory', label: 'Vitória' },
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
    [muted, setMuted] = useState(audio.muted),
    [tab, setTab] = useState<'mixer' | 'library'>('mixer');
  useEffect(() => () => audio.stopPreview(), []);
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
      <nav className="sound-library-tabs" aria-label="Configurações de áudio">
        <button type="button" aria-pressed={tab === 'mixer'} onClick={() => setTab('mixer')}>
          Volumes
        </button>
        <button type="button" aria-pressed={tab === 'library'} onClick={() => setTab('library')}>
          Trilha e efeitos
        </button>
      </nav>
      {tab === 'mixer' &&
        CHANNELS.map((channel) => (
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
      {tab === 'library' && (
        <section className="sound-library" aria-label="Trilha original e efeitos de Concórdia">
          <header>
            <small>TRILHA ORIGINAL · CONCÓRDIA</small>
            <h3>Uma campanha para ouvir</h3>
            <p>Os temas acompanham a paz, a guerra e o resultado das batalhas.</p>
            {audio.nowPlaying && <span>Na campanha: {audio.nowPlaying}</span>}
            {muted && <p>O som está silenciado. Ative-o no botão abaixo para ouvir.</p>}
          </header>
          <div className="sound-library-tracks">
            {SOUNDTRACKS.map((track) => (
              <button
                key={track.key}
                type="button"
                onClick={() => audio.previewTrack(track.key)}
                aria-label={`Ouvir prévia de ${track.title}`}
              >
                <span aria-hidden="true">♪</span>
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.description}</small>
                </span>
                <span className="sound-library-play" aria-hidden="true">
                  ▶
                </span>
              </button>
            ))}
          </div>
          <button className="sound-library-stop" type="button" onClick={() => audio.stopPreview()}>
            Parar prévia
          </button>
          <h4>Efeitos da campanha</h4>
          <div className="sound-library-effects">
            {EFFECTS.map((effect) => (
              <button key={effect.key} type="button" onClick={() => audio.play(effect.key)}>
                <span aria-hidden="true">▷</span> {effect.label}
              </button>
            ))}
          </div>
        </section>
      )}
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
