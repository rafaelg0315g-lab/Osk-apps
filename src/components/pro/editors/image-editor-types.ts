import type { FabricObject } from "fabric";

/**
 * Tipos y helpers puros del Editor de Imagen PRO (Fabric.js v7).
 * Sin React: todo lo que vive aquí es serializable o puro para facilitar tests y mantenimiento.
 */

// ─── Herramientas ────────────────────────────────────────────

export type ToolId = "select" | "brush" | "text" | "rect" | "circle" | "line";

// ─── Capas ───────────────────────────────────────────────────

/** Icono de capa (se mapea a lucide en el componente). */
export type LayerIconId =
  | "image"
  | "text"
  | "rect"
  | "circle"
  | "line"
  | "path"
  | "group"
  | "object";

/** Fila de la lista de capas (estado runtime, no serializable). */
export interface LayerRow {
  /** Identificador estable runtime del objeto (uid incremental). */
  key: number;
  obj: FabricObject;
  name: string;
  icon: LayerIconId;
  visible: boolean;
  locked: boolean;
  selected: boolean;
}

// ─── Estado de filtros (unidades de la UI) ───────────────────

export interface FiltersState {
  /** -100..100 */
  brightness: number;
  /** -100..100 */
  contrast: number;
  /** -100..100 */
  saturation: number;
  /** 0..20 */
  blur: number;
  grayscale: boolean;
  sepia: boolean;
  invert: boolean;
  /** 0 = apagado; 2..50 = tamaño de bloque */
  pixelate: number;
}

export const DEFAULT_FILTERS: FiltersState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  grayscale: false,
  sepia: false,
  invert: false,
  pixelate: 0,
};

/** Filtro Fabric visto de forma laxa para leer sus valores sin pelear con los genéricos. */
export type LooseFilter = {
  type?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  blur?: number;
  blocksize?: number;
};

// ─── Propiedades de la selección (unidades de la UI) ─────────

export interface SelectionProps {
  fill: string;
  stroke: string;
  /** 0..40 */
  strokeWidth: number;
  /** 0..100 (%) */
  opacity: number;
  fontFamily: string;
  /** 8..200 */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
}

export const DEFAULT_SELECTION_PROPS: SelectionProps = {
  fill: "#111827",
  stroke: "#111827",
  strokeWidth: 2,
  opacity: 100,
  fontFamily: "Arial",
  fontSize: 48,
  bold: false,
  italic: false,
  align: "left",
};

export type SelectionKind = "none" | "multi" | "image" | "text" | "shape";

export const FONTS = ["Arial", "Helvetica", "Georgia", "Courier New"] as const;

// ─── Lienzo (escena) ─────────────────────────────────────────

export interface SceneSize {
  width: number;
  height: number;
}

export const DEFAULT_SCENE: SceneSize = { width: 1080, height: 1080 };
export const MAX_SCENE = 2000;

/**
 * Sobre del estado del proyecto: envuelve el JSON de Fabric junto con el
 * tamaño real del lienzo (Fabric no serializa width/height del canvas).
 */
export interface ImageEditorEnvelope {
  formatVersion: 1;
  width: number;
  height: number;
  fabric: unknown;
}

export function buildEnvelope(scene: SceneSize, fabricJson: unknown): ImageEditorEnvelope {
  return {
    formatVersion: 1,
    width: scene.width,
    height: scene.height,
    fabric: fabricJson,
  };
}

function clampDim(v: unknown, def: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def;
  return Math.min(4000, Math.max(16, n));
}

/**
 * Interpreta `initialData`: acepta el sobre propio (formatVersion 1) o un
 * JSON crudo de Fabric ({version, objects…}) por compatibilidad.
 * Devuelve null si la forma no se reconoce (proyecto nuevo).
 */
export function parseInitialData(data: unknown): { scene: SceneSize; fabric: unknown } | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (rec.formatVersion === 1 && rec.fabric && typeof rec.fabric === "object") {
    const fabricJson = rec.fabric as Record<string, unknown>;
    if (Array.isArray(fabricJson.objects)) {
      return {
        scene: {
          width: clampDim(rec.width, DEFAULT_SCENE.width),
          height: clampDim(rec.height, DEFAULT_SCENE.height),
        },
        fabric: rec.fabric,
      };
    }
  }
  if (Array.isArray(rec.objects)) {
    return {
      scene: {
        width: clampDim(rec.canvasWidth, DEFAULT_SCENE.width),
        height: clampDim(rec.canvasHeight, DEFAULT_SCENE.height),
      },
      fabric: rec,
    };
  }
  return null;
}

// ─── Utilidades numéricas / color ────────────────────────────

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** true si el color de fondo no pintará nada (alfa). */
export function isTransparentBg(bg: unknown): boolean {
  if (typeof bg !== "string") return true;
  const v = bg.trim();
  return v === "" || v === "transparent" || v === "rgba(0, 0, 0, 0)" || v === "rgba(0,0,0,0)";
}

/** Hex válido simple (#rgb, #rgba, #rrggbb, #rrggbbaa). */
export function isHexColor(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())
  );
}

/** Normaliza cualquier color CSS básico a #rrggbb para inputs type="color". */
export function toHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(v);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const rgb = /^rgba?\((\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/i.exec(v);
  if (rgb) {
    const part = (s: string) => clamp(parseInt(s, 10) || 0, 0, 255).toString(16).padStart(2, "0");
    return `#${part(rgb[1])}${part(rgb[2])}${part(rgb[3])}`;
  }
  return fallback;
}

/** Convierte un dataURL en Blob (para descargar sin fetch). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /:(.*?);/.exec(head)?.[1] ?? "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ─── IA ──────────────────────────────────────────────────────

/** Operación que el asistente IA puede pedir para este editor. */
export interface ImageAiOp {
  op: string;
  value?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  /** Coordenadas relativas 0..1 del lienzo. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** 0..1 */
  opacity?: number;
}

/** Burbuja del chat del asistente. */
export interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
}

/** Tamaños soportados por POST /api/ai/image. */
const AI_SIZES: { size: string; w: number; h: number }[] = [
  { size: "1024x1024", w: 1, h: 1 },
  { size: "768x1344", w: 768, h: 1344 },
  { size: "864x1152", w: 864, h: 1152 },
  { size: "1344x768", w: 1344, h: 768 },
  { size: "1152x864", w: 1152, h: 864 },
  { size: "1440x720", w: 1440, h: 720 },
  { size: "720x1440", w: 720, h: 1440 },
];

/** Elige el tamaño de IA cuyo aspecto ratio es más cercano al indicado. */
export function pickAiSize(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return "1024x1024";
  const aspect = width / height;
  let best = AI_SIZES[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const s of AI_SIZES) {
    const diff = Math.abs(Math.log(aspect / (s.w / s.h)));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best.size;
}
