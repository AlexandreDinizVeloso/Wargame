import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const RATE = 44100;
let seed = 100;
const noise = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296) * 2 - 1;
};
function wav(samples: Float64Array) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const output = Buffer.alloc(44 + samples.length * 2);
  output.write('RIFF');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(RATE, 24);
  output.writeUInt32LE(RATE * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    output.writeInt16LE(
      Math.round(Math.tanh((samples[i] / Math.max(0.01, peak)) * 1.4) * 0.9 * 32767),
      44 + i * 2,
    );
  return output;
}
function synth(name: string, duration: number) {
  const data = new Float64Array(Math.ceil(duration * RATE));
  let low = 0,
    deep = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / RATE,
      n = noise();
    low += 0.055 * (n - low);
    deep += 0.007 * (n - deep);
    let sample = 0;
    if (name === 'cannon')
      sample =
        (deep * 6 + low * 1.2) * Math.exp(-t * 3.5) +
        Math.sin(2 * Math.PI * (38 * t + 12 * (1 - Math.exp(-t * 10)))) * Math.exp(-t * 8) * 0.5 +
        n * Math.exp(-t * 75) * 0.25;
    if (name === 'march')
      for (let step = 0; step < 8; step++) {
        const s = t - step * 0.19;
        if (s >= 0 && s < 0.23)
          sample +=
            (low * 3 + Math.sin(2 * Math.PI * (85 - (step % 2) * 10) * s) * 0.19) *
              Math.exp(-s * 28) +
            n * 0.08 * Math.exp(-Math.pow((s - 0.025) / 0.017, 2));
      }
    if (name === 'sail') {
      sample = low * 0.6 * (0.6 + 0.4 * Math.sin(t * 2.5)) + deep * 1.3;
      for (const start of [0.25, 0.8, 1.3]) {
        const s = t - start;
        if (s >= 0 && s < 0.4)
          sample +=
            Math.sin(2 * Math.PI * (190 * s + 15 * Math.sin(s * 8))) *
            Math.sin((Math.PI * s) / 0.4) *
            0.06;
      }
      if (t > 0.55)
        for (const f of [1260, 1739, 2851])
          sample += Math.sin(2 * Math.PI * f * (t - 0.55)) * Math.exp(-(t - 0.55) * 5) * 0.018;
    }
    if (name === 'horn') {
      const f = t < 0.28 ? 146.83 : t < 0.6 ? 196 : 293.66;
      const envelope = Math.min(1, t / 0.08) * Math.min(1, (duration - t) / 0.3);
      for (let h = 1; h <= 8; h++)
        sample +=
          (Math.sin(2 * Math.PI * f * h * t + Math.sin(t * 23) * 0.025) / Math.pow(h, 1.5)) *
          envelope *
          0.18;
    }
    if (name === 'coin')
      for (const start of [0, 0.16, 0.28]) {
        const s = t - start;
        if (s >= 0)
          for (const [f, gain] of [
            [2300, 0.16],
            [3181, 0.1],
            [4769, 0.05],
          ])
            sample += Math.sin(2 * Math.PI * f * s) * Math.exp(-s * 15) * gain;
      }
    data[i] = sample * Math.min(1, t / 0.004) * Math.min(1, (duration - t) / 0.06);
  }
  if (name === 'cannon')
    for (const [delay, gain] of [
      [0.16, 0.24],
      [0.31, 0.13],
      [0.53, 0.07],
    ]) {
      const offset = Math.floor(delay * RATE);
      for (let i = data.length - 1; i >= offset; i--) data[i] += data[i - offset] * gain;
    }
  return wav(data);
}
const folder = path.resolve('public/assets/sfx');
await mkdir(folder, { recursive: true });
for (const [name, duration] of [
  ['cannon', 1.8],
  ['march', 1.7],
  ['sail', 2.2],
  ['horn', 1.5],
  ['coin', 0.9],
] as const) {
  seed = 100 + [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
  const buffer = synth(name, duration);
  await writeFile(path.join(folder, `${name}.wav`), buffer);
  console.log(`${name}.wav: PCM 16-bit mono, ${RATE} Hz, ${duration}s, ${buffer.length} bytes`);
}
