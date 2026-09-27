import { AudioLines, Film, ImagePlus, type LucideIcon } from "lucide-react";

/**
 * OSK APPS PROFESIONAL — editores avanzados con proyectos guardables.
 * Cada editor tiene su propia vista "Mis proyectos" y su URL de proyecto.
 */
export type ProToolType = "image" | "video" | "audio";

export interface ProToolMeta {
  type: ProToolType;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  icon: LucideIcon;
  /** URL de la vista "Mis proyectos" de este editor. */
  hrefBase: string;
  /** Chip del icono (colores de acento, sin azul/índigo). */
  chipClass: string;
  /** Clases del botón de acento del editor. */
  buttonClass: string;
}

export const PRO_TOOLS: Record<ProToolType, ProToolMeta> = {
  image: {
    type: "image",
    name: "Editor de Imagen",
    tagline: "Edición por capas con pincel, filtros y texto",
    description:
      "Editor tipo Photoshop: capas, pincel, selecciones, filtros, texto y exportación en múltiples formatos.",
    features: [
      "Capas y pincel con selección",
      "Filtros y ajustes por capa",
      "Eliminador de objetos con IA (próximamente)",
      "Exporta PNG, JPG y WebP",
    ],
    icon: ImagePlus,
    hrefBase: "/pro/image",
    chipClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    buttonClass: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  video: {
    type: "video",
    name: "Editor de Video",
    tagline: "Timeline multipista con cortes y transiciones",
    description:
      "Editor de video con timeline: corta, une, agrega transiciones, textos y exporta con ffmpeg.",
    features: [
      "Timeline multipista",
      "Cortes, unión y transiciones",
      "Textos y efectos sobre el video",
      "Exporta MP4 / WebM (próximamente)",
    ],
    icon: Film,
    hrefBase: "/pro/video",
    chipClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    buttonClass: "bg-violet-600 hover:bg-violet-700 text-white",
  },
  audio: {
    type: "audio",
    name: "Editor de Audio",
    tagline: "Waveform, cortes, EQ y efectos de voz",
    description:
      "Editor de audio con waveform: corta, mezcla pistas, ecualiza y aplica efectos de voz.",
    features: [
      "Waveform con zoom y selección",
      "Cortar, unir y mezclar pistas",
      "Ecualizador y modulador de voz",
      "Eliminación de ruido (próximamente)",
    ],
    icon: AudioLines,
    hrefBase: "/pro/audio",
    chipClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
  },
};

export const PRO_TOOL_LIST: ProToolMeta[] = [PRO_TOOLS.image, PRO_TOOLS.video, PRO_TOOLS.audio];

export function isProToolType(value: string): value is ProToolType {
  return value === "image" || value === "video" || value === "audio";
}
