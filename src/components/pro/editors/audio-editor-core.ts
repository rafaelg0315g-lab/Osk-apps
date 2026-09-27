/**
 * Editor de audio PRO — DSP y grafo de audio (Web Audio API cruda).
 *
 * - FFT radix-2 propia (sin dependencias) para la reducción espectral de ruido.
 * - Encoder WAV 16-bit propio.
 * - Construcción del grafo por clip (compartido entre reproducción en vivo y
 *   render offline con OfflineAudioContext, para que lo que se oye = lo que se exporta).
 */

import {
  EQ_BANDS,
  clipPitch,
  clipSpeed,
  dbToGain,
  clamp,
  mixDuration,
  type AudioClip,
  type AudioProjectData,
  type EqValues,
} from "./audio-editor-types";

// ─── Decodificación ──────────────────────────────────────────

/** Contexto dedicado a decodificar (no suena, no requiere gesto del usuario). */
export function createDecodeContext(): OfflineAudioContext {
  return new OfflineAudioContext(1, 1, 44100);
}

/** decodeAudioData con soporte promise + callback (Safari). */
export function decodeAudio(
  ctx: BaseAudioContext,
  arrayBuffer: ArrayBuffer,
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = ctx.decodeAudioData(
        arrayBuffer,
        (buffer) => resolve(buffer),
        (err) => reject(err instanceof Error ? err : new Error("No se pudo decodificar el audio.")),
      ) as unknown;
      if (
        maybePromise &&
        typeof (maybePromise as Promise<AudioBuffer>).then === "function"
      ) {
        (maybePromise as Promise<AudioBuffer>).then(resolve, reject);
      }
    } catch (err) {
      reject(err instanceof Error ? err : new Error("No se pudo decodificar el audio."));
    }
  });
}

// ─── FFT radix-2 iterativa (in-place) ────────────────────────

function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tmpRe = re[i];
      re[i] = re[j];
      re[j] = tmpRe;
      const tmpIm = im[i];
      im[i] = im[j];
      im[j] = tmpIm;
    }
  }
  // Butterflies
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const bIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + half] = aRe - bRe;
        im[i + k + half] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** IFFT via truco de conjugación: intercambiar re/im, FFT, re-escalar. */
function ifftInPlace(re: Float32Array, im: Float32Array): void {
  fftInPlace(im, re);
  const n = re.length;
  const inv = 1 / n;
  for (let i = 0; i < n; i++) {
    re[i] *= inv;
    im[i] *= inv;
  }
}

function hannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n));
  }
  return w;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ─── Reducción de ruido espectral ────────────────────────────

const NOISE_FFT_SIZE = 1024;
const NOISE_HOP = 512;

/**
 * Reducción de ruido destructiva (devuelve un AudioBuffer NUEVO):
 * - Perfil de ruido: magnitud media de los primeros ~0.5 s.
 * - Spectral gating con ventana Hann, marco 1024, hop 512 (WOLA con normalización).
 * - strength 0..100: umbral = media * (1 + 1.5·s/100); bins bajo el umbral se
 *   atenúan -20 dB · s/100.
 * Corre en el hilo principal pero cede el hilo cada ~40 frames (onProgress 0..1).
 */
