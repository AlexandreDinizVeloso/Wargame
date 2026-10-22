import { useState } from 'react';
import { Music2, Volume2, VolumeX } from 'lucide-react';
import { audio } from './audio';
export function AudioControls() {
  const [music, setMusic] = useState(audio.musicVolume),
    [effects, setEffects] = useState(audio.effectsVolume);
  return (
    <section className="audio-settings" aria-label="Volumes de áudio">
      <h3>Som da campanha</h3>
      <label>
        <Music2 size={15} />
        Música ambiente <output>{Math.round(music * 100)}%</output>
        <input
          aria-label="Volume da música"
          type="range"
          min="0"
          max="1"
          step=".05"
          value={music}
          onChange={(e) => {
            const n = Number(e.target.value);
            setMusic(n);
            audio.setMusicVolume(n);
            audio.unlock();
          }}
        />
      </label>
      <button
        aria-label={music ? 'Silenciar música' : 'Ativar música'}
        onClick={() => {
          const n = music ? 0 : 0.35;
          setMusic(n);
          audio.setMusicVolume(n);
          audio.unlock();
        }}
      >
        {music ? <Music2 size={14} /> : <VolumeX size={14} />}{' '}
        {music ? 'Silenciar música' : 'Ativar música'}
      </button>
      <label>
        <Volume2 size={15} />
        Efeitos <output>{Math.round(effects * 100)}%</output>
        <input
          aria-label="Volume dos efeitos"
          type="range"
          min="0"
          max="1"
          step=".05"
          value={effects}
          onChange={(e) => {
            const n = Number(e.target.value);
            setEffects(n);
            audio.setEffectsVolume(n);
          }}
        />
      </label>
    </section>
  );
}
