/**
 * Aplicador de operaciones del Asistente IA para el editor de video.
 * Switch EXHAUSTIVO sobre el catálogo de /api/ai/chat (scene "video-editor"):
 * addText, setClipVolume, setTransition, removeClip, moveClip.
 * Función PURA: recibe el proyecto y devuelve uno nuevo + conteo de aplicadas.
 */

import {
  clamp,
  clipTrimLength,
  MIN_CLIP_LEN,
  newId,
  totalDuration,
  type TextPosition,
  type TransitionType,
  type VideoProjectData,
} from "./video-editor-types";

export interface AiApplyResult {
  data: VideoProjectData;
  applied: number;
  /** Operaciones recibidas pero no reconocidas. */
  unknown: string[];
}

const POSITIONS: TextPosition[] = ["top", "center", "bottom"];
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function toInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toFloat(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function applyAiOperations(
  data: VideoProjectData,
  operations: unknown[],
): AiApplyResult {
  let clips = data.clips.map((c) => ({ ...c }));
  const texts = data.texts.map((t) => ({ ...t }));
  let transition = { ...data.transition };
  let applied = 0;
  const unknown: string[] = [];

  const total = (list: typeof clips) => totalDuration(list);

  for (const raw of Array.isArray(operations) ? operations : []) {
    const op = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    switch (op.op) {
      case "addText": {
        const text = typeof op.text === "string" ? op.text.trim().slice(0, 300) : "";
        if (!text) {
          unknown.push("addText (sin texto)");
          break;
        }
        const t = total(clips);
        const rawStart = toFloat(op.start);
        const rawEnd = toFloat(op.end);
        // Si la IA no especifica ventana temporal: 0..total (o 0..3 sin clips).
        let start = rawStart !== null ? Math.max(0, rawStart) : 0;
        let end =
          rawEnd !== null && rawEnd > start
            ? rawEnd
            : rawStart !== null
              ? start + 3
              : Math.max(t, 3);
        if (t > 0) {
          end = clamp(end, start + 1, Math.max(t, start + 1));
          start = clamp(start, 0, Math.max(0, t - 1));
        }
        const position = POSITIONS.includes(op.position as TextPosition)
          ? (op.position as TextPosition)
          : "bottom";
        const color = typeof op.color === "string" && HEX_RE.test(op.color) ? op.color : "#ffffff";
        const fontSize = clamp(toFloat(op.fontSize) ?? 42, 12, 120);
        texts.push({
          id: newId("t"),
          text,
          fontSize,
          color,
          position,
          start,
          end,
        });
        applied += 1;
        break;
      }
      case "setClipVolume": {
        const idx = toInt(op.clipIndex);
        const volume = toFloat(op.volume);
        if (idx === null || volume === null || idx < 0 || idx >= clips.length || volume < 0 || volume > 2) {
          unknown.push("setClipVolume (índice o volumen inválido)");
          break;
        }
        clips = clips.map((c, i) => (i === idx ? { ...c, volume: clamp(volume, 0, 2) } : c));
        applied += 1;
        break;
      }
      case "setTransition": {
        const type = (op.type as TransitionType) === "fade" ? "fade" : (op.type as TransitionType) === "none" ? "none" : null;
        if (type !== "fade" && type !== "none") {
          unknown.push("setTransition (tipo inválido)");
          break;
        }
        const duration = clamp(toFloat(op.duration) ?? 0.5, 0.2, 2);
        transition = { type, duration };
        applied += 1;
        break;
      }
      case "removeClip": {
        const idx = toInt(op.clipIndex);
        if (idx === null || idx < 0 || idx >= clips.length) {
          unknown.push("removeClip (índice inválido)");
          break;
        }
        clips = clips.filter((_, i) => i !== idx);
        applied += 1;
        break;
      }
      case "moveClip": {
        const from = toInt(op.from);
        const to = toInt(op.to);
        if (
          from === null ||
          to === null ||
          from < 0 ||
          from >= clips.length ||
          to < 0 ||
          to >= clips.length ||
          from === to
        ) {
          unknown.push("moveClip (índices inválidos)");
          break;
        }
        clips = moveItem(clips, from, to);
        applied += 1;
        break;
      }
      default:
        unknown.push(String(op.op ?? "operación sin nombre"));
        break;
    }
  }

  // Defensivo: garantiza trims válidos tras cualquier reordenación/eliminación.
  clips = clips.map((c) => {
    const len = clipTrimLength(c);
    if (len >= MIN_CLIP_LEN) return c;
    const start = clamp(c.trimStart, 0, Math.max(0, c.duration - MIN_CLIP_LEN));
    const end = Math.min(Math.max(c.duration, start + MIN_CLIP_LEN), start + MIN_CLIP_LEN);
    return { ...c, trimStart: start, trimEnd: Math.max(end, start + MIN_CLIP_LEN) };
  });

  return { data: { clips, texts, transition }, applied, unknown };
}
