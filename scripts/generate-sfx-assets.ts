import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_SAMPLE_RATE,
  generateMusicPCM,
  generateSfxPCM,
  MUSIC_SPEC,
  peakAmplitude,
  SFX_SPEC,
} from '../shared/audioDSP';
export { normalizeAndFilterPCM } from '../shared/audioDSP';
export function encodePCM16Wav(samples: ArrayLike<number>, sampleRate = AUDIO_SAMPLE_RATE): Buffer {
  const output = Buffer.alloc(44 + samples.length * 2);
  output.write('RIFF');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i]) || Math.abs(samples[i]) > 1)
      throw new Error('PCM inválido ou clipping.');
    // Truncation never quantizes a sample above its mandated target peak.
    output.writeInt16LE(Math.trunc(samples[i] * 32767), 44 + i * 2);
  }
  return output;
}
export async function generateAudioAssets(root = path.resolve('public/assets')) {
  await Promise.all([
    mkdir(path.join(root, 'sfx'), { recursive: true }),
    mkdir(path.join(root, 'music'), { recursive: true }),
  ]);
  for (const name of Object.keys(SFX_SPEC) as (keyof typeof SFX_SPEC)[]) {
    const pcm = generateSfxPCM(name);
    await writeFile(path.join(root, 'sfx', `${name}.wav`), encodePCM16Wav(pcm));
    console.log(
      `${name}.wav: peak=${peakAmplitude(pcm).toFixed(2)}, LP=${SFX_SPEC[name].cutoff}Hz, ${SFX_SPEC[name].duration}s`,
    );
  }
  for (const name of ['peace', 'war'] as const) {
    const pcm = generateMusicPCM(name);
    await writeFile(path.join(root, 'music', `bgm-${name}.wav`), encodePCM16Wav(pcm));
    console.log(
      `bgm-${name}.wav: peak=${MUSIC_SPEC.targetPeak}, ${MUSIC_SPEC.duration}s, seamless PCM16 loop`,
    );
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await generateAudioAssets();
