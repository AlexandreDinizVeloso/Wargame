export type Sound = 'click' | 'coins' | 'march' | 'cannon' | 'war' | 'peace' | 'victory' | 'alert';
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
      document.addEventListener('visibilitychange', () => this.syncAmbience());
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
  }
  setMusicVolume(value: number) {
    this.musicValue = Math.max(0, Math.min(1, value));
    this.save('concordia-music-volume', String(this.musicValue));
    this.applyVolumes();
    this.syncAmbience();
  }
  setEffectsVolume(value: number) {
    this.effectsValue = Math.max(0, Math.min(1, value));
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
        this.effects.connect(this.context.destination);
        this.music.connect(this.context.destination);
        this.applyVolumes();
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
  play(sound: Sound) {
    if (this.mutedValue || this.effectsValue === 0) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    const tone = this.tone.bind(this);
    if (sound === 'alert')
      [880, 660, 880].forEach((hz, i) => tone(hz, i * 0.18, 0.16, 'triangle', 0.085));
    if (sound === 'click') tone(760, 0, 0.06, 'triangle', 0.035);
    if (sound === 'coins')
      [1046, 1568, 2093].forEach((hz, i) => tone(hz, i * 0.055, 0.18, 'sine', 0.045));
    if (sound === 'march') [0, 0.15, 0.3, 0.45].forEach((t) => tone(90, t, 0.1, 'triangle', 0.07));
    if (sound === 'cannon') {
      tone(55, 0, 0.65, 'sawtooth', 0.12);
      const length = Math.floor(ctx.sampleRate * 0.5),
        buffer = ctx.createBuffer(1, length, ctx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++)
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.2));
      const noise = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      noise.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      gain.gain.value = 0.12;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.effects!);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      noise.start();
    }
    if (sound === 'war')
      [196, 246.94, 293.66, 392].forEach((hz, i) => tone(hz, i * 0.16, 0.35, 'sawtooth', 0.055));
    if (sound === 'peace' || sound === 'victory')
      (sound === 'victory'
        ? [261.63, 329.63, 392, 523.25, 659.25]
        : [293.66, 369.99, 440, 587.33]
      ).forEach((hz, i) => tone(hz, i * 0.15, 0.5, 'triangle', 0.07));
  }
}
export const audio = new Synthesizer();
