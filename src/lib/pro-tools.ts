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
    tagline: "Edición por capas con pincel, filtros, texto e IA",
    description:
      "Editor tipo Photoshop: capas, pincel, selecciones, filtros, texto, eliminación de objetos con IA y exportación en múltiples formatos.",
    features: [
      "Capas, pincel y selección libre",
      "Filtros y ajustes de color",
      "Elimina objetos con IA (inpainting)",
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
    tagline: "Timeline multipista con cortes, textos y transiciones",
    description:
      "Editor de video con timeline: corta, une clips, agrega transiciones, textos y exporta tu video listo para compartir.",
    features: [
      "Timeline con clips reordenables",
      "Cortes, unión y transiciones",
      "Textos y volumen por clip",
      "Exporta video listo para compartir",
    ],
    icon: Film,
    hrefBase: "/pro/video",
    chipClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    buttonClass: "bg-violet-600 hover:bg-violet-700 text-white",
  },
  audio: {
    type: "audio",
    name: "Editor de Audio",
    tagline: "Waveform, cortes, EQ, modulador de voz y anti-ruido",
    description:
      "Editor de audio con waveform: corta, une y mezcla pistas, ecualiza, aplica efectos de voz y elimina ruido de fondo.",
    features: [
      "Waveform con zoom y selección",
      "Cortar, unir y mezclar pistas",
      "Ecualizador de 8 bandas y presets de voz",
      "Reducción de ruido integrada",
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
