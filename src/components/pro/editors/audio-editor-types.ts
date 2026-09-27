/**
 * Editor de audio PRO — modelo de datos SERIALIZABLE (lo único que viaja en `data`).
 *
 * Reglas duras:
 * - NUNCA guardar AudioBuffers aquí (no son serializables): los buffers viven en
 *   memoria (Map<mediaId, AudioBuffer>) y los bytes originales en IndexedDB bajo mediaId.
 * - Solo ids, segundos, ganancias y flags.
 */

export type EqBandKey =
  | "60Hz"
  | "150Hz"
  | "400Hz"
  | "1kHz"
  | "2.4kHz"
  | "6kHz"
  | "10kHz"
  | "14kHz";

export interface EqBandDef {
  key: EqBandKey;
  label: string;
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

/** Cadena fija de 8 filtros biquad (lowshelf / peaking / highshelf). */
export const EQ_BANDS: EqBandDef[] = [
  { key: "60Hz", label: "60 Hz", type: "lowshelf", freq: 60 },
  { key: "150Hz", label: "150 Hz", type: "lowshelf", freq: 150 },
  { key: "400Hz", label: "400 Hz", type: "lowshelf", freq: 400 },
  { key: "1kHz", label: "1 kHz", type: "peaking", freq: 1000, q: 1 },
  { key: "2.4kHz", label: "2.4 kHz", type: "peaking", freq: 2400, q: 1 },
  { key: "6kHz", label: "6 kHz", type: "peaking", freq: 6000, q: 1 },
  { key: "10kHz", label: "10 kHz", type: "peaking", freq: 10000, q: 1 },
  { key: "14kHz", label: "14 kHz", type: "highshelf", freq: 14000 },
];

export type EqValues = Record<EqBandKey, number>;

export const DEFAULT_EQ: EqValues = {
  "60Hz": 0,
  "150Hz": 0,
  "400Hz": 0,
  "1kHz": 0,
  "2.4kHz": 0,
  "6kHz": 0,
  "10kHz": 0,
  "14kHz": 0,
};

export interface AudioClip {
  id: string;
  mediaId: string;
  name: string;
  /** Posición de inicio en la mezcla (segundos). */
  start: number;
  /** Ganancia lineal 0..2 (1 = sin cambio). */
  gain: number;
  muted: boolean;
  fadeIn?: number;
  fadeOut?: number;
  pitchSemitones?: number;
  speedRate?: number;
  /** "robot" | "echo" | "chipmunk" | "deep" | "telephone" | null. */
  preset?: string | null;
}

export interface AudioProjectData {
  clips: AudioClip[];
  eq: EqValues;
  masterGainDb: number;
}

// ─── Límites y rangos ────────────────────────────────────────

export const MAX_CLIPS = 8;
export const MAX_FILE_MB = 100;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 2;
export const MAX_PITCH = 12;
export const MAX_FADE = 5;
export const MAX_GAIN_DB = 12;
export const MIN_GAIN_DB = -24;

// ─── Presets de voz ──────────────────────────────────────────

export const VOICE_PRESET_KEYS = [
  "robot",
  "echo",
  "chipmunk",
  "deep",
  "telephone",
] as const;
export type VoicePresetKey = (typeof VOICE_PRESET_KEYS)[number];

export const VOICE_PRESETS: { value: string; label: string }[] = [
  { value: "none", label: "Ninguno" },
  { value: "robot", label: "Robot" },
  { value: "echo", label: "Eco" },
  { value: "chipmunk", label: "Ardilla" },
  { value: "deep", label: "Profundo" },
  { value: "telephone", label: "Teléfono" },
];

/** Parámetros que fija cada preset de voz al aplicarse. */
export function presetParams(preset: string): {
  preset: string | null;
  speedRate: number;
  pitchSemitones: number;
} {
  switch (preset) {
    case "robot":
      return { preset: "robot", speedRate: 1, pitchSemitones: 0 };
    case "echo":
      return { preset: "echo", speedRate: 1, pitchSemitones: 0 };
    case "telephone":
      return { preset: "telephone", speedRate: 1, pitchSemitones: 0 };
    case "chipmunk":
      return { preset: null, speedRate: 1.5, pitchSemitones: 0 };
    case "deep":
      return { preset: null, speedRate: 0.75, pitchSemitones: 0 };
    default:
      return { preset: null, speedRate: 1, pitchSemitones: 0 };
  }
}

/** Valor que muestra el Select de voz para un clip (deriva Ardilla/Profundo por velocidad). */
export function voiceValueForClip(clip: AudioClip): string {
  if (clip.preset) return clip.preset;
  const speed = clipSpeed(clip);
  if (Math.abs(speed - 1.5) < 0.001) return "chipmunk";
  if (Math.abs(speed - 0.75) < 0.001) return "deep";
  return "none";
}

// ─── Presets del ecualizador ─────────────────────────────────

export const EQ_PRESETS: { value: string; label: string; values: EqValues }[] = [
  {
    value: "flat",
    label: "Plano",
    values: { ...DEFAULT_EQ },
  },
  {
    value: "bass",
    label: "Refuerzo graves",
    values: { "60Hz": 6, "150Hz": 4, "400Hz": 1, "1kHz": 0, "2.4kHz": 0, "6kHz": 0, "10kHz": 0, "14kHz": 0 },
  },
  {
    value: "voice",
    label: "Voz clara",
    values: { "60Hz": -4, "150Hz": -2, "400Hz": 0, "1kHz": 3, "2.4kHz": 4, "6kHz": 2, "10kHz": 0, "14kHz": 0 },
  },
  {
    value: "bright",
    label: "Brillo",
    values: { "60Hz": 0, "150Hz": 0, "400Hz": -1, "1kHz": 0, "2.4kHz": 2, "6kHz": 4, "10kHz": 5, "14kHz": 4 },
  },
  {
    value: "telephone",
    label: "Teléfono",
    values: { "60Hz": -15, "150Hz": -12, "400Hz": -2, "1kHz": 4, "2.4kHz": 4, "6kHz": -8, "10kHz": -12, "14kHz": -15 },
  },
];

// ─── Utilidades numéricas / formato ──────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toNum(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseFloat(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Velocidad efectiva del clip (la UI la limita a 0.25..2; se tolera hasta 4). */
export function clipSpeed(clip: AudioClip): number {
  return clamp(clip.speedRate ?? 1, 0.25, 4);
}

export function clipPitch(clip: AudioClip): number {
  return clamp(clip.pitchSemitones ?? 0, -24, 24);
}

/** Duración del clip en la mezcla (segundos de mezcla): buffer.duration / speedRate. */
export function bufferClipDuration(
  buffer: AudioBuffer | null | undefined,
  clip: AudioClip,
): number {
  if (!buffer) return 0;
  return buffer.duration / clipSpeed(clip);
}

/** Duración total de la mezcla = max(start + duración) sobre clips con audio. */
export function mixDuration(
  clips: AudioClip[],
  buffers: Map<string, AudioBuffer>,
): number {
  let total = 0;
  for (const clip of clips) {
    const buffer = buffers.get(clip.mediaId);
    if (!buffer) continue;
    total = Math.max(total, clip.start + buffer.duration / clipSpeed(clip));
  }
  return total;
}

/** "mm:ss.cc" (centésimas). */
export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  let m = Math.floor(s / 60);
  let rest = s - m * 60;
  let ss = Math.floor(rest);
  let cs = Math.round((rest - ss) * 100);
  if (cs >= 100) {
    cs = 0;
    ss += 1;
  }
  if (ss >= 60) {
    ss = 0;
    m += 1;
  }
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(m)}:${p2(ss)}.${p2(cs)}`;
}

/** "mm:ss" para la regla del timeline. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Formatea dB con signo ("+3.5 dB"). */
export function formatDb(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} dB`;
}

