import {
  CINEMATIC_SFX_SPEC,
  normalizeAndFilterPCM,
  SFX_SPEC,
  seededNoise,
  type SfxName,
} from '../shared/audioDSP';
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
  | 'defeat'
  | 'musket'
  | 'steel'
  | 'charge'
  | 'impact'
  | 'naval'
  | 'season'
  | 'battle-ambience'
  | 'alert'
  | 'seal'
  | 'parchment'
  | 'steel-draw'
  | 'fanfare';

type Ambience = 'peace' | 'war' | 'off';
export type CinematicMood = 'battle' | 'victory' | 'defeat' | null;
export type MusicCue = 'peace' | 'war' | Exclude<CinematicMood, null>;

export const SOUNDTRACKS: { key: MusicCue; title: string; description: string }[] = [
  { key: 'peace', title: 'Atlas das Coroas', description: 'Paz · cordas, alaúde e flauta' },
  {
    key: 'war',
    title: 'Estandartes ao Vento',
    description: 'Guerra · violoncelos, metais e tímpanos',
  },
  {
    key: 'battle',
    title: 'Aço e Pólvora',
    description: 'Batalha · ostinato e tambores de campanha',
  },
  {
    key: 'victory',
    title: 'O Peso da Vitória',
    description: 'Vitória · fanfarra e retorno do tema',
  },
  { key: 'defeat', title: 'Depois das Cinzas', description: 'Derrota · cordas e flauta solista' },
];

type EffectChannel = Exclude<MixerChannel, 'masterVolume' | 'musicVolume'>;
const SAMPLE_RATE = 44100;
const TAU = Math.PI * 2;
const hidden = () => typeof document !== 'undefined' && document.hidden;
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const volume = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);
const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Exact phase integral of an exponential frequency sweep f(t) = f0 + df * exp(-decay * t).
 * Guarantees smooth monotonic frequency decay without negative-frequency chirp distortion.
 */
function expSweepPhase(t: number, f0: number, df: number, decay: number): number {
  if (t <= 0) return 0;
  return TAU * (f0 * t + (df / decay) * (1 - Math.exp(-decay * t)));
}

/**
 * Exact phase integral of vibrato f(t) = freq * (1 + depth * cos(2*pi*rate*t)).
 * Never multiplies time-varying frequency by t, completely preventing FM warble distortion.
 */
function vibratoPhase(t: number, freq: number, rateHz = 4.8, depth = 0.0022): number {
  if (t <= 0) return 0;
  const fadeIn = Math.min(1, t / 0.22);
  return TAU * freq * t + ((freq * depth * fadeIn) / rateHz) * Math.sin(TAU * rateHz * t);
}

/**
 * Linear multi-tap early reflections + 2-pole Butterworth low-pass filter + exact peak normalization.
 * Uses zero recursive feedback and zero nonlinear tanh clipping so waveforms stay 100% distortion-free.
 */
function finalizeCleanAcoustics(
  input: Float64Array,
  targetPeak: number,
  cutoffHz: number,
  reverbSend = 0.18,
  loop = false,
): Float64Array {
  const n = input.length;
  const reflected = new Float64Array(n);
  const taps: readonly [number, number][] = [
    [0.043, 0.28],
    [0.079, 0.22],
    [0.127, 0.16],
    [0.193, 0.11],
    [0.283, 0.07],
    [0.397, 0.045],
  ];
  for (let i = 0; i < n; i++) {
    let wet = 0;
    for (let t = 0; t < taps.length; t++) {
      const delay = Math.round(taps[t][0] * SAMPLE_RATE);
      let from = i - delay;
      if (from < 0) {
        if (!loop) continue;
        from += n;
      }
      wet += input[from] * taps[t][1];
    }
    reflected[i] = input[i] * (1 - reverbSend * 0.35) + wet * reverbSend;
  }
  return normalizeAndFilterPCM(reflected, targetPeak, cutoffHz, SAMPLE_RATE, { loop });
}

/**
 * Zero-DC Karplus-Strong physical string model for clean, warm plucked lute and concert harp.
 */
function addKarplusStrongPluck(
  left: Float64Array,
  right: Float64Array | null,
  startSec: number,
  durationSec: number,
  freq: number,
  amp: number,
  pan = 0,
  brightness = 0.58,
  seed = 101,
) {
  const start = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
  const length = Math.min(left.length - start, Math.floor(durationSec * SAMPLE_RATE));
  if (length <= 0 || freq <= 25) return;
  const period = Math.max(10, Math.round(SAMPLE_RATE / freq));
  const ring = new Float64Array(period);
  const rand = seededNoise(seed + Math.round(freq * 13));

  let smooth = 0;
  let mean = 0;
  for (let i = 0; i < period; i++) {
    smooth = smooth * (1 - brightness) + rand() * brightness;
    const window = Math.sin((Math.PI * i) / period);
    ring[i] = smooth * (0.6 + 0.4 * window);
    mean += ring[i];
  }
  mean /= period;
  let maxAbs = 0;
  for (let i = 0; i < period; i++) {
    ring[i] -= mean; // Strict zero-DC balance prevents low-frequency thumps
    maxAbs = Math.max(maxAbs, Math.abs(ring[i]));
  }
  if (maxAbs > 1e-6) {
    for (let i = 0; i < period; i++) ring[i] /= maxAbs;
  }

  const panL = right ? Math.cos(((pan + 1) * Math.PI) / 4) : 1;
  const panR = right ? Math.sin(((pan + 1) * Math.PI) / 4) : 0;
  let idx = 0;
  let prev = ring[period - 1];
  const damping = Math.min(0.9985, 0.991 + (freq < 220 ? 0.005 : 0.0035));
  const lpWeight = 0.55 + 0.2 * brightness;
  let bodyLp = 0;
  const bodyAlpha = 1 - Math.exp((-TAU * Math.min(3400, freq * 7.5)) / SAMPLE_RATE);

  for (let i = 0; i < length; i++) {
    const curr = ring[idx];
    const next = (curr * lpWeight + prev * (1 - lpWeight)) * damping;
    prev = curr;
    ring[idx] = next;
    idx = idx + 1 >= period ? 0 : idx + 1;
    bodyLp += bodyAlpha * (curr - bodyLp);
    const env =
      Math.min(1, i / (0.004 * SAMPLE_RATE)) *
      Math.min(1, (length - i) / (0.06 * SAMPLE_RATE));
    const sample = bodyLp * amp * env;
    left[start + i] += sample * panL;
    if (right) right[start + i] += sample * panR;
  }
}