export async function reduceNoiseBuffer(
  buffer: AudioBuffer,
  strength: number,
  onProgress?: (progress: number) => void,
): Promise<AudioBuffer> {
  const s = clamp(strength, 0, 100) / 100;
  if (s <= 0 || buffer.length === 0) return cloneBuffer(buffer);

  const sr = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const len = buffer.length;

  const inputs: Float32Array[] = [];
  for (let c = 0; c < channels; c++) inputs.push(buffer.getChannelData(c).slice());
  const outputs: Float32Array[] = [];
  for (let c = 0; c < channels; c++) outputs.push(new Float32Array(len));
  const wsum = new Float32Array(len);

  const win = hannWindow(NOISE_FFT_SIZE);
  const frames = Math.max(1, Math.ceil(len / NOISE_HOP));

  // 1) Perfil de ruido (magnitud media por bin, canal 0, primeros ~0.5 s)
  const profileFrames = Math.max(1, Math.min(frames, Math.ceil((0.5 * sr) / NOISE_HOP)));
  const profile = new Float32Array(NOISE_FFT_SIZE);
  {
    const re = new Float32Array(NOISE_FFT_SIZE);
    const im = new Float32Array(NOISE_FFT_SIZE);
    for (let f = 0; f < profileFrames; f++) {
      const off = f * NOISE_HOP;
      for (let i = 0; i < NOISE_FFT_SIZE; i++) {
        re[i] = off + i < len ? inputs[0][off + i] * win[i] : 0;
      }
      im.fill(0);
      fftInPlace(re, im);
      for (let i = 0; i < NOISE_FFT_SIZE; i++) {
        profile[i] += Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      }
    }
    for (let i = 0; i < NOISE_FFT_SIZE; i++) profile[i] /= profileFrames;
  }

  // 2) Umbral y atenuación por bin
  const factor = 1 + 1.5 * s;
  const reduction = Math.pow(10, (-20 * s) / 20); // -20 dB * strength/100
  const threshold = new Float32Array(NOISE_FFT_SIZE);
  for (let i = 0; i < NOISE_FFT_SIZE; i++) threshold[i] = profile[i] * factor;

  // 3) STFT → gating → ISTFT con overlap-add (Hann análisis + síntesis)
  const re = new Float32Array(NOISE_FFT_SIZE);
  const im = new Float32Array(NOISE_FFT_SIZE);
  for (let f = 0; f < frames; f++) {
    const off = f * NOISE_HOP;
    for (let c = 0; c < channels; c++) {
      const input = inputs[c];
      const out = outputs[c];
      for (let i = 0; i < NOISE_FFT_SIZE; i++) {
        re[i] = off + i < len ? input[off + i] * win[i] : 0;
      }
      im.fill(0);
      fftInPlace(re, im);
      for (let i = 0; i < NOISE_FFT_SIZE; i++) {
        const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
        if (mag < threshold[i]) {
          re[i] *= reduction;
          im[i] *= reduction;
        }
      }
      ifftInPlace(re, im);
      for (let i = 0; i < NOISE_FFT_SIZE; i++) {
        const idx = off + i;
        if (idx < len) out[idx] += re[i] * win[i];
      }
    }
    for (let i = 0; i < NOISE_FFT_SIZE; i++) {
      const idx = off + i;
      if (idx < len) wsum[idx] += win[i] * win[i];
    }
    if (onProgress && f % 40 === 39) {
      onProgress((f + 1) / frames);
      await yieldToUi();
    }
  }

  const next = new AudioBuffer({ numberOfChannels: channels, length: len, sampleRate: sr });
  for (let c = 0; c < channels; c++) {
    const input = inputs[c];
    const out = outputs[c];
    const target = next.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const ws = wsum[i];
      const value = ws > 1e-6 ? out[i] / ws : input[i];
      target[i] = clamp(value, -1, 1);
    }
  }
  return next;
}

// ─── Normalizar / cortes ─────────────────────────────────────

function cloneBuffer(buffer: AudioBuffer): AudioBuffer {
  const next = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: Math.max(1, buffer.length),
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    next.getChannelData(c).set(
      buffer.getChannelData(c).subarray(0, Math.max(1, buffer.length)),
    );
  }
  return next;
}

/** Normaliza el pico a targetDb (default -1 dBFS). Devuelve un AudioBuffer NUEVO. */
export function normalizeBufferToDb(buffer: AudioBuffer, targetDb = -1): AudioBuffer {
  const channels = buffer.numberOfChannels;
  const len = buffer.length;
  let peak = 0;
  for (let c = 0; c < channels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
    }
  }
  const target = dbToGain(targetDb);
  const gain = peak > 1e-6 ? target / peak : 1;
  if (Math.abs(gain - 1) < 1e-4) return cloneBuffer(buffer);
  const next = new AudioBuffer({ numberOfChannels: channels, length: len, sampleRate: buffer.sampleRate });
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(c);
    const dst = next.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = clamp(src[i] * gain, -1, 1);
  }
  return next;
}

