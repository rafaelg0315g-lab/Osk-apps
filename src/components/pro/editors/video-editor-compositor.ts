/**
 * Compositor de canvas del editor de video PRO.
 * Dibuja un frame compuesto (clip activo + fade + textos) en cualquier
 * contexto 2D: tanto el canvas de preview como el canvas de exportación.
 *
 * DECISIÓN DE TRANSICIÓN: el "fundido" se implementa como FADE-IN DESDE NEGRO
 * al inicio de cada clip (excepto el primero) durante `transition.duration`.
 * Es simple, robusto y visualmente claro; no requiere congelar el último
 * frame del clip anterior.
 */

import type { MediaEntry } from "./video-editor-media";
import { clamp, type TextOverlay } from "./video-editor-types";

export interface DrawSceneArgs {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Ancho de la resolución de trabajo (para escalar tamaños de fuente). */
  referenceWidth: number;
  entry: MediaEntry | null;
  /** Nombre del clip cuando no hay medio disponible (placeholder). */
  placeholderName: string | null;
  /** Alfa del frame: 1 normal, <1 durante el fade-in desde negro. */
  alpha: number;
  /** Textos activos (ya filtrados por tiempo). */
  texts: TextOverlay[];
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  name: string,
): void {
  ctx.save();
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);
  const pad = Math.round(height * 0.06);
  ctx.strokeStyle = "#3f3f46";
  ctx.lineWidth = Math.max(2, Math.round(height * 0.008));
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#a1a1aa";
  const titleSize = Math.max(14, Math.round(height * 0.055));
  ctx.font = `600 ${titleSize}px system-ui, sans-serif`;
  ctx.fillText("Medio no disponible", width / 2, height / 2 - titleSize * 0.7);
  const subSize = Math.max(11, Math.round(height * 0.032));
  ctx.font = `${subSize}px system-ui, sans-serif`;
  ctx.fillStyle = "#71717a";
  ctx.fillText(name, width / 2, height / 2 + titleSize * 0.7, width * 0.86);
  ctx.restore();
}

function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  entry: MediaEntry,
  alpha: number,
): void {
  const el = entry.el;
  if (el.readyState < 2 || entry.width <= 0 || entry.height <= 0) return;
  // "contain": el frame completo siempre visible (bandas negras si el aspecto difiere).
  const scale = Math.min(width / entry.width, height / entry.height);
  const w = entry.width * scale;
  const h = entry.height * scale;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(el, (width - w) / 2, (height - h) / 2, w, h);
  ctx.restore();
}

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: TextOverlay,
  scale: number,
): void {
  let fontSize = Math.max(8, text.fontSize * scale);
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  const maxWidth = width * 0.92;
  const measured = ctx.measureText(text.text).width;
  if (measured > maxWidth && measured > 0) {
    fontSize = fontSize * (maxWidth / measured);
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  }
  const pad = height * 0.08;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y: number;
  if (text.position === "top") {
    y = pad + fontSize / 2;
  } else if (text.position === "center") {
    y = height / 2;
  } else {
    y = height - pad - fontSize / 2;
  }
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, fontSize * 0.07);
  ctx.strokeStyle = "rgba(0,0,0,0.62)";
  ctx.strokeText(text.text, width / 2, y);
  ctx.fillStyle = text.color;
  ctx.fillText(text.text, width / 2, y);
}

/** Dibuja un frame completo (fondo negro + video con alfa + textos). */
export function drawScene(args: DrawSceneArgs): void {
  const { ctx, width, height, referenceWidth, entry, placeholderName, alpha, texts } = args;
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  if (entry) {
    drawVideoFrame(ctx, width, height, entry, alpha);
  } else if (placeholderName) {
    drawPlaceholder(ctx, width, height, placeholderName);
  }
  const textScale = referenceWidth > 0 ? width / referenceWidth : 1;
  for (const text of texts) {
    drawTextLine(ctx, width, height, text, textScale);
  }
  ctx.restore();
}

/** Miniatura JPEG (dataURL) del canvas de preview, ancho ~320px. */
export function captureThumbnail(source: HTMLCanvasElement, maxWidth = 320): string | null {
  try {
    const w0 = source.width;
    const h0 = source.height;
    if (w0 <= 0 || h0 <= 0) return null;
    const scale = Math.min(1, maxWidth / w0);
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d");
    if (!tctx) return null;
    tctx.drawImage(source, 0, 0, w, h);
    return tmp.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}