/**
 * Pure additive bowed string voice with exact phase integration (zero FM warble).
 */
function bowedStringSample(freq: number, localT: number, duration: number, warmth = 1): number {
  if (localT <= 0 || localT >= duration) return 0;
  const attack = Math.min(0.22, duration * 0.25);
  const release = Math.min(0.35, duration * 0.3);
  const env =
    Math.min(1, localT / Math.max(0.015, attack)) *
    Math.min(1, (duration - localT) / Math.max(0.025, release)) *
    (0.9 + 0.1 * Math.exp(-localT * 1.4));

  const detunes = [0.9982, 1.0, 1.0019];
  let sum = 0;
  for (let d = 0; d < 3; d++) {
    const p = vibratoPhase(localT, freq * detunes[d], 4.7 + d * 0.2, 0.0018) + d * 0.9;
    const h1 = Math.sin(p);
    const h2 = Math.sin(2 * p + 0.3) * 0.36 * warmth;
    const h3 = Math.sin(3 * p + 0.8) * 0.18 * warmth;
    const h4 = Math.sin(4 * p + 1.2) * 0.08 * warmth;
    const h5 = Math.sin(5 * p + 1.7) * 0.035 * warmth;
    sum += (h1 + h2 + h3 + h4 + h5) * 0.33;
  }
  return sum * env * 0.5;
}

/**
 * Pure additive orchestral French Horn voice with dynamic harmonic bloom (zero FM distortion).
 */
function frenchHornSample(freq: number, localT: number, duration: number, brilliance = 1): number {
  if (localT <= 0 || localT >= duration) return 0;
  const attack = Math.min(0.09, duration * 0.2);
  const release = Math.min(0.24, duration * 0.28);
  const env =
    Math.min(1, localT / Math.max(0.012, attack)) *
    Math.min(1, (duration - localT) / Math.max(0.02, release));
  const bloom = (0.65 + 0.35 * Math.exp(-localT * 4.2)) * brilliance;
  const detunes = [0.9988, 1.0012];
  let sum = 0;
  for (let d = 0; d < 2; d++) {
    const p = vibratoPhase(localT, freq * detunes[d], 4.4, 0.0012) + d * 0.6;
    const wave =
      Math.sin(p) * 0.58 +
      Math.sin(2 * p + 0.2) * 0.28 * bloom +
      Math.sin(3 * p + 0.5) * 0.12 * bloom +
      Math.sin(4 * p + 0.9) * 0.045 * bloom;
    sum += wave * 0.5;
  }
  return sum * env * 0.52;
}

/**
 * Pure additive wooden concert flute with gentle breath chiff and exact vibrato phase integral.
 */
function concertFluteSample(freq: number, localT: number, duration: number, softAir: number): number {
  if (localT <= 0 || localT >= duration) return 0;
  const env =
    Math.min(1, localT / 0.05) *
    Math.min(1, (duration - localT) / 0.09) *
    (0.92 + 0.08 * Math.sin(TAU * 4.2 * localT));
  const p = vibratoPhase(localT, freq, 4.9, 0.0024);
  const chiff = Math.exp(-localT * 32) * 0.08 + 0.015;
  return (
    (Math.sin(p) * 0.78 +
      Math.sin(2 * p + 0.3) * 0.16 +
      Math.sin(3 * p + 0.8) * 0.04 +
      softAir * chiff) *
    env *
    0.48
  );
}

/**
 * Orchestral Timpani membrane stroke with exact phase integral of pitch drop.
 */
function timpaniSample(freq: number, localT: number, duration: number, softMallet: number): number {
  if (localT <= 0 || localT >= duration) return 0;
  const p1 = expSweepPhase(localT, freq, freq * 0.18, 20);
  const p2 = expSweepPhase(localT, freq * 1.504, freq * 0.12, 26);
  const m1 = Math.sin(p1) * Math.exp(-localT * 4.8);
  const m2 = Math.sin(p2 + 0.4) * Math.exp(-localT * 8.2) * 0.32;
  const mallet = softMallet * Math.exp(-localT * 42) * 0.18;
  const env = Math.min(1, localT / 0.004) * Math.min(1, (duration - localT) / 0.04);
  return (m1 + m2 + mallet) * env * 0.65;
}

/**
 * Synthesizes clean, warm, distortion-free acoustic foley for all game SFX.
 */