/** Conserva solo [startFrame, endFrame) → AudioBuffer nuevo. */
export function keepRegionFrames(
  buffer: AudioBuffer,
  startFrame: number,
  endFrame: number,
): AudioBuffer {
  const start = clamp(Math.round(startFrame), 0, buffer.length);
  const end = clamp(Math.round(endFrame), start, buffer.length);
  const outLen = Math.max(1, end - start);
  const next = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: outLen,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    next.getChannelData(c).set(buffer.getChannelData(c).subarray(start, end));
  }
  return next;
}

/** Elimina [startFrame, endFrame) → AudioBuffer nuevo (más corto). */
export function removeRegionFrames(
  buffer: AudioBuffer,
  startFrame: number,
  endFrame: number,
): AudioBuffer {
  const start = clamp(Math.round(startFrame), 0, buffer.length);
  const end = clamp(Math.round(endFrame), start, buffer.length);
  const removed = end - start;
  const outLen = Math.max(1, buffer.length - removed);
  const next = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: outLen,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = next.getChannelData(c);
    dst.set(src.subarray(0, start), 0);
    if (end < buffer.length) {
      dst.set(src.subarray(end, end + (outLen - start)), start);
    }
  }
  return next;
}

// ─── Encoder WAV 16-bit PCM ──────────────────────────────────

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = Math.max(1, buffer.numberOfChannels);
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const dataSize = numFrames * numCh * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const sample = clamp(channels[c][i], -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

// ─── Grafo de audio compartido (vivo + offline) ──────────────

export interface EqChain {
  input: BiquadFilterNode;
  output: BiquadFilterNode;
  nodes: BiquadFilterNode[];
}

/** Cadena EQ de 8 bandas en serie (lowshelf 60/150/400, peaking 1k/2.4k/6k/10k, highshelf 14k). */
export function createEqChain(ctx: BaseAudioContext, eq: EqValues): EqChain {
  const nodes = EQ_BANDS.map((band) => {
    const filter = ctx.createBiquadFilter();
    filter.type = band.type;
    filter.frequency.value = band.freq;
    if (band.q !== undefined) filter.Q.value = band.q;
    filter.gain.value = eq[band.key] ?? 0;
    return filter;
  });
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return { input: nodes[0], output: nodes[nodes.length - 1], nodes };
}

export interface ScheduleClipOptions {
  ctx: BaseAudioContext;
  clip: AudioClip;
  buffer: AudioBuffer;
  /** Momento (ctx.currentTime) en que arranca el clip. */
  when: number;
  /** Posición inicial DENTRO del clip, en segundos de mezcla (para seeks). */
  clipOffset?: number;
  destination: AudioNode;
}

export interface ScheduledClip {
  source: AudioBufferSourceNode;
  nodes: AudioNode[];
  extraSources: AudioScheduledSourceNode[];
}

/**
 * Construye el grafo completo de UN clip y lo programa:
 * source (playbackRate = speed × 2^(semitonos/12) — cambia velocidad y tono)
 *   → [teléfono: highpass 300 + lowpass 3400]
 *   → [robot: ring mod 50 Hz cuadrada (gain param modulada por oscilador)]
 *   → [eco: delay 0.3 s + feedback 0.35 + wet 0.4]
 *   → clipGain (ganancia con ramps lineales de fadeIn/fadeOut)
 *   → destination (normalmente el input de la cadena EQ).
 */
export function scheduleClipOnContext(opts: ScheduleClipOptions): ScheduledClip {
  const { ctx, clip, buffer, when, destination } = opts;
  const clipOffset = Math.max(0, opts.clipOffset ?? 0);
  const speed = clipSpeed(clip);
  const rate = speed * Math.pow(2, clipPitch(clip) / 12);
  const clipDur = buffer.duration / speed;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;

  const nodes: AudioNode[] = [source];
  const extraSources: AudioScheduledSourceNode[] = [];
  let head: AudioNode = source;

  // Teléfono: pasa-banda 300–3400 Hz (highpass + lowpass en serie)
  if (clip.preset === "telephone") {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    head.connect(hp);
    hp.connect(lp);
    head = lp;
    nodes.push(hp, lp);
  }

  // Robot: ring modulation con oscilador cuadrado de 50 Hz
  if (clip.preset === "robot") {
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 50;
    const depth = ctx.createGain();
    depth.gain.value = 1;
    osc.connect(depth);
    depth.connect(ring.gain);
    head.connect(ring);
    head = ring;
    nodes.push(ring, osc, depth);
    extraSources.push(osc);
  }

  // Eco: delay 0.3 s, feedback 0.35, wet 0.4 (dry siempre pasa)
  if (clip.preset === "echo") {
    const sum = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    head.connect(sum);
    head.connect(delay);
    delay.connect(wet);
    wet.connect(sum);
    delay.connect(feedback);
    feedback.connect(delay);
    head = sum;
    nodes.push(sum, delay, wet, feedback);
  }

  // Ganancia del clip con fades lineales
  const gainNode = ctx.createGain();
  const g = clamp(clip.gain, 0, 2);
  const param = gainNode.gain;
  const fadeIn = clamp(clip.fadeIn ?? 0, 0, 5);
  const fadeOut = clamp(clip.fadeOut ?? 0, 0, 5);
  const tAt = (local: number) => when + Math.max(0, local - clipOffset);

  const inFadeZone = fadeIn > 0 && clipOffset < fadeIn;
  param.setValueAtTime(inFadeZone ? g * (clipOffset / fadeIn) : g, when);
  if (inFadeZone) param.linearRampToValueAtTime(g, tAt(fadeIn));
  const fadeOutBegin = clipDur - fadeOut;
  if (fadeOut > 0 && fadeOutBegin > clipOffset) {
    param.setValueAtTime(g, tAt(fadeOutBegin));
    param.linearRampToValueAtTime(0.0001, tAt(clipDur));
  }

  head.connect(gainNode);
  gainNode.connect(destination);
  nodes.push(gainNode);

  const bufferOffset = clamp(clipOffset * speed, 0, Math.max(0, buffer.duration - 0.001));
  source.start(when, bufferOffset);
  if (extraSources.length > 0) {
    const oscStopAt = when + Math.max(0.05, clipDur - clipOffset);
    for (const osc of extraSources) {
      osc.start(when);
      osc.stop(oscStopAt);
    }
  }
  return { source, nodes, extraSources };
}

/**
 * Render completo de la mezcla con OfflineAudioContext (44.1 kHz, estéreo):
 * mismo grafo que la reproducción en vivo (fades, velocidad/tono, presets, EQ, master).
 */
export async function renderMixOffline(
  data: AudioProjectData,
  buffers: Map<string, AudioBuffer>,
  sampleRate = 44100,
): Promise<AudioBuffer | null> {
  const total = mixDuration(data.clips, buffers);
  if (!(total > 0)) return null;
  const ctx = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil((total + 0.25) * sampleRate)),
    sampleRate,
  );
  const chain = createEqChain(ctx, data.eq);
  const master = ctx.createGain();
  master.gain.value = dbToGain(data.masterGainDb);
  chain.output.connect(master);
  master.connect(ctx.destination);
  for (const clip of data.clips) {
    if (clip.muted) continue;
    const buffer = buffers.get(clip.mediaId);
    if (!buffer) continue;
    scheduleClipOnContext({
      ctx,
      clip,
      buffer,
      when: clip.start + 0.02,
      clipOffset: 0,
      destination: chain.input,
    });
  }
  return await ctx.startRendering();
}
