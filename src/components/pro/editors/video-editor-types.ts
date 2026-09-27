/**
 * Modelo de datos del editor de video PRO.
 * TODO lo que vive en `data` es 100% JSON-serializable (nunca elementos DOM ni URLs).
 */

export type TextPosition = "top" | "center" | "bottom";
export type TransitionType = "none" | "fade";

export interface VideoClip {
  id: string;
  /** Clave del blob en IndexedDB (`${projectId}:${mediaId}`). */
  mediaId: string;
  name: string;
  /** Duración del archivo ORIGINAL completo (segundos). */
  duration: number;
  /** Segundo (del original) donde empieza el recorte. */
  trimStart: number;
  /** Segundo (del original) donde termina el recorte. */
  trimEnd: number;
  /** Volumen del clip (0..2, 1 = original). */
  volume: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  /** Tamaño de fuente en px relativos a la resolución de trabajo. */
  fontSize: number;
  color: string;
  position: TextPosition;
  /** Instantes (tiempo global del proyecto) en segundos. */
  start: number;
  end: number;
}

export interface TransitionSetting {
  type: TransitionType;
  /** 0.2..2 segundos. */
  duration: number;
}

export interface VideoProjectData {
  clips: VideoClip[];
  texts: TextOverlay[];
  transition: TransitionSetting;
}

export const DEFAULT_TRANSITION_DURATION = 0.5;
export const MAX_IMPORT_MB = 150;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 120;
export const MIN_CLIP_LEN = 0.1;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Duración trimmeada de un clip (lo que ocupa en la timeline). */
export function clipTrimLength(clip: VideoClip): number {
  return Math.max(0, (clip.trimEnd - clip.trimStart) || 0);
}

/**
 * Offsets de cada clip en el tiempo global. SIEMPRE derivado, nunca guardado:
 * offsets[i] = suma de duraciones trimmeadas de los clips anteriores.
 */
export function computeClipOffsets(clips: VideoClip[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const clip of clips) {
    offsets.push(acc);
    acc += clipTrimLength(clip);
  }
  return offsets;
}

/** Duración total del proyecto (suma de duraciones trimmeadas). */
export function totalDuration(clips: VideoClip[]): number {
  let acc = 0;
  for (const clip of clips) acc += clipTrimLength(clip);
  return acc;
}

/** Índice del clip activo en el tiempo global t (-1 si no hay clips). */
export function findActiveClipIndex(clips: VideoClip[], offsets: number[], t: number): number {
  for (let i = clips.length - 1; i >= 0; i--) {
    if (t >= offsets[i]) return i;
  }
  return clips.length > 0 ? 0 : -1;
}

/** Formato mm:ss (ej. "1:07"). */
export function formatTimecode(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const POSITIONS: TextPosition[] = ["top", "center", "bottom"];

function toNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toStringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeClip(raw: unknown, fallbackName: string): VideoClip | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const mediaId = typeof r.mediaId === "string" && r.mediaId ? r.mediaId : null;
  if (!mediaId) return null;
  const duration = Math.max(0, toNumber(r.duration, 0));
  const volume = clamp(toNumber(r.volume, 1), 0, 2);
  const trimStart = clamp(toNumber(r.trimStart, 0), 0, Math.max(0, duration));
  // Si el trim guardado es inválido se recupera al clip completo.
  let trimEnd = toNumber(r.trimEnd, duration);
  if (!(trimEnd > trimStart)) trimEnd = duration > trimStart ? duration : trimStart + MIN_CLIP_LEN;
  trimEnd = clamp(trimEnd, trimStart + MIN_CLIP_LEN, Math.max(duration, trimStart + MIN_CLIP_LEN));
  return {
    id: toStringValue(r.id, newId("c")),
    mediaId,
    name: toStringValue(r.name, fallbackName),
    duration,
    trimStart,
    trimEnd,
    volume,
  };
}

function normalizeText(raw: unknown): TextOverlay | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text : "";
  if (!text.trim()) return null;
  const start = Math.max(0, toNumber(r.start, 0));
  let end = toNumber(r.end, start + 3);
  if (!(end > start)) end = start + 3;
  const position = POSITIONS.includes(r.position as TextPosition)
    ? (r.position as TextPosition)
    : "bottom";
  const color = typeof r.color === "string" && HEX_COLOR_RE.test(r.color) ? r.color : "#ffffff";
  return {
    id: toStringValue(r.id, newId("t")),
    text: text.slice(0, 300),
    fontSize: clamp(toNumber(r.fontSize, 42), MIN_FONT_SIZE, MAX_FONT_SIZE),
    color,
    position,
    start,
    end,
  };
}

/**
 * Normaliza datos persistidos (desconocidos) a un proyecto válido y defensivo.
 * Nunca lanza: siempre devuelve una estructura utilizable.
 */
export function normalizeVideoProject(raw: unknown): VideoProjectData {
  const fallback: VideoProjectData = {
    clips: [],
    texts: [],
    transition: { type: "none", duration: DEFAULT_TRANSITION_DURATION },
  };
  if (typeof raw !== "object" || raw === null) return fallback;
  const r = raw as Record<string, unknown>;

  const clips = Array.isArray(r.clips)
    ? r.clips
        .map((c, i) => normalizeClip(c, `Clip ${i + 1}`))
        .filter((c): c is VideoClip => c !== null)
    : [];

  const texts = Array.isArray(r.texts)
    ? r.texts.map((t) => normalizeText(t)).filter((t): t is TextOverlay => t !== null)
    : [];

  const tr =
    typeof r.transition === "object" && r.transition !== null
      ? (r.transition as Record<string, unknown>)
      : {};
  const type: TransitionType = tr.type === "fade" ? "fade" : "none";
  const duration = clamp(
    toNumber(tr.duration, DEFAULT_TRANSITION_DURATION),
    0.2,
    2,
  );

  return { clips, texts, transition: { type, duration } };
}

export function emptyProject(): VideoProjectData {
  return normalizeVideoProject(null);
}