function synthesizeAcousticSfx(name: SfxName): Float64Array {
  const spec =
    name in SFX_SPEC
      ? SFX_SPEC[name as keyof typeof SFX_SPEC]
      : CINEMATIC_SFX_SPEC[name as keyof typeof CINEMATIC_SFX_SPEC];
  const duration = spec.duration;
  const length = Math.round(duration * SAMPLE_RATE);
  const data = new Float64Array(length);
  const rand = seededNoise(901 + [...name].reduce((acc, c) => acc + c.charCodeAt(0) * 17, 0));

  let brown = 0;
  let warmAir = 0;

  if (name === 'coin') {
    const hits = [
      { t: 0.008, f: 1760, a: 0.42 },
      { t: 0.068, f: 2217.46, a: 0.36 },
      { t: 0.135, f: 1975.53, a: 0.32 },
      { t: 0.21, f: 2637.02, a: 0.28 },
    ];
    for (const h of hits) {
      const start = Math.floor(h.t * SAMPLE_RATE);
      for (let i = 0; i < length - start; i++) {
        const lt = i / SAMPLE_RATE;
        const ring =
          Math.sin(TAU * h.f * lt) * Math.exp(-lt * 22) * 0.55 +
          Math.sin(TAU * h.f * 1.414 * lt + 0.4) * Math.exp(-lt * 32) * 0.28 +
          Math.sin(TAU * h.f * 2.12 * lt + 1.1) * Math.exp(-lt * 45) * 0.12;
        const env = Math.min(1, lt / 0.0015);
        data[start + i] += ring * env * h.a;
      }
    }
  } else if (name === 'season') {
    addKarplusStrongPluck(data, null, 0.02, 1.4, 293.66, 0.35, 0, 0.62, 301);
    addKarplusStrongPluck(data, null, 0.15, 1.3, 440.0, 0.32, 0, 0.64, 302);
    addKarplusStrongPluck(data, null, 0.29, 1.15, 587.33, 0.3, 0, 0.66, 303);
    addKarplusStrongPluck(data, null, 0.43, 1.0, 880.0, 0.25, 0, 0.68, 304);
  }

  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const w = rand();
    brown = (brown + w * 0.028) / 1.028;
    warmAir += 0.08 * (brown - warmAir);

    if (name === 'sail') {
      const swell = Math.sin((Math.PI * t) / duration);
      const gust = 0.6 + 0.4 * Math.sin(TAU * 1.4 * t);
      const canvasPhase = expSweepPhase(Math.max(0, t - 0.06), 88, 32, 16);
      const canvasSnap =
        t > 0.06 && t < 0.32
          ? Math.sin(canvasPhase) * Math.exp(-(t - 0.06) * 14) * Math.min(1, (t - 0.06) / 0.008) * 0.28
          : 0;
      const woodChord =
        (Math.sin(TAU * 110 * t) * 0.04 + Math.sin(TAU * 164.81 * t) * 0.03) * swell;
      data[i] += (warmAir * 0.75 + brown * 0.35) * gust * swell + canvasSnap + woodChord;
    } else if (name === 'march') {
      const steps = [0.03, 0.22, 0.41, 0.6];
      let sample = 0;
      for (let s = 0; s < steps.length; s++) {
        const dt = t - steps[s];
        if (dt >= 0 && dt < 0.16) {
          const accent = s % 2 === 0 ? 1 : 0.78;
          const thudPhase = expSweepPhase(dt, 68, 38, 32);
          const bootThud = Math.sin(thudPhase) * Math.exp(-dt * 24) * Math.min(1, dt / 0.004) * 0.48;
          const earthStep = warmAir * Math.exp(-dt * 28) * 0.42;
          sample += (bootThud + earthStep) * accent;
        }
      }
      data[i] += sample;
    } else if (name === 'cannon') {
      const boomPhase = expSweepPhase(t, 36, 58, 12);
      const subPhase = expSweepPhase(t, 24, 28, 10);
      const env = Math.min(1, t / 0.006) * Math.min(1, (duration - t) / 0.12);
      const shockwave =
        (Math.sin(boomPhase) * Math.exp(-t * 5.2) * 0.65 +
          Math.sin(subPhase) * Math.exp(-t * 4.0) * 0.35 +
          warmAir * Math.exp(-t * 3.4) * 0.85) *
        env;
      data[i] += shockwave;
    } else if (name === 'horn') {
      data[i] +=
        frenchHornSample(146.83, t, duration, 1.05) * 0.45 +
        frenchHornSample(220.0, Math.max(0, t - 0.04), duration - 0.04, 1.0) * 0.34 +
        frenchHornSample(293.66, Math.max(0, t - 0.08), duration - 0.08, 0.95) * 0.25 +
        timpaniSample(73.42, t, duration, warmAir) * 0.22;
    } else if (name === 'coin') {
      const bagPhase = expSweepPhase(t, 95, 35, 28);
      data[i] += Math.sin(bagPhase) * Math.exp(-t * 20) * Math.min(1, t / 0.004) * 0.18;
    } else if (name === 'musket') {
      const shots = [0.01, 0.045, 0.09, 0.145, 0.195];
      let volley = 0;
      for (let s = 0; s < shots.length; s++) {
        const dt = t - shots[s];
        if (dt >= 0) {
          const snapPhase = expSweepPhase(dt, 140 + s * 18, 160, 36);
          const body =
            Math.sin(snapPhase) * Math.min(1, dt / 0.002) * Math.exp(-dt * 20) * 0.42 +
            warmAir * Math.min(1, dt / 0.003) * Math.exp(-dt * 11) * 0.48;
          volley += body * (1 - s * 0.11);
        }
      }
      data[i] += volley;
    } else if (name === 'steel') {
      const clashes = [
        { t: 0.015, f: 587.33 },
        { t: 0.24, f: 783.99 },
        { t: 0.48, f: 659.25 },
      ];
      let blade = 0;
      for (const c of clashes) {
        const dt = t - c.t;
        if (dt >= 0) {
          const env = Math.min(1, dt / 0.002) * Math.exp(-dt * 9.5);
          const hiltPhase = expSweepPhase(dt, 118, 45, 28);
          const modes =
            Math.sin(TAU * c.f * dt) * 0.36 +
            Math.sin(TAU * c.f * 1.58 * dt + 0.3) * Math.exp(-dt * 4) * 0.24 +
            Math.sin(TAU * c.f * 2.41 * dt + 0.9) * Math.exp(-dt * 8) * 0.12 +
            Math.sin(hiltPhase) * Math.exp(-dt * 18) * 0.28;
          blade += modes * env;
        }
      }
      data[i] += blade;
    } else if (name === 'charge') {
      const env = Math.min(1, t / 0.35) * Math.min(1, (duration - t) / 0.45);
      for (const at of [0.08, 0.28, 0.46, 0.64, 0.82, 1.0, 1.18, 1.36, 1.54, 1.72, 1.9, 2.08]) {
        const dt = t - at;
        if (dt >= 0 && dt < 0.14) {
          const hoofPhase = expSweepPhase(dt, 74, 30, 28);
          data[i] += Math.sin(hoofPhase) * Math.exp(-dt * 22) * Math.min(1, dt / 0.003) * 0.28;
        }
      }
      const hornCall =
        frenchHornSample(146.83, Math.max(0, t - 0.06), duration - 0.1, 1.05) * 0.34 +
        frenchHornSample(220.0, Math.max(0, t - 0.22), duration - 0.25, 1.1) * 0.3;
      data[i] += (hornCall + warmAir * 0.35) * env;
    } else if (name === 'impact') {
      const blastPhase = expSweepPhase(t, 42, 48, 16);
      const stonePhase = expSweepPhase(Math.max(0, t - 0.03), 88, 42, 22);
      const env = Math.min(1, t / 0.005) * Math.min(1, (duration - t) / 0.12);
      data[i] +=
        (Math.sin(blastPhase) * Math.exp(-t * 5.5) * 0.62 +
          Math.sin(stonePhase) * Math.exp(-t * 9.0) * 0.28 +
          warmAir * Math.exp(-t * 4.5) * 0.72) *
        env;
    } else if (name === 'naval') {
      const env = Math.min(1, t / 0.2) * Math.min(1, (duration - t) / 0.5);
      let salvo = (warmAir * 0.85 + brown * 0.35) * env;
      for (const at of [0.18, 0.95, 1.75]) {
        const dt = t - at;
        if (dt >= 0) {
          const phase = expSweepPhase(dt, 40, 44, 14);
          salvo +=
            (Math.sin(phase) * Math.exp(-dt * 4.5) * 0.42 +
              warmAir * Math.exp(-dt * 3.8) * 0.38) *
            Math.min(1, dt / 0.005);
        }
      }
      data[i] += salvo;
    } else if (name === 'victory') {
      data[i] +=
        frenchHornSample(146.83, t, duration, 1.05) * 0.32 +
        frenchHornSample(220.0, Math.max(0, t - 0.08), duration - 0.08, 1.05) * 0.28 +
        frenchHornSample(293.66, Math.max(0, t - 0.16), duration - 0.16, 1.1) * 0.3 +
        bowedStringSample(369.99, Math.max(0, t - 0.22), duration - 0.22, 1.0) * 0.28 +
        timpaniSample(73.42, t, 0.8, warmAir) * 0.3;
    } else if (name === 'defeat') {
      data[i] +=
        bowedStringSample(146.83, t, duration, 0.9) * 0.38 +
        bowedStringSample(174.61, Math.max(0, t - 0.14), duration - 0.14, 0.85) * 0.3 +
        bowedStringSample(110.0, Math.max(0, t - 0.28), duration - 0.28, 0.8) * 0.36 +
        concertFluteSample(293.66, Math.max(0, t - 0.2), duration - 0.25, warmAir) * 0.22;
    } else if (name === 'season') {
      data[i] +=
        concertFluteSample(293.66, t, duration, warmAir) * 0.26 +
        bowedStringSample(146.83, t, duration, 0.85) * 0.22;
    } else if (name === 'battle-ambience') {
      const env = Math.min(1, t / 0.4) * Math.min(1, (duration - t) / 0.6);
      const drumBeat = timpaniSample(55.0, t % 1.0, 0.7, warmAir) * 0.25;
      const drone = bowedStringSample(73.42, t, duration, 0.75) * 0.24;
      data[i] += (drumBeat + drone + warmAir * 0.35) * env;
    }
  }

  const cutoff =
    name === 'coin'
      ? 5200
      : name === 'steel' || name === 'season' || name === 'victory'
        ? 3600
        : name === 'horn' || name === 'defeat' || name === 'charge'
          ? 2800
          : name === 'musket'
            ? 2400
            : 1600;
  const wet =
    name === 'horn' || name === 'victory' || name === 'defeat' || name === 'season'
      ? 0.24
      : 0.14;
  return finalizeCleanAcoustics(data, Math.min(0.22, spec.targetPeak), cutoff, wet, false);
}

