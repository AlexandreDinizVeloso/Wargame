import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUDIO_SAMPLE_RATE,
  generateSfxPCM,
  MUSIC_SPEC,
  normalizeAndFilterPCM,
  peakAmplitude,
  SFX_SPEC,
} from '../shared/audioDSP';
import {
  AUDIO_LIMITER,
  AUDIO_MIXER_DEFAULTS,
  AUDIO_MIXER_STORAGE_KEY,
  MIXER_CHANNELS,
  parseAudioMixer,
} from '../shared/audioMixer';
import { encodePCM16Wav } from '../scripts/generate-sfx-assets';

test('v101 áudio: biquad de dois polos remove agudos e normaliza exatamente sem clipping', () => {
  const length = AUDIO_SAMPLE_RATE;
  const source = new Float64Array(length);
  for (let i = 0; i < length; i++)
    source[i] =
      Math.sin((2 * Math.PI * 100 * i) / AUDIO_SAMPLE_RATE) +
      Math.sin((2 * Math.PI * 8000 * i) / AUDIO_SAMPLE_RATE);
  const filtered = normalizeAndFilterPCM(source, 0.12, 320);
  assert.ok(Math.abs(peakAmplitude(filtered) - 0.12) < 1e-12);
  const magnitude = (hz: number) => {
    let real = 0,
      imaginary = 0;
    for (let i = 2205; i < length; i++) {
      const phase = (2 * Math.PI * hz * i) / AUDIO_SAMPLE_RATE;
      real += filtered[i] * Math.cos(phase);
      imaginary += filtered[i] * Math.sin(phase);
    }
    return Math.hypot(real, imaginary);
  };
  assert.ok(magnitude(8000) / magnitude(100) < 0.005);
  assert.throws(() => normalizeAndFilterPCM([NaN], 0.12, 320));
  assert.throws(() => normalizeAndFilterPCM([1], 1.1, 320));
  assert.throws(() => normalizeAndFilterPCM([1], 0.12, 24000));
});
test('v101 áudio: cinco WAVs têm picos seguros, duração correta e geração determinística', async () => {
  for (const name of Object.keys(SFX_SPEC) as (keyof typeof SFX_SPEC)[]) {
    const spec = SFX_SPEC[name];
    const wav = await readFile(new URL(`../public/assets/sfx/${name}.wav`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal((wav.length - 44) / 2, Math.round(spec.duration * 44100));
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2)
      peak = Math.max(peak, Math.abs(wav.readInt16LE(i)) / 32767);
    assert.ok(peak <= spec.targetPeak && peak >= spec.targetPeak - 1 / 32767, `${name}: ${peak}`);
    assert.ok(peak <= 0.25);
    assert.deepEqual(encodePCM16Wav(generateSfxPCM(name)), wav);
  }
  assert.equal(SFX_SPEC.sail.cutoff, 220);
  assert.ok(SFX_SPEC.sail.cutoff <= 450);
  assert.equal(SFX_SPEC.march.cutoff, 180);
  assert.ok(Object.values(SFX_SPEC).every((spec) => spec.cutoff <= 250));
});
test('v101 áudio: músicas PCM de dezesseis segundos têm pico .55 e junção de loop contínua', async () => {
  for (const name of ['peace', 'war']) {
    const wav = await readFile(new URL(`../public/assets/music/bgm-${name}.wav`, import.meta.url));
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal((wav.length - 44) / 2 / 44100, MUSIC_SPEC.duration);
    let peak = 0,
      energy = 0;
    for (let i = 44; i < wav.length; i += 2) {
      const sample = wav.readInt16LE(i) / 32767;
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    assert.ok(peak <= 0.55 && peak >= 0.55 - 1 / 32767);
    assert.ok(Math.sqrt(energy / ((wav.length - 44) / 2)) > 0.07);
    assert.equal(wav.readInt16LE(44), wav.readInt16LE(wav.length - 2));
  }
});
test('v101 áudio: mixer tem seis canais persistidos, padrões exigidos e limitador seguro', () => {
  assert.equal(AUDIO_MIXER_STORAGE_KEY, 'concordia.audioMixer.v1');
  assert.equal(MIXER_CHANNELS.length, 6);
  assert.deepEqual(AUDIO_MIXER_DEFAULTS, {
    masterVolume: 0.8,
    musicVolume: 0.75,
    combatVolume: 0.18,
    marchVolume: 0.12,
    sailVolume: 0.1,
    uiVolume: 0.2,
  });
  assert.deepEqual(AUDIO_LIMITER, { threshold: -10, knee: 12, ratio: 8 });
  assert.deepEqual(parseAudioMixer(null), AUDIO_MIXER_DEFAULTS);
  assert.deepEqual(parseAudioMixer('{invalid'), AUDIO_MIXER_DEFAULTS);
  const parsed = parseAudioMixer(
    JSON.stringify({ masterVolume: 2, musicVolume: -1, sailVolume: 0.07, combatVolume: 'loud' }),
  );
  assert.equal(parsed.masterVolume, 1);
  assert.equal(parsed.musicVolume, 0);
  assert.equal(parsed.sailVolume, 0.07);
  assert.equal(parsed.combatVolume, 0.18);
});

test('v101 áudio: grafo real do mixer tem seis ganhos, limitação comum e persistência independente', async () => {
  const { CampaignAudio } = await import('../src/audio');
  const previousContext = globalThis.AudioContext,
    previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    previousFetch = globalThis.fetch;
  const store = new Map<string, string>(),
    gains: {
      gain: ReturnType<typeof param>;
      connect: (node: unknown) => void;
      connections: unknown[];
    }[] = [];
  const buffers: { buffer: unknown; connections: unknown[]; started: boolean }[] = [];
  function param() {
    return {
      value: 0,
      setTargetAtTime(value: number) {
        this.value = value;
      },
      setValueAtTime(value: number) {
        this.value = value;
      },
      linearRampToValueAtTime(value: number) {
        this.value = value;
      },
    };
  }
  const limiter = {
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    connect(_node: unknown) {},
  };
  const destination = { name: 'destination' },
    safety = { curve: null as Float32Array | null, oversample: 'none', connect(_node: unknown) {} };
  class Context {
    state = 'running';
    currentTime = 0;
    destination = destination;
    createGain() {
      const connections: unknown[] = [];
      const node = {
        gain: param(),
        connect(target: unknown) {
          connections.push(target);
        },
        connections,
      };
      gains.push(node);
      return node;
    }
    createWaveShaper() {
      return safety;
    }
    createDynamicsCompressor() {
      return limiter;
    }
    createBuffer(_channels: number, length: number, rate: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data, duration: length / rate };
    }
    createBufferSource() {
      const connections: unknown[] = [];
      const source = {
        buffer: null as unknown,
        connections,
        started: false,
        onended: null as (() => void) | null,
        connect(target: unknown) {
          connections.push(target);
        },
        disconnect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.onended?.();
        },
      };
      buffers.push(source);
      return source;
    }
  }
  try {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: Context,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      configurable: true,
    });
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
    const audio = new CampaignAudio();
    let notices = 0;
    const unsubscribe = audio.subscribe(() => notices++);
    audio.unlock();
    assert.equal(gains.length, 6);
    assert.equal(limiter.threshold.value, -10);
    assert.equal(limiter.knee.value, 12);
    assert.equal(limiter.ratio.value, 8);
    assert.ok(safety.curve && peakAmplitude(safety.curve) < 1);
    for (let i = 1; i < gains.length; i++) assert.equal(gains[i].connections[0], gains[0]);
    audio.setMixerVolume('sailVolume', 0.08);
    assert.equal(audio.mixer.sailVolume, 0.08);
    assert.equal(audio.mixer.marchVolume, 0.12);
    assert.equal(JSON.parse(store.get(AUDIO_MIXER_STORAGE_KEY)!).sailVolume, 0.08);
    audio.playSailSound();
    assert.equal(buffers.length, 1);
    assert.equal(buffers[0].connections[0], gains[MIXER_CHANNELS.indexOf('sailVolume')]);
    audio.setMuted(true);
    assert.equal(gains[0].gain.value, 0);
    audio.setMuted(false);
    assert.equal(gains[0].gain.value, 0.8);
    assert.ok(notices >= 3);
    unsubscribe();
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: previousContext,
      writable: true,
      configurable: true,
    });
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    globalThis.fetch = previousFetch;
  }
});
