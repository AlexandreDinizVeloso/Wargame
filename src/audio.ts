import { generateSfxPCM, normalizeAndFilterPCM, type SfxName } from '../shared/audioDSP';
import {
  AUDIO_LIMITER,
  AUDIO_MIXER_DEFAULTS,
  AUDIO_MIXER_STORAGE_KEY,
  MIXER_CHANNELS,
  parseAudioMixer,
  type AudioMixerState,
  type MixerChannel,
} from '../shared/audioMixer';
export type { AudioMixerState, MixerChannel } from '../shared/audioMixer';
export { AUDIO_MIXER_DEFAULTS } from '../shared/audioMixer';
export type Sound =
  | 'horn'
  | 'click'
  | 'coins'
  | 'march'
  | 'sail'
  | 'ping'
  | 'cannon'
  | 'war'
  | 'peace'
  | 'victory'
  | 'alert';
type Ambience = 'peace' | 'war' | 'off';
type EffectChannel = Exclude<MixerChannel, 'masterVolume' | 'musicVolume'>;
const hidden = () => typeof document !== 'undefined' && document.hidden;
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const volume = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
/** Six independent buses feed one master, a safety compressor and a bounded output shaper. */
export class CampaignAudio {
  private context: AudioContext | null = null;
  private gains = new Map<MixerChannel, GainNode>();
  private values: AudioMixerState;
  private mutedValue = false;
  private legacyEffectsValue = 1;
  private listeners = new Set<() => void>();
  private samples = new Map<SfxName, AudioBuffer>();
  private musicSamples = new Map<'peace' | 'war', AudioBuffer>();
  private fallbackSamples = new Map<string, AudioBuffer>();
  private loading = false;
  private assetsReady: Promise<void> | null = null;
  private ambience: Ambience = 'off';
  private musicSource: AudioBufferSourceNode | null = null;
  private musicVoices = new Map<AudioBufferSourceNode, GainNode>();
  private effects = new Map<AudioBufferSourceNode, EffectChannel>();
  constructor() {
    const raw = read(AUDIO_MIXER_STORAGE_KEY);
    this.values = parseAudioMixer(raw);
    if (raw === null) {
      const oldMusic = read('concordia-music-volume'),
        oldEffects = read('concordia-effects-volume');
      if (oldMusic !== null && Number.isFinite(Number(oldMusic)))
        this.values.musicVolume = volume(Number(oldMusic));
      if (oldEffects !== null && Number.isFinite(Number(oldEffects))) {
        this.legacyEffectsValue = volume(Number(oldEffects));
        for (const key of ['combatVolume', 'marchVolume', 'sailVolume', 'uiVolume'] as const)
          this.values[key] *= this.legacyEffectsValue;
      }
    } else {
      try {
        this.mutedValue = JSON.parse(raw).muted === true;
      } catch {}
      const legacy = read('concordia-effects-volume');
      if (legacy !== null) this.legacyEffectsValue = volume(Number(legacy));
    }
    this.mutedValue ||= read('concordia-v3-muted') === 'true';
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        if (hidden()) {
          this.stopMusic();
          this.stopEffects();
        } else this.syncAmbience();
      });
  }
  get muted() {
    return this.mutedValue;
  }
  get mixer(): AudioMixerState {
    return { ...this.values };
  }
  get musicVolume() {
    return this.values.musicVolume;
  }
  get effectsVolume() {
    return this.legacyEffectsValue;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private save(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  private persist() {
    this.save(AUDIO_MIXER_STORAGE_KEY, JSON.stringify({ ...this.values, muted: this.mutedValue }));
    for (const listener of this.listeners) listener();
  }
  setMixerVolume(channel: MixerChannel, value: number) {
    this.values[channel] = volume(value);
    if (channel === 'musicVolume')
      this.save('concordia-music-volume', String(this.values.musicVolume));
    this.applyVolumes();
    this.persist();
    this.syncAmbience();
  }
  setMusicVolume(value: number) {
    this.setMixerVolume('musicVolume', value);
  }
  setEffectsVolume(value: number) {
    this.legacyEffectsValue = volume(value);
    for (const channel of ['combatVolume', 'marchVolume', 'sailVolume', 'uiVolume'] as const)
      this.values[channel] = this.legacyEffectsValue * AUDIO_MIXER_DEFAULTS[channel];
    if (this.legacyEffectsValue === 0) this.stopEffects();
    this.save('concordia-effects-volume', String(this.legacyEffectsValue));
    this.applyVolumes();
    this.persist();
  }
  setMuted(value: boolean) {
    this.mutedValue = value;
    this.save('concordia-v3-muted', String(value));
    this.applyVolumes();
    this.persist();
    if (value) {
      this.stopEffects();
      this.stopMusic();
    } else this.syncAmbience();
  }
  private applyVolumes() {
    if (!this.context) return;
    for (const [key, node] of this.gains)
      node.gain.setTargetAtTime(
        key === 'masterVolume' && this.mutedValue ? 0 : this.values[key],
        this.context.currentTime,
        0.035,
      );
  }
  unlock() {
    try {
      if (!this.context) {
        const context = (this.context = new AudioContext());
        for (const key of MIXER_CHANNELS) this.gains.set(key, context.createGain());
        const master = this.gains.get('masterVolume')!;
        for (const key of MIXER_CHANNELS)
          if (key !== 'masterVolume') this.gains.get(key)!.connect(master);
        const safety = context.createWaveShaper(),
          curve = new Float32Array(4097);
        for (let i = 0; i < curve.length; i++) {
          const x = (i / (curve.length - 1)) * 2 - 1;
          curve[i] = 0.94 * Math.tanh(x / 0.94);
        }
        safety.curve = curve;
        safety.oversample = '2x';
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = AUDIO_LIMITER.threshold;
        limiter.knee.value = AUDIO_LIMITER.knee;
        limiter.ratio.value = AUDIO_LIMITER.ratio;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.18;
        master.connect(limiter);
        limiter.connect(safety);
        safety.connect(context.destination);
        this.applyVolumes();
        this.assetsReady = this.loadSamples();
      }
      if (this.context.state === 'suspended')
        void this.context
          .resume()
          .then(() => this.syncAmbience())
          .catch(() => {});
      this.syncAmbience();
    } catch {
      this.context = null;
      this.gains.clear();
    }
  }
  private async decode(url: string) {
    const response = await fetch(url);
    if (!response.ok || !this.context) return null;
    const bytes = await response.arrayBuffer();
    return bytes.byteLength ? this.context.decodeAudioData(bytes) : null;
  }
  private async loadSamples() {
    if (this.loading || !this.context) return;
    this.loading = true;
    await Promise.allSettled([
      ...(['cannon', 'march', 'sail', 'horn', 'coin'] as const).map(async (name) => {
        for (const extension of ['wav', 'ogg', 'mp3'])
          try {
            const decoded = await this.decode(`/assets/sfx/${name}.${extension}`);
            if (decoded) {
              this.samples.set(name, decoded);
              return;
            }
          } catch {}
      }),
      ...(['peace', 'war'] as const).map(async (name) => {
        try {
          const decoded = await this.decode(`/assets/music/bgm-${name}.wav`);
          if (decoded) {
            this.musicSamples.set(name, decoded);
            this.syncAmbience();
          }
        } catch {}
      }),
    ]);
  }
  private bufferFromPCM(pcm: ArrayLike<number>, rate: number) {
    const buffer = this.context!.createBuffer(1, pcm.length, rate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i];
    return buffer;
  }
  private fallback(name: SfxName) {
    let buffer = this.fallbackSamples.get(name);
    if (!buffer) {
      buffer = this.bufferFromPCM(generateSfxPCM(name), 44100);
      this.fallbackSamples.set(name, buffer);
    }
    return buffer;
  }
  private uiFallback(name: Sound) {
    const key = `ui-${name}`,
      cached = this.fallbackSamples.get(key);
    if (cached) return cached;
    const duration = name === 'click' ? 0.05 : 0.4,
      data = new Float64Array(Math.round(duration * 44100));
    const frequencies =
      name === 'click'
        ? [200]
        : name === 'ping' || name === 'alert'
          ? [392, 523.25]
          : [293.6648, 369.9944, 440];
    for (let i = 0; i < data.length; i++) {
      const t = i / 44100,
        env = Math.min(1, t / 0.008) * Math.min(1, (duration - t) / 0.04) * Math.exp(-t * 8);
      data[i] =
        (frequencies.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) * env) /
        frequencies.length;
    }
    const buffer = this.bufferFromPCM(
      normalizeAndFilterPCM(data, name === 'click' ? 0.035 : 0.12, 800),
      44100,
    );
    this.fallbackSamples.set(key, buffer);
    return buffer;
  }
  private ready(channel: EffectChannel) {
    if (this.mutedValue || this.values.masterVolume === 0 || this.values[channel] === 0 || hidden())
      return false;
    this.unlock();
    return this.context?.state === 'running';
  }
  private playBuffer(buffer: AudioBuffer, channel: EffectChannel) {
    const context = this.context!,
      maximum = channel === 'combatVolume' ? 4 : channel === 'uiVolume' ? 4 : 2;
    const existing = [...this.effects].filter(([, bus]) => bus === channel);
    while (existing.length >= maximum) {
      const [node] = existing.shift()!;
      try {
        node.stop();
      } catch {}
      this.effects.delete(node);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gains.get(channel)!);
    this.effects.set(source, channel);
    source.onended = () => {
      source.disconnect();
      this.effects.delete(source);
    };
    source.start();
  }
  private stopEffects() {
    for (const source of this.effects.keys())
      try {
        source.stop();
      } catch {}
    this.effects.clear();
  }
  private stopMusic() {
    for (const [source, gain] of this.musicVoices) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
      gain.disconnect();
    }
    this.musicVoices.clear();
    this.musicSource = null;
  }
  setAmbience(value: Ambience) {
    if (this.ambience === value) return;
    this.ambience = value;
    this.syncAmbience(true);
  }
  private syncAmbience(changed = false) {
    if (!this.context || this.context.state !== 'running') return;
    if (
      this.ambience === 'off' ||
      this.values.musicVolume === 0 ||
      this.values.masterVolume === 0 ||
      this.mutedValue ||
      hidden()
    ) {
      this.stopMusic();
      return;
    }
    const buffer = this.musicSamples.get(this.ambience);
    if (!buffer) return;
    if (this.musicSource && !changed) return;
    const now = this.context.currentTime;
    if (this.musicSource) {
      const gain = this.musicVoices.get(this.musicSource);
      gain?.gain.setTargetAtTime(0, now, 0.12);
      try {
        this.musicSource.stop(now + 0.6);
      } catch {}
    }
    const source = this.context.createBufferSource(),
      fader = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(fader);
    fader.connect(this.gains.get('musicVolume')!);
    fader.gain.setValueAtTime(0, now);
    fader.gain.linearRampToValueAtTime(1, now + 0.45);
    this.musicSource = source;
    this.musicVoices.set(source, fader);
    source.onended = () => {
      source.disconnect();
      fader.disconnect();
      this.musicVoices.delete(source);
      if (this.musicSource === source) this.musicSource = null;
    };
    source.start();
  }
  playCombatSound() {
    if (this.ready('combatVolume'))
      this.playBuffer(this.samples.get('cannon') ?? this.fallback('cannon'), 'combatVolume');
  }
  playMarchSound() {
    if (this.ready('marchVolume'))
      this.playBuffer(this.samples.get('march') ?? this.fallback('march'), 'marchVolume');
  }
  playSailSound() {
    if (this.ready('sailVolume'))
      this.playBuffer(this.samples.get('sail') ?? this.fallback('sail'), 'sailVolume');
  }
  play(sound: Sound) {
    if (sound === 'cannon') {
      this.playCombatSound();
      return;
    }
    if (sound === 'march') {
      this.playMarchSound();
      return;
    }
    if (sound === 'sail') {
      this.playSailSound();
      return;
    }
    const channel: EffectChannel =
      sound === 'horn' || sound === 'war' ? 'combatVolume' : 'uiVolume';
    if (!this.ready(channel)) return;
    if (sound === 'horn' || sound === 'war')
      this.playBuffer(this.samples.get('horn') ?? this.fallback('horn'), channel);
    else if (sound === 'coins')
      this.playBuffer(this.samples.get('coin') ?? this.fallback('coin'), channel);
    else this.playBuffer(this.uiFallback(sound), channel);
  }
  private previewMusic() {
    const sample = this.musicSamples.get(this.ambience === 'war' ? 'war' : 'peace');
    if (!sample || this.context?.state !== 'running' || this.mutedValue || hidden()) return;
    const source = this.context.createBufferSource(),
      fader = this.context.createGain();
    source.buffer = sample;
    source.connect(fader);
    fader.connect(this.gains.get('musicVolume')!);
    fader.gain.setValueAtTime(0, this.context.currentTime);
    fader.gain.linearRampToValueAtTime(1, this.context.currentTime + 0.1);
    fader.gain.setValueAtTime(1, this.context.currentTime + 2.7);
    fader.gain.linearRampToValueAtTime(0, this.context.currentTime + 3);
    this.musicVoices.set(source, fader);
    source.onended = () => {
      source.disconnect();
      fader.disconnect();
      this.musicVoices.delete(source);
    };
    source.start();
    source.stop(this.context.currentTime + 3);
  }
  testChannel(channel: MixerChannel) {
    this.unlock();
    if (channel === 'musicVolume') {
      if (this.musicSamples.size) this.previewMusic();
      else void this.assetsReady?.then(() => this.previewMusic());
    } else if (channel === 'combatVolume') this.playCombatSound();
    else if (channel === 'marchVolume') this.playMarchSound();
    else if (channel === 'sailVolume') this.playSailSound();
    else this.play('coins');
  }
}
export const audio = new CampaignAudio();
export const playCombatSound = () => audio.playCombatSound();
export const playMarchSound = () => audio.playMarchSound();
export const playSailSound = () => audio.playSailSound();