/**
 * Synthesizes a clean, stereo orchestral soundtrack with zero phase distortion and zero clipping.
 */
function synthesizeStereoOrchestralMusic(track: MusicCue): {
  left: Float64Array;
  right: Float64Array;
} {
  const duration = track === 'victory' || track === 'defeat' ? 12 : 16;
  const overlap = track === 'victory' || track === 'defeat' ? 0 : 0.4;
  const length = Math.round(duration * SAMPLE_RATE);
  const totalLength = Math.round((duration + overlap) * SAMPLE_RATE);
  const left = new Float64Array(totalLength);
  const right = new Float64Array(totalLength);

  // Classic D-minor / D-major imperial progressions
  const peaceChords = [
    [50, 57, 62, 65], // Dm
    [46, 53, 58, 62], // Bb
    [41, 53, 57, 60], // F
    [45, 52, 57, 61], // A
  ];
  const warChords = [
    [50, 57, 62, 65], // Dm
    [48, 55, 60, 64], // C
    [46, 53, 58, 62], // Bb
    [45, 52, 57, 61], // A
  ];
  const melodies = [
    [74, 77, 76, 74, 69, 72, 74, 76],
    [77, 74, 70, 74, 77, 79, 77, 74],
    [72, 77, 81, 79, 77, 76, 72, 74],
    [76, 73, 69, 73, 76, 77, 76, 73],
  ];

  const addVoice = (
    startSec: number,
    durSec: number,
    midi: number,
    kind: 'strings' | 'cello' | 'horn' | 'flute' | 'timpani',
    gain: number,
    pan: number,
  ) => {
    const startIdx = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
    const endIdx = Math.min(totalLength, Math.ceil((startSec + durSec) * SAMPLE_RATE));
    if (endIdx <= startIdx) return;
    const freq = midiToFreq(midi);
    const panL = Math.cos(((pan + 1) * Math.PI) / 4);
    const panR = Math.sin(((pan + 1) * Math.PI) / 4);

    for (let i = startIdx; i < endIdx; i++) {
      const lt = i / SAMPLE_RATE - startSec;
      let s = 0;
      if (kind === 'strings') s = bowedStringSample(freq, lt, durSec, 0.9);
      else if (kind === 'cello') s = bowedStringSample(freq, lt, durSec, 1.05);
      else if (kind === 'horn') s = frenchHornSample(freq, lt, durSec, 1.0);
      else if (kind === 'flute') s = concertFluteSample(freq, lt, durSec, 0);
      else if (kind === 'timpani') s = timpaniSample(freq, lt, durSec, 0);
      left[i] += s * gain * panL;
      right[i] += s * gain * panR;
    }
  };

  if (track === 'peace') {
    for (let bar = 0; bar < 4; bar++) {
      const chord = peaceChords[bar];
      const barStart = bar * 4;
      // Warm chamber string pad + bass cello
      addVoice(barStart, 4.3, chord[0] - 12, 'cello', 0.24, -0.2);
      addVoice(barStart + 0.04, 4.2, chord[1], 'strings', 0.18, -0.55);
      addVoice(barStart + 0.08, 4.2, chord[2], 'strings', 0.16, 0.15);
      addVoice(barStart + 0.12, 4.2, chord[3], 'strings', 0.15, 0.55);

      // Plucked Karplus-Strong Renaissance lute arpeggio
      const arpPattern = [1, 2, 3, 2, 1, 3, 2, 3];
      for (let step = 0; step < 8; step++) {
        const noteMidi = chord[arpPattern[step]] + 12;
        addKarplusStrongPluck(
          left,
          right,
          barStart + step * 0.5,
          1.4,
          midiToFreq(noteMidi),
          step % 2 === 0 ? 0.22 : 0.16,
          -0.3 + (step % 3) * 0.25,
          0.6,
          100 + bar * 10 + step,
        );
      }

      // Pastoral wooden concert flute melody
      const mel = melodies[bar];
      addVoice(barStart + 0.5, 1.35, mel[0], 'flute', 0.22, 0.25);
      addVoice(barStart + 2.0, 0.9, mel[2], 'flute', 0.2, 0.25);
      addVoice(barStart + 3.0, 1.15, mel[4], 'flute', 0.21, 0.25);
    }
  } else if (track === 'war' || track === 'battle') {
    const fast = track === 'battle';
    for (let bar = 0; bar < 4; bar++) {
      const chord = warChords[bar];
      const barStart = bar * 4;
      // Sustained low strings & brass harmony
      addVoice(barStart, 4.2, chord[0] - 12, 'cello', 0.26, -0.25);
      addVoice(barStart + 0.05, 4.1, chord[1], 'strings', 0.16, -0.5);
      addVoice(barStart + 0.1, 4.1, chord[2], 'strings', 0.16, 0.5);
      addVoice(barStart + 0.25, 3.6, chord[1], 'horn', 0.22, 0.2);
      addVoice(barStart + 0.5, 3.4, chord[3], 'horn', 0.18, -0.2);

      // Rhythmic spiccato cello ostinato (each note has its own clean envelope)
      const steps = fast ? 8 : 4;
      const stepDur = 4 / steps;
      for (let s = 0; s < steps; s++) {
        const ostMidi = s % 2 === 0 ? chord[0] : chord[1];
        addVoice(
          barStart + s * stepDur,
          stepDur * 0.88,
          ostMidi,
          'cello',
          s % 2 === 0 ? 0.22 : 0.16,
          -0.35,
        );
      }

      // Noble horn motif
      const mel = melodies[bar];
      addVoice(barStart, 1.4, mel[0] - 12, 'horn', 0.24, 0.3);
      addVoice(barStart + 1.5, 0.9, mel[1] - 12, 'horn', 0.2, 0.3);
      addVoice(barStart + 2.5, 1.4, mel[3] - 12, 'horn', 0.24, 0.3);

      // Orchestral Timpani beats
      for (let beat = 0; beat < 4; beat++) {
        if (!fast && beat % 2 === 1) continue;
        addVoice(
          barStart + beat,
          0.85,
          beat % 2 === 0 ? chord[0] - 12 : chord[1] - 12,
          'timpani',
          fast ? 0.26 : 0.2,
          0,
        );
      }
    }
  } else if (track === 'victory') {
    const vicChords = [
      [50, 57, 62, 66], // D major
      [43, 55, 59, 62], // G major
      [45, 57, 61, 64], // A major
      [50, 57, 62, 66], // D major
    ];
    for (let bar = 0; bar < 3; bar++) {
      const chord = vicChords[bar];
      const barStart = bar * 4;
      addVoice(barStart, 3.9, chord[0] - 12, 'cello', 0.25, -0.2);
      addVoice(barStart, 3.9, chord[1], 'strings', 0.18, -0.5);
      addVoice(barStart, 3.9, chord[2], 'strings', 0.18, 0.5);
      addVoice(barStart, 3.8, chord[3], 'horn', 0.24, 0.15);
      addVoice(barStart + 0.1, 3.7, chord[2] + 12, 'horn', 0.2, -0.15);
      addVoice(barStart, 1.2, chord[0] - 12, 'timpani', 0.24, 0);
      for (let step = 0; step < 6; step++) {
        addKarplusStrongPluck(
          left,
          right,
          barStart + step * 0.5,
          1.5,
          midiToFreq(chord[1 + (step % 3)] + 12),
          0.18,
          -0.3 + (step % 3) * 0.3,
          0.66,
          700 + bar * 10 + step,
        );
      }
    }
  } else {
    // Defeat elegy in D minor
    const defChords = [
      [50, 57, 62, 65],
      [46, 53, 58, 62],
      [45, 52, 57, 61],
    ];
    for (let bar = 0; bar < 3; bar++) {
      const chord = defChords[bar];
      const barStart = bar * 4;
      addVoice(barStart, 3.9, chord[0] - 12, 'cello', 0.26, -0.2);
      addVoice(barStart + 0.1, 3.8, chord[1], 'strings', 0.18, -0.45);
      addVoice(barStart + 0.2, 3.8, chord[2], 'strings', 0.16, 0.45);
      addVoice(barStart + 0.4, 3.2, chord[3] + 12, 'flute', 0.2, 0.25);
      addKarplusStrongPluck(
        left,
        right,
        barStart + 0.2,
        2.4,
        midiToFreq(chord[2]),
        0.2,
        -0.25,
        0.55,
        800 + bar,
      );
    }
  }

  const outL = left.slice(0, length);
  const outR = right.slice(0, length);
  if (overlap > 0) {
    const blend = Math.round(overlap * SAMPLE_RATE);
    for (let i = 0; i < blend; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / (blend - 1));
      outL[i] = left[length + i] * (1 - w) + outL[i] * w;
      outR[i] = right[length + i] * (1 - w) + outR[i] * w;
    }
  }

  const isLoop = track === 'peace' || track === 'war' || track === 'battle';
  const cleanL = finalizeCleanAcoustics(outL, 0.42, 3800, 0.24, isLoop);
  const cleanR = finalizeCleanAcoustics(outR, 0.42, 3800, 0.24, isLoop);

  if (isLoop && length > 512) {
    const fadeSamples = 256;
    const diffL = cleanL[0] - cleanL[length - 1];
    const diffR = cleanR[0] - cleanR[length - 1];
    for (let i = 0; i < fadeSamples; i++) {
      const mix = 0.5 - 0.5 * Math.cos((Math.PI * i) / (fadeSamples - 1));
      const idx = length - fadeSamples + i;
      cleanL[idx] += diffL * mix;
      cleanR[idx] += diffR * mix;
    }
    cleanL[length - 1] = cleanL[0];
    cleanR[length - 1] = cleanR[0];
  }

  return { left: cleanL, right: cleanR };
}

