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
const saved = (key: string, fallback: number) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : Math.max(0, Math.min(1, Number(value) || 0));
  } catch {
    return fallback;
  }
};
class Synthesizer {
  private context: AudioContext | null = null;
  private effects: GainNode | null = null;
  private music: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicNodes = new Set<OscillatorNode>();
  private samples = new Map<string, AudioBuffer>();
  private loadingSamples = false;
  private async loadSamples() {
    if (this.loadingSamples || !this.context) return;
    this.loadingSamples = true;
    const context = this.context;
    try {
      const response = await fetch('/api/audio-assets');
      if (!response.ok) return;
      const files: unknown = await response.json();
      if (!Array.isArray(files)) return;
      await Promise.allSettled(
        ['cannon', 'march', 'sail', 'horn', 'coin'].map(async (name) => {
          for (const extension of ['wav', 'ogg', 'mp3']) {
            const filename = `${name}.${extension}`;
            if (!files.includes(filename)) continue;
            try {
              const response = await fetch(`/assets/sfx/${filename}`);
              if (!response.ok) continue;
              const bytes = await response.arrayBuffer();
              if (!bytes.byteLength) continue;
              this.samples.set(name, await context.decodeAudioData(bytes));
              return;
            } catch {}
          }
        }),
      );
    } catch {}
  }
  private sample(name: string): boolean {
    const buffer = this.samples.get(name);
    if (!buffer || !this.context || !this.effects) return false;
    const node = this.context.createBufferSource();
    node.buffer = buffer;
    node.connect(this.effects);
    this.effectNodes.add(node);
    node.onended = () => {
      node.disconnect();
      this.effectNodes.delete(node);
    };
    node.start();
    return true;
  }
  private noiseBuffers = new Map<string, AudioBuffer>();
  private effectNodes = new Set<AudioScheduledSourceNode>();
  private reverb: GainNode | null = null;
  private ambience: Ambience = 'off';
  private chord = 0;
  private mutedValue = false;
  private musicValue = saved('concordia-music-volume', 0.35);
  private effectsValue = saved('concordia-effects-volume', 1);
  constructor() {
    try {
      this.mutedValue = localStorage.getItem('concordia-v3-muted') === 'true';
    } catch {}
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => {
        this.syncAmbience();
        if (document.hidden) this.stopEffects();
      });
  }
  get muted() {
    return this.mutedValue;
  }
  get musicVolume() {
    return this.musicValue;
  }
  get effectsVolume() {
    return this.effectsValue;
  }
  private save(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
  setMuted(value: boolean) {
    this.mutedValue = value;
    this.save('concordia-v3-muted', String(value));
    this.applyVolumes();
    if (value) this.stopEffects();
  }
  setMusicVolume(value: number) {
    this.musicValue = Math.max(0, Math.min(1, value));
    this.save('concordia-music-volume', String(this.musicValue));
    this.applyVolumes();
    this.syncAmbience();
  }
  setEffectsVolume(value: number) {
    this.effectsValue = Math.max(0, Math.min(1, value));
    if (this.effectsValue === 0) this.stopEffects();
    this.save('concordia-effects-volume', String(this.effectsValue));
    this.applyVolumes();
  }
  setAmbience(value: Ambience) {
    if (this.ambience === value) return;
    this.ambience = value;
    this.chord = 0;
    this.stopMusic();
    this.syncAmbience();
  }
  private applyVolumes() {
    if (!this.context) return;
    this.effects?.gain.setTargetAtTime(
      this.mutedValue ? 0 : this.effectsValue,
      this.context.currentTime,
      0.08,
    );
    this.music?.gain.setTargetAtTime(this.musicValue, this.context.currentTime, 0.2);
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.effects = this.context.createGain();
        this.music = this.context.createGain();
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.ratio.value = 5;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.18;
        this.effects.connect(limiter);
        limiter.connect(this.context.destination);
        const convolver = this.context.createConvolver();
        const impulse = this.context.createBuffer(
          2,
          Math.floor(this.context.sampleRate * 0.38),
          this.context.sampleRate,
        );
        for (let c = 0; c < 2; c++) {
          const d = impulse.getChannelData(c);
          for (let i = 0; i < d.length; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * 0.5;
        }
        convolver.buffer = impulse;
        this.reverb = this.context.createGain();
        this.reverb.gain.value = 0.18;
        this.reverb.connect(convolver);
        convolver.connect(this.effects);
        this.music.connect(this.context.destination);
        this.applyVolumes();
        void this.loadSamples();
      }
      if (this.context.state === 'suspended')
        void this.context
          .resume()
          .then(() => this.syncAmbience())
          .catch(() => {});
      this.syncAmbience();
    } catch {
      this.context = null;
    }
  }
  private tone(
    hz: number,
    at: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.08,
    music = false,
  ) {
    const ctx = this.context,
      bus = music ? this.music : this.effects;
    if (!ctx || ctx.state !== 'running' || !bus) return;
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain(),
      start = ctx.currentTime + at;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(hz, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, volume),
      start + (music ? 0.15 : 0.012),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(bus);
    if (music) this.musicNodes.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      this.musicNodes.delete(oscillator);
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
  private stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    for (const n of this.musicNodes) {
      try {
        n.stop();
      } catch {}
    }
    this.musicNodes.clear();
  }
  private syncAmbience() {
    if (
      this.ambience === 'off' ||
      this.musicValue === 0 ||
      document.hidden ||
      this.context?.state !== 'running'
    ) {
      this.stopMusic();
      return;
    }
    if (this.musicTimer) return;
    const phrase = () => {
      if (this.ambience === 'peace') {
        const chords = [
          [146.83, 220, 293.66, 349.23],
          [130.81, 196, 261.63, 329.63],
          [164.81, 220, 329.63, 392],
          [146.83, 196, 293.66, 440],
        ];
        const notes = chords[this.chord++ % chords.length];
        notes.forEach((hz, i) => {
          this.tone(hz, i * 0.24, 4.5, 'triangle', 0.08 / notes.length, true);
          this.tone(hz * 2, 0.7 + i * 0.32, 2.3, 'sine', 0.012, true);
        });
      } else {
        [0, 0.8, 1.2, 2, 2.8, 3.2, 4, 4.8, 5.2].forEach((t) => {
          this.tone(55, t, 0.3, 'sine', 0.075, true);
          this.tone(82.41, t, 0.18, 'triangle', 0.025, true);
        });
        [110, 130.81, 164.81].forEach((hz, i) =>
          this.tone(hz, i * 0.18, 5.5, 'triangle', 0.018, true),
        );
      }
    };
    phrase();
    this.musicTimer = setInterval(phrase, 6000);
  }
  private stopEffects() {
    for (const source of this.effectNodes) {
      try {
        source.stop();
      } catch {}
    }
    this.effectNodes.clear();
  }
  private ready() {
    if (this.mutedValue || this.effectsValue === 0 || document.hidden) return false;
    this.unlock();
    return this.context?.state === 'running';
  }
  private noise(color: 'white' | 'brown' | 'pink') {
    const ctx = this.context!;
    const cached = this.noiseBuffers.get(color);
    if (cached) return cached;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let brown = 0,
      p0 = 0,
      p1 = 0,
      p2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      p0 = 0.99765 * p0 + white * 0.099046;
      p1 = 0.963 * p1 + white * 0.2965164;
      p2 = 0.57 * p2 + white * 1.0526913;
      data[i] =
        color === 'white'
          ? white
          : color === 'brown'
            ? brown * 3.5
            : (p0 + p1 + p2 + white * 0.1848) * 0.18;
    }
    this.noiseBuffers.set(color, buffer);
    return buffer;
  }
  private burst(
    color: 'white' | 'brown' | 'pink',
    at: number,
    duration: number,
    type: BiquadFilterType,
    hz: number,
    volume: number,
    q = 0.7,
    sweep?: number,
    wet = false,
  ) {
    const ctx = this.context!,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      envelope = ctx.createGain(),
      start = ctx.currentTime + at;
    source.buffer = this.noise(color);
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(hz, start);
    if (sweep) {
      filter.frequency.exponentialRampToValueAtTime(sweep, start + duration * 0.5);
      filter.frequency.exponentialRampToValueAtTime(hz, start + duration);
    }
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.018, duration * 0.12));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.effects!);
    if (wet && this.reverb) envelope.connect(this.reverb);
    this.effectNodes.add(source);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      this.effectNodes.delete(source);
    };
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.01);
  }
  private resonance(hz: number, endHz: number, at: number, duration: number, volume: number) {
    const ctx = this.context!,
      source = ctx.createOscillator(),
      envelope = ctx.createGain(),
      start = ctx.currentTime + at;
    source.type = 'sine';
    source.frequency.setValueAtTime(hz, start);
    source.frequency.exponentialRampToValueAtTime(endHz, start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(envelope);
    envelope.connect(this.effects!);
    this.effectNodes.add(source);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      this.effectNodes.delete(source);
    };
    source.start(start);
    source.stop(start + duration + 0.01);
  }
  playCombatSound() {
    if (!this.ready()) return;
    if (this.sample('cannon')) return;
    this.resonance(110, 28, 0, 0.45, 0.24);
    this.burst('brown', 0, 0.65, 'lowpass', 220, 0.9, 0.7, undefined, true);
    this.burst('white', 0.015, 0.13, 'lowpass', 800, 0.17, 0.7, undefined, true);
    [0.08, 0.14, 0.215, 0.27].forEach((at) =>
      this.burst('white', at, 0.04, 'bandpass', 1200, 0.22, 1.1),
    );
    [3200, 4800].forEach((hz, i) =>
      this.burst('white', 0.18 + i * 0.06, 0.16, 'bandpass', hz, 0.09, 16),
    );
  }
  playMarchSound() {
    if (!this.ready()) return;
    if (this.sample('march')) return;
    const step = 60 / 115 / 3;
    [0, step, step * 2, step * 3].forEach((at, i) => {
      this.burst('brown', at, 0.15, 'lowpass', i % 2 ? 220 : 180, 0.6);
      this.burst('white', at + 0.012, 0.085, 'bandpass', 650, 0.1, 1.2);
      this.burst('white', at + 0.04, 0.04, 'bandpass', 2400, 0.025, 8);
    });
  }
  playSailSound() {
    if (!this.ready()) return;
    if (this.sample('sail')) return;
    this.burst('pink', 0, 0.7, 'lowpass', 300, 0.3, 0.7, 900);
    this.burst('brown', 0.09, 0.28, 'bandpass', 400, 0.16, 1.2);
    this.burst('brown', 0.25, 0.35, 'bandpass', 180, 0.12, 10, 270);
    [1260, 1739, 2851].forEach((hz, i) =>
      this.resonance(hz, hz * 0.998, 0.32, 0.5 - i * 0.07, 0.012 / (i + 1)),
    );
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
    if (!this.ready()) return;
    if (sound === 'horn' || sound === 'war') {
      if (this.sample('horn')) return;
      [174.61, 261.63, 349.23].forEach((hz, i) => this.tone(hz, i * 0.12, 0.65, 'sawtooth', 0.025));
      return;
    }
    if (sound === 'coins' && this.sample('coin')) return;
    if (sound === 'click') this.burst('brown', 0, 0.04, 'bandpass', 850, 0.1, 1);
    if (sound === 'coins')
      [2300, 3181, 4769].forEach((hz, i) => this.resonance(hz, hz * 0.998, i * 0.035, 0.16, 0.025));
    if (sound === 'alert' || sound === 'ping')
      [1046, 1442, 2358].forEach((hz, i) => this.resonance(hz, hz, 0, 0.5, 0.035 / (i + 1)));
    if (sound === 'peace' || sound === 'victory') {
      const notes =
        sound === 'victory' ? [261.63, 329.63, 392, 523.25, 659.25] : [293.66, 369.99, 440, 587.33];
      notes.forEach((hz, i) => {
        this.resonance(hz, hz * 0.999, i * 0.15, 0.7, 0.045);
        this.resonance(hz * 2.01, hz * 2, i * 0.15, 0.3, 0.01);
      });
    }
  }
}
export const audio = new Synthesizer();
export const playCombatSound = () => audio.playCombatSound();
export const playMarchSound = () => audio.playMarchSound();
export const playSailSound = () => audio.playSailSound();
