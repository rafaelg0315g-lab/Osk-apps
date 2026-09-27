/**
 * Utilidades de exportación del editor de video PRO.
 * Pipeline: canvas.captureStream(30) + MediaStreamAudioDestinationNode → MediaRecorder.
 * Sin ffmpeg.wasm ni WebCodecs: la exportación ocurre EN TIEMPO REAL.
 */

export interface ExportFormat {
  mime: string;
  label: string;
  ext: string;
}

/** Preferencia de formato, sondada con MediaRecorder.isTypeSupported. */
export const EXPORT_FORMAT_CANDIDATES: ExportFormat[] = [
  { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", label: "MP4 (H.264 + AAC)", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", label: "WebM (VP9 + Opus)", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", label: "WebM (VP8 + Opus)", ext: "webm" },
  { mime: "video/webm", label: "WebM", ext: "webm" },
];

/** Devuelve el mejor formato soportado por el navegador (null si no hay MediaRecorder). */
export function pickExportFormat(): ExportFormat | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const format of EXPORT_FORMAT_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(format.mime)) return format;
    } catch {
      // seguir con el siguiente candidato
    }
  }
  return null;
}

export type ExportResolution = "original" | "1080p" | "720p" | "480p";

export const EXPORT_RESOLUTIONS: { value: ExportResolution; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
];

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/**
 * Tamaño de salida para la resolución elegida, conservando el aspecto del
 * proyecto (máx 16:9: 1080p→1920×1080, 720p→1280×720, 480p→854×480).
 * Dimensiones pares (requisito de los codecs).
 */
export function computeExportSize(
  width: number,
  height: number,
  resolution: ExportResolution,
): { width: number; height: number } {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  if (resolution === "original" || w <= 0 || h <= 0) {
    return { width: even(w), height: even(h) };
  }
  const maxH = resolution === "1080p" ? 1080 : resolution === "720p" ? 720 : 480;
  const maxW = (maxH * 16) / 9;
  const scale = Math.min(maxW / w, maxH / h);
  return { width: even(w * scale), height: even(h * scale) };
}

/** Sanitiza el nombre del proyecto para usarlo como nombre de archivo. */
export function sanitizeFilename(name: string, fallback = "video"): string {
  const clean = name
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return clean || fallback;
}