/** Six independent buses feed one master, a safety compressor and a bounded output shaper. */
export class CampaignAudio {
  private context: AudioContext | null = null;
  private gains = new Map<MixerChannel, GainNode>();
  private values: AudioMixerState;
  private mutedValue = false;
  private legacyEffectsValue = 1;
  private listeners = new Set<() => void>();
  private samples = new Map<SfxName, AudioBuffer>();
  private musicSamples = new Map<MusicCue, AudioBuffer>();
  private musicLoads = new Map<MusicCue, Promise<void>>();
  private fallbackSamples = new Map<string, AudioBuffer>();
  private loading = false;
  private assetsReady: Promise<void> | null = null;
  private ambience: Ambience = 'off';
  private cinematicMood: CinematicMood = null;
  private lockedTrackValue: MusicCue | null = null;
  private musicTrack: MusicCue | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private previewSource: AudioBufferSourceNode | null = null;
  private previewRequest = 0;
  private musicVoices = new Map<AudioBufferSourceNode, GainNode>();
  private effects = new Map<AudioBufferSourceNode, EffectChannel>();
  private lastPlayed = new Map<Sound, number>();

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
  get nowPlaying() {
    return SOUNDTRACKS.find((track) => track.key === this.musicTrack)?.title ?? null;
  }
  get lockedTrack() {
    return this.lockedTrackValue;
  }
  setLockedTrack(track: MusicCue | null) {
    this.lockedTrackValue = track;
    this.unlock();
    this.syncAmbience();
    for (const listener of this.listeners) listener();
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
    for (const [key, node] of this.gains) {
      node.gain.cancelScheduledValues?.(this.context.currentTime);
      node.gain.setTargetAtTime(
        key === 'masterVolume' && this.mutedValue ? 0 : this.values[key],
        this.context.currentTime,
        0.035,
      );
    }
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
          // Pure linear transfer curve (< 1.0 peak ceiling) avoids any waveshaper harmonic distortion
          curve[i] = 0.96 * x;
        }
        safety.curve = curve;
        safety.oversample = 'none';
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = AUDIO_LIMITER.threshold;
        limiter.knee.value = AUDIO_LIMITER.knee;
        limiter.ratio.value = AUDIO_LIMITER.ratio;
        limiter.attack.value = 0.015;
        limiter.release.value = 0.25;
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