// ─── Normalización defensiva del estado guardado ─────────────

/**
 * Convierte `initialData` (unknown, viene de IndexedDB) en AudioProjectData válido.
 * Descarta clips corruptos (sin mediaId) y acota todos los valores a sus rangos.
 */
export function normalizeProjectData(raw: unknown): AudioProjectData {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const clipsRaw = Array.isArray(obj.clips) ? obj.clips : [];
  const clips: AudioClip[] = [];
  for (const rawClip of clipsRaw.slice(0, MAX_CLIPS)) {
    if (!rawClip || typeof rawClip !== "object") continue;
    const c = rawClip as Record<string, unknown>;
    const mediaId = typeof c.mediaId === "string" && c.mediaId ? c.mediaId : "";
    if (!mediaId) continue;
    const preset =
      typeof c.preset === "string" &&
      (VOICE_PRESET_KEYS as readonly string[]).includes(c.preset)
        ? c.preset
        : null;
    clips.push({
      id: typeof c.id === "string" && c.id ? c.id : uid(),
      mediaId,
      name:
        typeof c.name === "string" && c.name.trim()
          ? c.name.slice(0, 120)
          : "Audio sin título",
      start: Math.max(0, toNum(c.start, 0, 0, 86400)),
      gain: toNum(c.gain, 1, 0, 2),
      muted: c.muted === true,
      fadeIn: toNum(c.fadeIn, 0, 0, MAX_FADE),
      fadeOut: toNum(c.fadeOut, 0, 0, MAX_FADE),
      pitchSemitones: toNum(c.pitchSemitones, 0, -12, 12),
      speedRate: toNum(c.speedRate, 1, MIN_SPEED, MAX_SPEED),
      preset,
    });
  }
  const eqRaw =
    obj.eq && typeof obj.eq === "object" && !Array.isArray(obj.eq)
      ? (obj.eq as Record<string, unknown>)
      : {};
  const eq: EqValues = { ...DEFAULT_EQ };
  for (const band of EQ_BANDS) {
    eq[band.key] = toNum(eqRaw[band.key], 0, -15, 15);
  }
  return {
    clips,
    eq,
    masterGainDb: toNum(obj.masterGainDb, 0, MIN_GAIN_DB, MAX_GAIN_DB),
  };
}
