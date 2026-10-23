/** Pure deterministic DSP shared by the asset generator and acceptance tests. */
export const AUDIO_SAMPLE_RATE = 44100;
export const SFX_ASSET_REVISION = 'v110-soft';
export const SFX_SPEC = {
  sail: { targetPeak: 0.12, cutoff: 220, duration: 2.2 },
  march: { targetPeak: 0.14, cutoff: 180, duration: 0.9 },
  cannon: { targetPeak: 0.24, cutoff: 220, duration: 1.8 },
  horn: { targetPeak: 0.2, cutoff: 250, duration: 1.5 },
  coin: { targetPeak: 0.2, cutoff: 250, duration: 0.9 },
} as const;
export const MUSIC_SPEC = { duration: 16, targetPeak: 0.55, cutoff: 1800 } as const;
export function peakAmplitude(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
}
/** RBJ Butterworth biquad (two poles), followed by exact peak normalization. */
export function normalizeAndFilterPCM(
  input: ArrayLike<number>,
  targetPeak: number,
  cutoffHz: number,
  sampleRate = AUDIO_SAMPLE_RATE,
  options: { loop?: boolean } = {},
): Float64Array {
  if (!Number.isFinite(targetPeak) || targetPeak <= 0 || targetPeak > 1)
    throw new Error('Pico PCM deve estar entre zero e um.');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new Error('Taxa de amostragem inválida.');
  if (!Number.isFinite(cutoffHz) || cutoffHz <= 0 || cutoffHz >= sampleRate / 2)
    throw new Error('Frequência de corte inválida.');
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosine = Math.cos(omega),
    alpha = Math.sin(omega) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 - cosine) / (2 * a0),
    b1 = (1 - cosine) / a0,
    b2 = b0;
  const a1 = (-2 * cosine) / a0,
    a2 = (1 - alpha) / a0;
  const output = new Float64Array(input.length);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  // Warm a looping filter with two whole periods, removing its startup transient.
  const passes = options.loop ? 3 : 1;
  for (let pass = 0; pass < passes; pass++)
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      if (!Number.isFinite(x)) throw new Error('PCM contém amostra não finita.');
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      if (pass === passes - 1) output[i] = y;
    }
  const peak = peakAmplitude(output);
  if (peak > 0) {
    const scale = targetPeak / peak;
    for (let i = 0; i < output.length; i++) output[i] *= scale;
  }
  return output;
}
export function seededNoise(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296) * 2 - 1;
  };
}
export type SfxName = keyof typeof SFX_SPEC;
export function generateSfxPCM(name: SfxName, rate = AUDIO_SAMPLE_RATE): Float64Array {
  const spec = SFX_SPEC[name],
    data = new Float64Array(Math.round(spec.duration * rate));
  const noise = seededNoise(101 + [...name].reduce((n, c) => n + c.charCodeAt(0), 0));
  let brown = 0,
    slow = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / rate;
    brown = (brown + noise() * 0.025) / 1.025;
    slow += 0.0025 * (brown - slow);
    let value = 0;
    if (name === 'sail') {
      const envelope = Math.min(1, t / 0.25) * Math.min(1, (spec.duration - t) / 0.6);
      // Brown water, never bright white noise. The quiet wood chord is below .06.
      value =
        (brown * (0.34 + 0.1 * Math.sin(t * 2.4)) +
          slow * 0.6 +
          (Math.sin(2 * Math.PI * 110 * t) + Math.sin(2 * Math.PI * 165 * t)) * 0.008) *
        envelope;
    } else if (name === 'march') {
      for (const at of [0.08, 0.35, 0.62]) {
        const s = t - at;
        if (s >= 0 && s < 0.06) {
          const envelope = Math.sin((Math.PI * s) / 0.06) ** 2;
          value += (Math.sin(2 * Math.PI * 82 * s) * 0.7 + brown * 0.8) * envelope;
        }
      }
    } else if (name === 'cannon') {
      const phase = 2 * Math.PI * (32 * t + (53 / 11) * (1 - Math.exp(-11 * t)));
      const attack = Math.min(1, t / 0.009),
        tail = Math.min(1, (spec.duration - t) / 0.15);
      value =
        Math.tanh((Math.sin(phase) * Math.exp(-t * 5.5) + brown * 1.8 * Math.exp(-t * 3.2)) * 1.5) *
        attack *
        tail;
    } else if (name === 'horn') {
      const envelope = Math.min(1, t / 0.12) * Math.min(1, (spec.duration - t) / 0.4);
      for (const frequency of [110, 146.8324, 220])
        value += Math.sin(2 * Math.PI * frequency * t) * envelope * 0.1;
    } else {
      for (const at of [0.02, 0.18, 0.32]) {
        const s = t - at;
        if (s >= 0)
          value +=
            (Math.sin(2 * Math.PI * 165 * s) + 0.24 * Math.sin(2 * Math.PI * 220 * s)) *
            Math.min(1, s / 0.008) *
            Math.exp(-s * 13);
      }
      value *= Math.min(1, (spec.duration - t) / 0.08);
    }
    data[i] = value;
  }
  return normalizeAndFilterPCM(data, spec.targetPeak, spec.cutoff, rate);
}
export type MusicName = 'peace' | 'war';
export function generateMusicPCM(name: MusicName, rate = AUDIO_SAMPLE_RATE): Float64Array {
  const duration = MUSIC_SPEC.duration,
    overlap = 0.25;
  const length = Math.round(duration * rate),
    extended = new Float64Array(Math.round((duration + overlap) * rate));
  const chords = [
    [146.8324, 174.6141, 220],
    [116.5409, 146.8324, 174.6141],
    [97.9989, 116.5409, 146.8324],
    [110, 138.5913, 164.8138],
  ];
  const add = (
    at: number,
    seconds: number,
    notes: readonly number[],
    kind: 'strings' | 'lute' | 'cello' | 'brass' | 'timpani',
    amplitude: number,
  ) => {
    const first = Math.max(0, Math.floor(at * rate)),
      end = Math.min(extended.length, Math.ceil((at + seconds) * rate));
    for (let i = first; i < end; i++) {
      const t = i / rate - at;
      let voice = 0;
      const envelope =
        kind === 'strings' || kind === 'brass'
          ? Math.min(1, t / 0.4) * Math.min(1, (seconds - t) / 0.7)
          : Math.min(1, t / 0.009) *
            Math.exp(-t * (kind === 'lute' ? 5 : kind === 'timpani' ? 8 : 10)) *
            Math.min(1, (seconds - t) / 0.04);
      for (const frequency of notes) {
        if (kind === 'timpani')
          voice +=
            Math.sin(
              2 * Math.PI * (frequency * t + (frequency * 0.25 * (1 - Math.exp(-t * 8))) / 8),
            ) +
            0.2 * Math.sin(2 * Math.PI * frequency * 1.5 * t);
        else
          for (let h = 1; h <= (kind === 'lute' ? 5 : 7); h++)
            voice +=
              Math.sin(
                2 * Math.PI * frequency * h * t +
                  (kind === 'strings' ? Math.sin(t * 31) * 0.018 * h : 0),
              ) / Math.pow(h, kind === 'brass' ? 1.8 : 2.2);
      }
      extended[i] += (voice * envelope * amplitude) / notes.length;
    }
  };
  // Schedule previous/next cycles too so the loop has ringing tails and no gap.
  for (let cycle = -1; cycle <= 1; cycle++)
    for (let bar = 0; bar < 4; bar++) {
      const chord = chords[bar],
        at = cycle * duration + bar * 4;
      add(at, 5.2, chord, 'strings', name === 'peace' ? 0.5 : 0.28);
      if (name === 'peace') {
        add(
          at + 0.25,
          5.5,
          chord.map((f) => f / 2),
          'strings',
          0.18,
        );
        for (let beat = 0; beat < 8; beat++)
          add(at + beat * 0.5, 1.8, [chord[beat % 3] * (beat % 4 === 3 ? 2 : 1)], 'lute', 0.25);
      } else {
        add(at + 0.5, 4.7, chord, 'brass', 0.25);
        for (let beat = 0; beat < 16; beat++)
          add(at + beat * 0.25, 0.4, [chord[beat % 4 === 3 ? 2 : 0] / 2], 'cello', 0.34);
        for (let beat = 0; beat < 4; beat++)
          add(at + beat, 1, [beat % 2 === 0 ? 49 : 65.406], 'timpani', 0.28);
      }
    }
  const loop = extended.slice(0, length),
    blend = Math.round(overlap * rate);
  for (let i = 0; i < blend; i++) {
    const fraction = i / (blend - 1),
      weight = 0.5 - 0.5 * Math.cos(Math.PI * fraction);
    loop[i] = extended[length + i] * (1 - weight) + extended[i] * weight;
  }
  const result = normalizeAndFilterPCM(loop, MUSIC_SPEC.targetPeak, MUSIC_SPEC.cutoff, rate, {
    loop: true,
  });
  // Adjacent loop endpoints encode the same value, preventing a sample discontinuity.
  if (result.length > 1) result[result.length - 1] = result[0];
  return result;
}