  private async loadSamples() {
    if (this.loading || !this.context) return;
    this.loading = true;
    await Promise.resolve();
    await Promise.allSettled([
      ...(
        ['cannon', 'march', 'sail', 'horn', 'coin', ...Object.keys(CINEMATIC_SFX_SPEC)] as SfxName[]
      ).map(async (name) => {
        await Promise.resolve();
        if (!this.context || typeof window === 'undefined') return;
        const buffer = this.fallback(name);
        this.samples.set(name, buffer);
      }),
      ...(['peace', 'war'] as const).map((name) => this.ensureMusic(name)),
    ]);
  }

  private ensureMusic(name: MusicCue): Promise<void> {
    if (this.musicSamples.has(name)) return Promise.resolve();
    const pending = this.musicLoads.get(name);
    if (pending) return pending;
    const load = new Promise<void>((resolve) => {
      setTimeout(() => {
        try {
          if (this.context && typeof window !== 'undefined') {
            const { left, right } = synthesizeStereoOrchestralMusic(name);
            const buffer = this.stereoBufferFromPCM(left, right, SAMPLE_RATE);
            this.musicSamples.set(name, buffer);
            for (const key of this.musicSamples.keys()) {
              if (this.musicSamples.size <= 3) break;
              if (key !== name && key !== this.musicTrack && key !== 'peace')
                this.musicSamples.delete(key);
            }
            this.syncAmbience();
          }
        } catch {}
        resolve();
      }, 0);
    }).finally(() => this.musicLoads.delete(name));
    this.musicLoads.set(name, load);
    return load;
  }

