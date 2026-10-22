export type Sound = 'click' | 'coins' | 'march' | 'cannon' | 'war' | 'peace' | 'victory' | 'alert';
class Synthesizer {
  private context: AudioContext | null = null;
  private mutedValue: boolean;
  constructor() {
    try {
      this.mutedValue = localStorage.getItem('concordia-v3-muted') === 'true';
    } catch {
      this.mutedValue = false;
    }
  }
  get muted() {
    return this.mutedValue;
  }
  setMuted(value: boolean) {
    this.mutedValue = value;
    try {
      localStorage.setItem('concordia-v3-muted', String(value));
    } catch {}
    if (value && this.context?.state === 'running') void this.context.suspend();
  }
  unlock() {
    if (this.mutedValue) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch {
      this.context = null;
    }
  }
  play(sound: Sound) {
    if (this.mutedValue) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    const tone = (
      hz: number,
      at: number,
      duration: number,
      type: OscillatorType = 'sine',
      volume = 0.08,
    ) => {
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(hz, ctx.currentTime + at);
      gain.gain.setValueAtTime(0, ctx.currentTime + at);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime + at);
      oscillator.stop(ctx.currentTime + at + duration);
    };
    if (sound === 'alert') {
      [880, 660, 880].forEach((hz, i) => tone(hz, i * 0.18, 0.16, 'triangle', 0.085));
    }
    if (sound === 'click') tone(760, 0, 0.06, 'triangle', 0.035);
    if (sound === 'coins') {
      [1046, 1568, 2093].forEach((hz, i) => tone(hz, i * 0.055, 0.18, 'sine', 0.045));
    }
    if (sound === 'march') {
      [0, 0.15, 0.3, 0.45].forEach((t) => tone(90, t, 0.1, 'triangle', 0.07));
    }
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
      gain.connect(ctx.destination);
      noise.start();
    }
    if (sound === 'war') {
      [196, 246.94, 293.66, 392].forEach((hz, i) => tone(hz, i * 0.16, 0.35, 'sawtooth', 0.055));
    }
    if (sound === 'peace' || sound === 'victory') {
      const notes =
        sound === 'victory' ? [261.63, 329.63, 392, 523.25, 659.25] : [293.66, 369.99, 440, 587.33];
      notes.forEach((hz, i) => tone(hz, i * 0.15, 0.5, 'triangle', 0.07));
    }
  }
}
export const audio = new Synthesizer();
