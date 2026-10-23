/** Original Concórdia score. No external recordings, models, sample packs or network calls. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const TAU = Math.PI * 2;
const TABLE_SIZE = 4096;
type Instrument = 'strings' | 'cello' | 'lute' | 'flute' | 'horn' | 'bell' | 'timpani' | 'drum';
type Theme = 'peace' | 'war' | 'battle' | 'victory' | 'defeat';
type Note = {
  at: number;
  duration: number;
  midi: number;
  gain: number;
  pan: number;
  instrument: Instrument;
};
type Score = {
  id: Theme;
  title: string;
  bpm: number;
  bars: number;
  loop: boolean;
  description: string;
};
const SCORES: Score[] = [
  {
    id: 'peace',
    title: 'Atlas das Coroas',
    bpm: 80,
    bars: 24,
    loop: true,
    description:
      'Alaúde arpejado, violoncelos, cordas de câmara e flauta sobre oito harmonias em ré menor; três variações do tema.',
  },
  {
    id: 'war',
    title: 'Estandartes ao Vento',
    bpm: 96,
    bars: 24,
    loop: true,
    description:
      'Ostinato grave, trompas, cordas e tímpanos; desenvolvimento do mesmo tema em três seções.',
  },
  {
    id: 'battle',
    title: 'Aço e Pólvora',
    bpm: 120,
    bars: 20,
    loop: true,
    description:
      'Cordas em colcheias, chamada de trompas, tambores graves e contracanto; tensão sem frequências estridentes.',
  },
  {
    id: 'victory',
    title: 'O Peso da Vitória',
    bpm: 90,
    bars: 6,
    loop: false,
    description:
      'Resolução em ré maior com trompas suaves, cordas ascendentes, alaúde e sinos graves.',
  },
  {
    id: 'defeat',
    title: 'Depois das Cinzas',
    bpm: 80,
    bars: 6,
    loop: false,
    description:
      'Elegia em ré menor para violoncelo, alaúde e cordas; encerra em suspensão e desaparece lentamente.',
  },
];
// Eight-bar harmonic sentence: Dm, Bb, F, C, Gm, Dm/F, Bb, A.
const HARMONY = [
  [50, 57, 62, 65],
  [46, 53, 58, 62],
  [41, 53, 57, 60],
  [48, 55, 60, 64],
  [43, 55, 58, 62],
  [41, 53, 57, 62],
  [46, 53, 58, 62],
  [45, 52, 57, 61],
];
const MELODIES = [
  [74, 77, 76, 74, 69, 72, 74],
  [77, 74, 70, 74, 77, 79, 77],
  [72, 77, 81, 79, 77, 76, 72],
  [76, 79, 76, 72, 71, 72, 76],
  [79, 77, 74, 70, 74, 77, 74],
  [77, 76, 74, 69, 72, 74, 77],
  [77, 74, 70, 69, 70, 74, 77],
  [76, 73, 69, 73, 76, 73, 69],
];
const noteFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function scoreNotes(score: Score): Note[] {
  const notes: Note[] = [],
    beat = 60 / score.bpm,
    barLength = beat * 4;
  const add = (
    bar: number,
    start: number,
    beats: number,
    midi: number,
    instrument: Instrument,
    gain: number,
    pan = 0,
  ) =>
    notes.push({
      at: bar * barLength + start * beat,
      duration: beats * beat,
      midi,
      instrument,
      gain,
      pan,
    });
  for (let bar = 0; bar < score.bars; bar++) {
    const phrase = Math.floor(bar / 8),
      harmonic = bar % 8;
    let chord = HARMONY[harmonic];
    if (score.id === 'victory')
      chord = [
        [50, 57, 62, 66],
        [43, 55, 59, 62],
        [45, 57, 61, 64],
        [47, 54, 59, 62],
        [45, 57, 61, 64],
        [50, 57, 62, 66],
      ][bar];
    if (score.id === 'defeat')
      chord = [
        [50, 57, 62, 65],
        [46, 53, 58, 62],
        [43, 55, 58, 62],
        [45, 52, 57, 61],
        [46, 53, 58, 62],
        [50, 57, 62, 65],
      ][bar];
    const restful = score.id === 'peace' || score.id === 'defeat';
    const dynamics = phrase === 1 ? 0.84 : phrase === 2 ? 1.03 : 0.94;
    // Staggered bow attacks and restrained voicings keep the melody above the bed.
    chord
      .slice(1)
      .forEach((midi, index) =>
        add(
          bar,
          index * 0.035,
          4.5,
          midi + (score.id === 'victory' ? 12 : 0),
          'strings',
          (restful ? 0.065 : 0.055) * dynamics,
          [-0.64, 0.06, 0.66][index],
        ),
      );
    add(bar, 0, restful ? 4.1 : 1.8, chord[0], 'cello', restful ? 0.13 : 0.15, -0.12);
    if (restful) {
      for (let eighth = 0; eighth < 8; eighth++) {
        const pattern = [1, 2, 3, 2, 1, 3, 2, 3];
        const octave = eighth === 5 && phrase === 1 ? 12 : 0;
        add(
          bar,
          eighth / 2,
          1.7,
          chord[pattern[eighth]] + 12 + octave,
          'lute',
          (eighth % 2 ? 0.11 : 0.145) * dynamics,
          -0.38 + 0.1 * (eighth % 3),
        );
      }
      const melody = score.id === 'defeat' ? [74, 72, 69, 65, 64, 62] : MELODIES[harmonic];
      if (score.id === 'defeat') {
        add(bar, 0.25, 3.75, melody[bar] - 12, 'cello', 0.18, 0.2);
        if (bar < 5) add(bar, 2.5, 1.9, melody[bar], 'flute', 0.085, 0.3);
      } else {
        // A genuine question/answer melody, not a repeated chord oscillator.
        const starts = phrase === 1 ? [0.5, 1.5, 2.0, 3.0] : [0, 1.5, 2.5, 3.0];
        const lengths = phrase === 1 ? [0.9, 0.45, 0.9, 1.25] : [1.3, 0.9, 0.45, 1.25];
        starts.forEach((start, index) =>
          add(
            bar,
            start,
            lengths[index],
            melody[(index + phrase * 2) % melody.length],
            'flute',
            0.14 * dynamics,
            0.23,
          ),
        );
        if (phrase === 2 && bar % 2 === 1) add(bar, 2, 2.1, chord[2] + 12, 'strings', 0.075, -0.15);
      }
    } else {
      const aggressive = score.id === 'battle';
      if (score.id === 'victory') {
        for (let eighth = 0; eighth < 8; eighth++)
          add(bar, eighth / 2, 1.25, chord[1 + (eighth % 3)] + 12, 'lute', 0.11, -0.4);
        const tune = [
          [74, 78, 81],
          [79, 78, 74],
          [76, 73, 76],
          [78, 76, 74],
          [73, 76, 81],
          [78, 76, 74],
        ][bar];
        tune.forEach((midi, index) => add(bar, index * 1.25, 1.75, midi, 'horn', 0.12, 0.18));
        if (bar === 0 || bar === 3 || bar === 5)
          add(bar, 0, 3.7, chord[3] + 12, 'bell', 0.075, 0.45);
      } else {
        const steps = aggressive ? 8 : 8;
        for (let step = 0; step < steps; step++) {
          const midi = [chord[0], chord[0] + 12, chord[1], chord[0] + 12][step % 4];
          add(bar, step / 2, 0.56, midi, 'cello', (step % 2 === 0 ? 0.14 : 0.105) * dynamics, -0.2);
          if (aggressive && step % 2 === 1)
            add(bar, step / 2, 0.4, chord[2] + 12, 'strings', 0.05, 0.5);
        }
        const melody = MELODIES[harmonic];
        [0, 1.5, 2.5].forEach((start, index) =>
          add(
            bar,
            start,
            [1.35, 0.85, 1.6][index],
            melody[(index + phrase) % melody.length] - (aggressive ? 12 : 0),
            'horn',
            aggressive ? 0.14 : 0.12,
            0.2,
          ),
        );
        if (phrase > 0 && bar % 2 === 1) add(bar, 1, 2.8, chord[3] + 12, 'flute', 0.075, -0.25);
      }
      for (let beatIndex = 0; beatIndex < 4; beatIndex++) {
        if (score.id === 'victory' && bar > 3) continue;
        add(
          bar,
          beatIndex,
          1.5,
          beatIndex % 2 === 0 ? 38 : 43,
          'timpani',
          score.id === 'battle' ? 0.21 : 0.15,
          0,
        );
        if (score.id === 'battle' || (score.id === 'war' && bar % 4 === 3))
          add(bar, beatIndex + 0.5, 0.45, 50, 'drum', 0.07, -0.05);
      }
    }
  }
  return notes;
}

function waveTable(instrument: Instrument, frequency: number): Float64Array {
  const result = new Float64Array(TABLE_SIZE + 1);
  const harmonics =
    instrument === 'flute' ? 4 : instrument === 'lute' ? 9 : instrument === 'bell' ? 5 : 8;
  for (let i = 0; i <= TABLE_SIZE; i++) {
    const phase = (i / TABLE_SIZE) * TAU;
    for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
      let weight =
        1 / harmonic ** (instrument === 'horn' ? 1.25 : instrument === 'lute' ? 1.65 : 2.0);
      if (instrument === 'flute') weight = [0, 1, 0.16, 0.035, 0.015][harmonic] ?? 0;
      if (instrument === 'strings' && harmonic % 2 === 0) weight *= 0.78;
      weight *= Math.exp((-frequency * harmonic) / (instrument === 'horn' ? 1700 : 2600));
      result[i] += Math.sin(phase * harmonic) * weight;
    }
  }
  return result;
}
function render(score: Score): { left: Float64Array; right: Float64Array; duration: number } {
  const duration = (score.bars * 4 * 60) / score.bpm,
    length = Math.round(duration * RATE);
  const left = new Float64Array(length),
    right = new Float64Array(length);
  let seed = 0x21b4a;
  const noise = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  for (const note of scoreNotes(score)) {
    const frequency = noteFrequency(note.midi),
      start = Math.floor(note.at * RATE),
      count = Math.floor(note.duration * RATE);
    const table = waveTable(note.instrument, frequency),
      step = (frequency * TABLE_SIZE) / RATE;
    const panLeft = Math.cos(((note.pan + 1) * Math.PI) / 4),
      panRight = Math.sin(((note.pan + 1) * Math.PI) / 4);
    let phase = 0,
      phase2 = 0,
      brown = 0,
      low = 0;
    for (let i = 0; i < count; i++) {
      const t = i / RATE;
      let sample = 0,
        envelope = 0;
      if (note.instrument === 'timpani' || note.instrument === 'drum') {
        brown += (noise() * 0.1 - brown) * 0.035;
        const drum = note.instrument === 'drum';
        const phase = TAU * (frequency * t + (frequency * 0.22 * (1 - Math.exp(-t * 22))) / 22);
        sample =
          (Math.sin(phase) + (drum ? brown * 15 : 0.24 * Math.sin(phase * 1.47))) *
          Math.exp(-t * (drum ? 12 : 3.5));
        envelope = Math.min(1, t / 0.004) * Math.min(1, (note.duration - t) / 0.05);
      } else {
        const index = Math.floor(phase),
          fraction = phase - index;
        sample = table[index] + (table[index + 1] - table[index]) * fraction;
        if (note.instrument === 'strings' || note.instrument === 'cello') {
          const index2 = Math.floor(phase2),
            fraction2 = phase2 - index2;
          sample =
            sample * 0.68 +
            (table[index2] + (table[index2 + 1] - table[index2]) * fraction2) * 0.32;
        }
        phase = (phase + step * (1 + 0.0017 * Math.sin(t * TAU * 4.8))) % TABLE_SIZE;
        phase2 = (phase2 + step * 1.0026) % TABLE_SIZE;
        if (note.instrument === 'lute') {
          const cutoff = 700 + 2400 * Math.exp(-t * 4),
            coefficient = 1 - Math.exp((-TAU * cutoff) / RATE);
          low += coefficient * (sample - low);
          sample = low;
          envelope =
            Math.min(1, t / 0.005) * Math.exp(-t * 3.9) * Math.min(1, (note.duration - t) / 0.09);
        } else if (note.instrument === 'bell') {
          sample =
            Math.sin(TAU * frequency * t) +
            0.27 * Math.sin(TAU * frequency * 2.01 * t) * Math.exp(-t * 2) +
            0.075 * Math.sin(TAU * frequency * 3.99 * t) * Math.exp(-t * 5);
          envelope =
            Math.min(1, t / 0.01) * Math.exp(-t * 1.5) * Math.min(1, (note.duration - t) / 0.3);
        } else {
          const attack =
            note.instrument === 'strings' ? 0.2 : note.instrument === 'horn' ? 0.12 : 0.07;
          const release = note.instrument === 'strings' ? 0.5 : 0.19;
          envelope =
            Math.min(1, t / attack) *
            Math.min(1, (note.duration - t) / release) *
            (0.94 + 0.06 * Math.sin(TAU * 0.8 * t));
        }
      }
      const index = start + i;
      if (index >= length && !score.loop) break;
      const output = index % length,
        sampleGain = sample * envelope * note.gain;
      left[output] += sampleGain * panLeft;
      right[output] += sampleGain * panRight;
    }
  }
  // Deterministic stereo hall: diffuse early reflections followed by a restrained tail.
  const dryLeft = left.slice(),
    dryRight = right.slice();
  const reflections = [
    [0.087, 0.13],
    [0.137, 0.105],
    [0.229, 0.083],
    [0.347, 0.065],
    [0.571, 0.042],
    [0.829, 0.026],
    [1.117, 0.016],
  ];
  for (let tap = 0; tap < reflections.length; tap++) {
    const [seconds, gain] = reflections[tap],
      delay = Math.round(seconds * RATE);
    for (let i = 0; i < length; i++) {
      let from = i - delay;
      if (from < 0) {
        if (!score.loop) continue;
        from += length;
      }
      left[i] += (tap % 2 ? dryLeft[from] : dryRight[from]) * gain;
      const stagger = (from + Math.round(0.011 * RATE)) % length;
      right[i] += (tap % 2 ? dryRight[stagger] : dryLeft[stagger]) * gain;
    }
  }
  let peak = 0,
    filterL = 0,
    filterR = 0;
  const alpha = 1 - Math.exp((-TAU * 4800) / RATE);
  for (let i = 0; i < length; i++) {
    filterL += alpha * (left[i] - filterL);
    filterR += alpha * (right[i] - filterR);
    const fade = score.loop
      ? 1
      : Math.min(
          1,
          i / (RATE * 0.08),
          (length - 1 - i) / (RATE * (score.id === 'defeat' ? 3.0 : 2.1)),
        );
    left[i] = Math.tanh(filterL * 1.08) * fade;
    right[i] = Math.tanh(filterR * 1.08) * fade;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const normalization = 0.48 / Math.max(peak, 0.00001);
  for (let i = 0; i < length; i++) {
    left[i] *= normalization;
    right[i] *= normalization;
  }
  if (score.loop) {
    // A smooth DC correction brings the last sample to the first without advancing
    // into the next phrase or duplicating its opening milliseconds at the join.
    const fadeSamples = Math.round(RATE * 0.035);
    const correctionLeft = left[0] - left[length - 1],
      correctionRight = right[0] - right[length - 1];
    for (let i = 0; i < fadeSamples; i++) {
      const position = i / (fadeSamples - 1),
        mix = 0.5 - 0.5 * Math.cos(Math.PI * position);
      const last = length - fadeSamples + i;
      left[last] += correctionLeft * mix;
      right[last] += correctionRight * mix;
    }
    left[length - 1] = left[0];
    right[length - 1] = right[0];
  }
  return { left, right, duration };
}
function encodeStereo(left: Float64Array, right: Float64Array): Buffer {
  const output = Buffer.alloc(44 + left.length * 4);
  output.write('RIFF');
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(2, 22);
  output.writeUInt32LE(RATE, 24);
  output.writeUInt32LE(RATE * 4, 28);
  output.writeUInt16LE(4, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(left.length * 4, 40);
  for (let i = 0; i < left.length; i++) {
    output.writeInt16LE(Math.trunc(left[i] * 32767), 44 + i * 4);
    output.writeInt16LE(Math.trunc(right[i] * 32767), 46 + i * 4);
  }
  return output;
}
export function generateOriginalScore(
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
) {
  const destination = path.join(projectRoot, 'public/assets/music'),
    temporary = path.join(projectRoot, '.local/audio-generation');
  mkdirSync(destination, { recursive: true });
  mkdirSync(temporary, { recursive: true });
  const tracks = [];
  for (const score of SCORES) {
    console.log(`Composing ${score.id}: ${score.title}…`);
    const { left, right, duration } = render(score),
      wav = path.join(temporary, `bgm-${score.id}.wav`),
      ogg = path.join(destination, `bgm-${score.id}.ogg`),
      mp3 = path.join(destination, `bgm-${score.id}.mp3`);
    writeFileSync(wav, encodeStereo(left, right));
    const encoded = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        wav,
        '-c:a',
        'libvorbis',
        '-q:a',
        '5',
        '-metadata',
        `title=${score.title}`,
        '-metadata',
        'artist=Concórdia — Original Procedural Score',
        '-metadata',
        'album=Atlas de Impérios',
        '-metadata',
        'copyright=Original composition and synthesis for Concórdia; no third-party recordings.',
        ogg,
      ],
      { encoding: 'utf8' },
    );
    if (encoded.status !== 0) throw new Error(`ffmpeg failed: ${encoded.stderr}`);
    // Encode the compatibility file from the original PCM, not from lossy Vorbis.
    const fallbackEncoded = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        wav,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-metadata',
        `title=${score.title}`,
        '-metadata',
        'artist=Concórdia — Original Procedural Score',
        '-metadata',
        'album=Atlas de Impérios',
        '-metadata',
        'copyright=Original composition and synthesis for Concórdia; no third-party recordings.',
        mp3,
      ],
      { encoding: 'utf8' },
    );
    if (fallbackEncoded.status !== 0)
      throw new Error(`ffmpeg MP3 fallback failed: ${fallbackEncoded.stderr}`);
    let square = 0,
      peak = 0;
    for (let i = 0; i < left.length; i++) {
      square += (left[i] * left[i] + right[i] * right[i]) / 2;
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    }
    const bytes = readFileSync(ogg),
      fallbackBytes = readFileSync(mp3);
    tracks.push({
      id: score.id,
      title: score.title,
      url: `/assets/music/bgm-${score.id}.ogg`,
      durationSeconds: duration,
      bpm: score.bpm,
      bars: score.bars,
      loop: score.loop,
      channels: 2,
      sampleRate: RATE,
      sourcePeak: Number(peak.toFixed(6)),
      sourceRms: Number(Math.sqrt(square / left.length).toFixed(6)),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      fallbackUrl: `/assets/music/bgm-${score.id}.mp3`,
      fallbackBytes: fallbackBytes.length,
      fallbackSha256: createHash('sha256').update(fallbackBytes).digest('hex'),
      description: score.description,
    });
    unlinkSync(wav);
    console.log(
      `${score.id}: ${duration.toFixed(1)}s, ${(bytes.length / 1024).toFixed(0)}KiB, peak=${peak.toFixed(3)}`,
    );
  }
  writeFileSync(
    path.join(destination, 'manifest.json'),
    JSON.stringify(
      {
        version: '1.2.0',
        title: 'Concórdia — Atlas de Impérios: trilha original',
        generator: 'node --import tsx scripts/generate-music-assets.ts',
        license:
          'Original composition and synthesis made for this repository. No external recordings or sample libraries.',
        tracks,
      },
      null,
      2,
    ) + '\n',
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  generateOriginalScore();