  private bufferFromPCM(pcm: ArrayLike<number>, rate: number) {
    const buffer = this.context!.createBuffer(1, pcm.length, rate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i];
    return buffer;
  }

  private stereoBufferFromPCM(left: ArrayLike<number>, right: ArrayLike<number>, rate: number) {
    try {
      const buffer = this.context!.createBuffer(2, left.length, rate);
      const chL = buffer.getChannelData(0);
      const chR = buffer.getChannelData(1);
      for (let i = 0; i < left.length; i++) {
        chL[i] = left[i];
        chR[i] = right[i];
      }
      return buffer;
    } catch {
      return this.bufferFromPCM(left, rate);
    }
  }

  private fallback(name: SfxName) {
    let buffer = this.fallbackSamples.get(name);
    if (!buffer) {
      buffer = this.bufferFromPCM(synthesizeAcousticSfx(name), SAMPLE_RATE);
      this.fallbackSamples.set(name, buffer);
    }
    return buffer;
  }

  private uiFallback(name: Sound) {
    const key = `ui-${name}`,
      cached = this.fallbackSamples.get(key);
    if (cached) return cached;
    const rate = SAMPLE_RATE;
    const duration =
      name === 'click'
        ? 0.06
        : name === 'parchment'
          ? 0.24
          : name === 'seal'
            ? 0.34
            : name === 'steel-draw'
              ? 0.42
              : name === 'fanfare'
                ? 0.9
                : 0.45;
    const data = new Float64Array(Math.round(duration * rate));
    const noise = seededNoise(701 + [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0));
    let brown = 0;
    let warmAir = 0;

    if (name === 'ping' || name === 'alert') {
      addKarplusStrongPluck(data, null, 0.005, duration - 0.01, 440.0, 0.35, 0, 0.62, 911);
      addKarplusStrongPluck(data, null, 0.055, duration - 0.06, 659.25, 0.28, 0, 0.65, 912);
    }

    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      const w = noise();
      brown = (brown + w * 0.03) / 1.03;
      warmAir += 0.1 * (brown - warmAir);
      let sample = 0;
      if (name === 'click') {
        const tapPhase = expSweepPhase(t, 145, 75, 90);
        sample = Math.sin(tapPhase) * Math.exp(-t * 75) * Math.min(1, t / 0.0015) * 0.55;
      } else if (name === 'parchment') {
        const env =
          Math.min(1, t / 0.025) *
          Math.min(1, (duration - t) / 0.06) *
          (0.7 + 0.3 * Math.sin(t * 22));
        sample = warmAir * env * 0.9;
      } else if (name === 'seal') {
        const thudPhase = expSweepPhase(t, 68, 42, 34);
        const thudEnv = Math.min(1, t / 0.004) * Math.exp(-t * 18);
        sample = (Math.sin(thudPhase) * 0.65 + warmAir * 0.45) * thudEnv;
      } else if (name === 'steel-draw') {
        const slideEnv = Math.min(1, t / 0.015) * Math.exp(-t * 8.5);
        const p1 = expSweepPhase(t, 587.33, 45, 12);
        const p2 = expSweepPhase(t, 880.0, 65, 12);
        sample = (Math.sin(p1) * 0.32 + Math.sin(p2 + 0.4) * 0.18 + warmAir * 0.35) * slideEnv;
      } else if (name === 'fanfare') {
        const notes = [146.8324, 220, 293.6648, 369.9944];
        for (let n = 0; n < notes.length; n++) {
          sample += frenchHornSample(notes[n], t - n * 0.08, duration - n * 0.08, 1.0) * 0.26;
        }
      } else if (name !== 'ping' && name !== 'alert') {
        sample += bowedStringSample(220, t, duration, 0.8) * 0.18;
      }
      data[i] += sample;
    }

