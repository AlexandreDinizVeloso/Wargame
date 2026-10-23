export const AUDIO_MIXER_STORAGE_KEY = 'concordia.audioMixer.v1';
export const AUDIO_MIXER_DEFAULTS = Object.freeze({
  masterVolume: 0.8,
  musicVolume: 0.75,
  combatVolume: 0.45,
  marchVolume: 0.3,
  sailVolume: 0.25,
  uiVolume: 0.5,
});
export const AUDIO_LIMITER = Object.freeze({ threshold: -10, knee: 12, ratio: 8 });
export type MixerChannel = keyof typeof AUDIO_MIXER_DEFAULTS;
export type AudioMixerState = Record<MixerChannel, number>;
export const MIXER_CHANNELS = Object.keys(AUDIO_MIXER_DEFAULTS) as MixerChannel[];
export function parseAudioMixer(raw: string | null | undefined): AudioMixerState {
  const state = { ...AUDIO_MIXER_DEFAULTS } as AudioMixerState;
  try {
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === 'object' && !Array.isArray(saved))
      for (const key of MIXER_CHANNELS) {
        const value = (saved as Record<string, unknown>)[key];
        if (typeof value === 'number' && Number.isFinite(value))
          state[key] = Math.max(0, Math.min(1, value));
      }
  } catch {}
  return state;
}