    const peak =
      name === 'click'
        ? 0.055
        : name === 'parchment'
          ? 0.075
          : name === 'seal'
            ? 0.12
            : name === 'steel-draw'
              ? 0.11
              : name === 'fanfare'
                ? 0.15
                : 0.11;
    const processed = finalizeCleanAcoustics(data, peak, 3400, 0.14, false);
    const buffer = this.bufferFromPCM(processed, rate);
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
  private stopMusic(includePreview = true) {
    if (includePreview) this.previewRequest++;
    for (const [source, gain] of this.musicVoices) {
      if (!includePreview && source === this.previewSource) continue;
      try {
        source.stop();
      } catch {}
      source.disconnect();
      gain.disconnect();
      this.musicVoices.delete(source);
    }
    this.musicSource = null;
    if (includePreview) this.previewSource = null;
    this.musicTrack = null;
  }
  setAmbience(value: Ambience) {
    if (this.ambience === value) return;
    this.ambience = value;
    this.syncAmbience();
  }
  setCinematicMood(value: CinematicMood) {
    if (this.cinematicMood === value) return;
    this.cinematicMood = value;
    this.syncAmbience();
  }
  stopCinematicEffects() {
    for (const [source, bus] of this.effects)
      if (bus !== 'uiVolume') {
        try {
          source.stop();
        } catch {}
        this.effects.delete(source);
      }
    this.applyVolumes();
  }
  private syncAmbience() {
    if (!this.context || this.context.state !== 'running') return;
    if (
      this.values.musicVolume === 0 ||
      this.values.masterVolume === 0 ||
      this.mutedValue ||
      hidden()
    ) {
      this.stopMusic();
      return;
    }
    if (this.ambience === 'off' && this.cinematicMood === null && !this.lockedTrackValue) {
      this.stopMusic(false);
      return;
    }
    const track =
      this.cinematicMood ??
      this.lockedTrackValue ??
      (this.ambience === 'war' ? 'war' : 'peace');
    const buffer = this.musicSamples.get(track);
    if (!buffer) {
      void this.ensureMusic(track);
      return;
    }
    if (this.musicSource && this.musicTrack === track) return;
    const now = this.context.currentTime;
    if (this.musicSource) {
      const gain = this.musicVoices.get(this.musicSource);
      gain?.gain.cancelScheduledValues?.(now);
      gain?.gain.setTargetAtTime(0, now, 0.24);
      try {
        this.musicSource.stop(now + 1.25);
      } catch {}
    }
    const source = this.context.createBufferSource(),
      fader = this.context.createGain();
    source.buffer = buffer;
    source.loop = track !== 'victory' && track !== 'defeat';
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(fader);
    fader.connect(this.gains.get('musicVolume')!);
    fader.gain.setValueAtTime(0, now);
    fader.gain.linearRampToValueAtTime(this.previewSource ? 0.16 : 1, now + 0.85);
    this.musicSource = source;
    this.musicTrack = track;
    this.musicVoices.set(source, fader);
    source.onended = () => {
      source.disconnect();
      fader.disconnect();
      this.musicVoices.delete(source);
      if (this.musicSource === source) {
        this.musicSource = null;
        this.musicTrack = null;
        if ((track === 'victory' || track === 'defeat') && this.cinematicMood === track) {
          this.cinematicMood = null;
          this.syncAmbience();
        }
      }
    };
    source.start();
    for (const listener of this.listeners) listener();
  }
  private duckMusic() {
    if (!this.context || !this.musicSource || this.previewSource) return;
    const fader = this.musicVoices.get(this.musicSource);
    if (!fader) return;
    const now = this.context.currentTime;
    if (typeof fader.gain.cancelAndHoldAtTime === 'function') fader.gain.cancelAndHoldAtTime(now);
    else fader.gain.cancelScheduledValues?.(now);
    fader.gain.setTargetAtTime(0.54, now, 0.025);
    fader.gain.setTargetAtTime(1, now + 0.5, 0.23);
  }
  playCombatSound() {
    if (this.ready('combatVolume')) {
      this.duckMusic();
      this.playBuffer(this.samples.get('cannon') ?? this.fallback('cannon'), 'combatVolume');
    }
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
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - (this.lastPlayed.get(sound) ?? -Infinity) < 80) return;
    this.lastPlayed.set(sound, now);
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
      sound === 'horn' || sound === 'war' || (sound in CINEMATIC_SFX_SPEC && sound !== 'season')
        ? 'combatVolume'
        : 'uiVolume';
    if (!this.ready(channel)) return;
    if (sound in CINEMATIC_SFX_SPEC) {
      const effect = sound as keyof typeof CINEMATIC_SFX_SPEC;
      if (sound === 'musket' || sound === 'impact' || sound === 'naval') this.duckMusic();
      this.playBuffer(this.samples.get(effect) ?? this.fallback(effect), channel);
      return;
    }
    if (sound === 'horn' || sound === 'war') {
      this.duckMusic();
      this.playBuffer(this.samples.get('horn') ?? this.fallback('horn'), channel);
    } else if (sound === 'coins')
      this.playBuffer(this.samples.get('coin') ?? this.fallback('coin'), channel);
    else this.playBuffer(this.uiFallback(sound), channel);
  }
  stopPreview() {
    this.previewRequest++;
    const preview = this.previewSource;
    this.previewSource = null;
    if (preview)
      try {
        preview.stop();
      } catch {}
    if (this.context && this.musicSource) {
      const fader = this.musicVoices.get(this.musicSource);
      fader?.gain.cancelScheduledValues?.(this.context.currentTime);
      fader?.gain.setTargetAtTime(1, this.context.currentTime, 0.2);
    }
  }
  previewTrack(track: MusicCue) {
    this.unlock();
    this.stopPreview();
    const request = this.previewRequest;
    void this.ensureMusic(track).then(() => {
      if (this.previewRequest === request) this.previewMusic(track, 8);
    });
  }
  private previewMusic(track: MusicCue = this.ambience === 'war' ? 'war' : 'peace', seconds = 3) {
    const sample = this.musicSamples.get(track);
    if (!sample || this.context?.state !== 'running' || this.mutedValue || hidden()) return;
    this.stopPreview();
    const background = this.musicSource ? this.musicVoices.get(this.musicSource) : null;
    background?.gain.cancelScheduledValues?.(this.context.currentTime);
    background?.gain.setTargetAtTime(0.14, this.context.currentTime, 0.12);
    const source = this.context.createBufferSource(),
      fader = this.context.createGain();
    source.buffer = sample;
    source.connect(fader);
    fader.connect(this.gains.get('musicVolume')!);
    fader.gain.setValueAtTime(0, this.context.currentTime);
    fader.gain.linearRampToValueAtTime(1, this.context.currentTime + 0.1);
    fader.gain.setValueAtTime(1, this.context.currentTime + seconds - 0.5);
    fader.gain.linearRampToValueAtTime(0, this.context.currentTime + seconds);
    this.musicVoices.set(source, fader);
    this.previewSource = source;
    source.onended = () => {
      source.disconnect();
      fader.disconnect();
      this.musicVoices.delete(source);
      if (this.previewSource === source) this.stopPreview();
    };
    source.start();
    source.stop(this.context.currentTime + seconds);
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
