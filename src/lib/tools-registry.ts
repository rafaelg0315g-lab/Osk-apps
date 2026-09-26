import {
  AlignLeft,
  AudioLines,
  Binary as BinaryIcon,
  Bot,
  Braces,
  Calculator,
  CalendarDays,
  Clapperboard,
  Combine,
  Coins,
  Crop,
  Droplets,
  Eraser,
  FileCode,
  FileDown,
  FileImage,
  FileText,
  FileX,
  Files,
  Film,
  Fingerprint,
  GitCompare as GitCompareIcon,
  Images,
  Image as ImageIcon,
  KeyRound,
  Languages,
  LayoutGrid,
  Link2,
  ListOrdered,
  Lock,
  LockOpen,
  Maximize2,
  MessagesSquare,
  Minimize2,
  Music,
  Package,
  PenLine as PenLineIcon,
  Percent,
  Presentation,
  QrCode,
  Receipt,
  Repeat,
  RotateCw,
  Ruler,
  ScanText,
  Scissors,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  SpellCheck,
  Table,
  TextQuote,
  Type,
  User,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// ============================================================
// OSK APPS — Catálogo completo de herramientas
// La landing muestra TODA la visión del producto.
// status: 'available' → implementada y funcional
// status: 'soon'      → marcada "Próximamente"
// ============================================================

export type ToolCategoryId =
  | "pdf"
  | "imagen"
  | "video"
  | "texto"
  | "dev"
  | "calculadoras"
  | "ia";

export type ToolStatus = "available" | "soon";

export interface ToolCategoryMeta {
  id: ToolCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Clases de color suave para el chip del icono (sin azul/índigo). */
  chipClass: string;
}

export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  category: ToolCategoryId;
  icon: LucideIcon;
  status: ToolStatus;
  /** Términos extra para el buscador. */
  keywords: string[];
}

export const TOOL_CATEGORIES: ToolCategoryMeta[] = [
  {
    id: "pdf",
    label: "PDF",
    description: "Combina, divide, convierte y protege documentos PDF",
    icon: FileText,
    chipClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    id: "imagen",
    label: "Imágenes",
    description: "Comprime, convierte y edita tus imágenes",
    icon: ImageIcon,
    chipClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "video",
    label: "Video y Audio",
    description: "Convierte, comprime y edita video y audio",
    icon: Video,
    chipClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    id: "texto",
    label: "Texto y Documentos",
    description: "Facturas, contador de palabras, contratos y más",
    icon: Type,
    chipClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  },
  {
    id: "dev",
    label: "Utilidades y Dev",
    description: "Enlaces, QR, contraseñas, JSON, hash y más",
    icon: Wrench,
    chipClass: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  },
  {
    id: "calculadoras",
    label: "Calculadoras y Conversores",
    description: "Unidades, fechas, impuestos y divisas",
    icon: Calculator,
    chipClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    id: "ia",
    label: "Inteligencia Artificial",
    description: "Resume, traduce y genera contenido con IA",
    icon: Bot,
    chipClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
];

export const TOOLS: ToolMeta[] = [
  // ─── PDF ───────────────────────────────────────────────
  {
    id: "merge-pdf",
    name: "Combinar PDF",
    description: "Une varios PDF en un solo documento, en el orden que quieras.",
    category: "pdf",
    icon: Combine,
    status: "available",
    keywords: ["unir", "juntar", "merge", "combinar", "fusionar"],
  },
  {
    id: "split-pdf",
    name: "Dividir PDF",
    description: "Extrae un rango de páginas o separa todas las páginas en PDFs individuales.",
    category: "pdf",
    icon: Scissors,
    status: "available",
    keywords: ["separar", "extraer", "cortar", "split", "rango"],
  },
  {
    id: "compress-pdf",
    name: "Comprimir PDF",
    description: "Reduce el peso de tus PDF manteniendo la mejor calidad posible.",
    category: "pdf",
    icon: FileDown,
    status: "soon",
    keywords: ["reducir", "peso", "tamaño", "optimizar"],
  },
  {
    id: "pdf-to-word",
    name: "PDF a Word",
    description: "Convierte tus PDF a documentos Word (.docx) editables.",
    category: "pdf",
    icon: FileText,
    status: "soon",
    keywords: ["word", "docx", "convertir", "office"],
  },
  {
    id: "pdf-to-excel",
    name: "PDF a Excel",
    description: "Extrae tablas de un PDF y conviértelas a hojas de cálculo.",
    category: "pdf",
    icon: Table,
    status: "soon",
    keywords: ["excel", "xlsx", "hoja de cálculo", "tablas"],
  },
  {
    id: "pdf-to-ppt",
    name: "PDF a PowerPoint",
    description: "Transforma tus PDF en presentaciones PowerPoint editables.",
    category: "pdf",
    icon: Presentation,
    status: "soon",
    keywords: ["powerpoint", "pptx", "presentación", "diapositivas"],
  },
  {
    id: "pdf-to-jpg",
    name: "PDF a JPG",
    description: "Convierte cada página del PDF en una imagen JPG.",
    category: "pdf",
    icon: FileImage,
    status: "soon",
    keywords: ["jpg", "jpeg", "png", "imagen", "convertir"],
  },
  {
    id: "jpg-to-pdf",
    name: "JPG a PDF",
    description: "Convierte tus imágenes en un documento PDF.",
    category: "pdf",
    icon: Images,
    status: "soon",
    keywords: ["jpg", "png", "imagen a pdf", "convertir"],
  },
  {
    id: "rotate-pdf",
    name: "Rotar páginas PDF",
    description: "Gira las páginas de tu PDF en el ángulo que necesites.",
    category: "pdf",
    icon: RotateCw,
    status: "soon",
    keywords: ["girar", "rotar", "orientación"],
  },
  {
    id: "delete-pdf-pages",
    name: "Eliminar páginas PDF",
    description: "Borra las páginas que no necesitas de tu documento.",
    category: "pdf",
    icon: FileX,
    status: "soon",
    keywords: ["borrar", "quitar", "eliminar"],
  },
  {
    id: "protect-pdf",
    name: "Proteger PDF",
    description: "Agrega contraseña a tus PDF para mayor seguridad.",
    category: "pdf",
    icon: Lock,
    status: "soon",
    keywords: ["contraseña", "cifrar", "seguridad", "encriptar"],
  },
  {
    id: "unlock-pdf",
    name: "Desbloquear PDF",
    description: "Quita la contraseña de PDFs que te pertenecen.",
    category: "pdf",
    icon: LockOpen,
    status: "soon",
    keywords: ["quitar contraseña", "descifrar", "liberar"],
  },
  {
    id: "sign-pdf",
    name: "Firmar PDF",
    description: "Agrega tu firma digital a documentos PDF.",
    category: "pdf",
    icon: PenLineIcon,
    status: "soon",
    keywords: ["firma", "rubrica", "digital", "contrato"],
  },
  {
    id: "number-pdf-pages",
    name: "Numerar páginas PDF",
    description: "Agrega números de página con la posición y formato que prefieras.",
    category: "pdf",
    icon: ListOrdered,
    status: "soon",
    keywords: ["numerar", "números", "paginar"],
  },
  {
    id: "watermark-pdf",
    name: "Marca de agua PDF",
    description: "Agrega texto o marca de agua a tus documentos.",
    category: "pdf",
    icon: Droplets,
    status: "soon",
    keywords: ["watermark", "marca", "texto", "confidencial"],
  },
  {
    id: "ocr-pdf",
    name: "OCR — PDF escaneado",
    description: "Extrae texto de PDFs escaneados con reconocimiento óptico.",
    category: "pdf",
    icon: ScanText,
    status: "soon",
    keywords: ["ocr", "escaneado", "texto", "reconocimiento"],
  },

  // ─── Imágenes ──────────────────────────────────────────
  {
    id: "compress-image",
    name: "Comprimir imagen",
    description: "Reduce el peso de tus imágenes JPG, PNG y WebP con control de calidad.",
    category: "imagen",
    icon: FileImage,
    status: "available",
    keywords: ["reducir", "peso", "optimizar", "quality", "jpg", "png", "webp"],
  },
  {
    id: "convert-image",
    name: "Convertir imagen",
    description: "Cambia el formato de tus imágenes: PNG, JPG y WebP.",
    category: "imagen",
    icon: Repeat,
    status: "available",
    keywords: ["convertir", "formato", "png", "jpg", "jpeg", "webp"],
  },
  {
    id: "resize-image",
    name: "Redimensionar imagen",
    description: "Cambia el ancho y alto de tus imágenes manteniendo la proporción.",
    category: "imagen",
    icon: Maximize2,
    status: "soon",
    keywords: ["tamaño", "escalar", "resize", "dimensiones"],
  },
  {
    id: "crop-image",
    name: "Recortar imagen",
    description: "Corta y ajusta tus imágenes al área exacta que necesitas.",
    category: "imagen",
    icon: Crop,
    status: "soon",
    keywords: ["cortar", "crop", "ajustar"],
  },
  {
    id: "remove-bg",
    name: "Quitar fondo (IA)",
    description: "Elimina el fondo de tus imágenes automáticamente con IA.",
    category: "imagen",
    icon: Eraser,
    status: "soon",
    keywords: ["fondo", "transparente", "ia", "background"],
  },
  {
    id: "watermark-image",
    name: "Marca de agua en imagen",
    description: "Protege tus imágenes agregando texto o logotipos.",
    category: "imagen",
    icon: Droplets,
    status: "soon",
    keywords: ["watermark", "logo", "proteger"],
  },
  {
    id: "collage",
    name: "Generar collage",
    description: "Combina varias imágenes en un collage con distintas plantillas.",
    category: "imagen",
    icon: LayoutGrid,
    status: "soon",
    keywords: ["collage", "combinar", "mosaico", "plantillas"],
  },
  {
    id: "upscale-image",
    name: "Upscale con IA",
    description: "Mejora la resolución de tus imágenes hasta 4x con IA.",
    category: "imagen",
    icon: Sparkles,
    status: "soon",
    keywords: ["mejorar", "resolución", "hd", "4k", "ia"],
  },
  {
    id: "image-editor",
    name: "Editor básico de imagen",
    description: "Ajusta brillo, contraste, saturación y aplica filtros.",
    category: "imagen",
    icon: SlidersHorizontal,
    status: "soon",
    keywords: ["filtros", "brillo", "contraste", "editar"],
  },

  // ─── Video y Audio ─────────────────────────────────────
  {
    id: "convert-video",
    name: "Convertir video",
    description: "Cambia el formato de tus videos: MP4, WebM, MOV y más.",
    category: "video",
    icon: Clapperboard,
    status: "soon",
    keywords: ["mp4", "webm", "mov", "formato", "convertir"],
  },
  {
    id: "compress-video",
    name: "Comprimir video",
    description: "Reduce el tamaño de tus videos manteniendo la calidad.",
    category: "video",
    icon: Minimize2,
    status: "soon",
    keywords: ["reducir", "peso", "optimizar"],
  },
  {
    id: "extract-audio",
    name: "Extraer audio de video",
    description: "Convierte MP4 a MP3: saca el audio de cualquier video.",
    category: "video",
    icon: Music,
    status: "soon",
    keywords: ["mp3", "audio", "mp4", "extraer", "sonido"],
  },
  {
    id: "trim-video",
    name: "Cortar video",
    description: "Recorta tus videos y quédate solo con el fragmento que quieres.",
    category: "video",
    icon: Scissors,
    status: "soon",
    keywords: ["recortar", "trim", "editar", "fragmento"],
  },
  {
    id: "convert-audio",
    name: "Convertir audio",
    description: "Convierte entre MP3, WAV, OGG, AAC y otros formatos.",
    category: "video",
    icon: AudioLines,
    status: "soon",
    keywords: ["mp3", "wav", "ogg", "aac", "convertir"],
  },
  {
    id: "merge-videos",
    name: "Unir videos",
    description: "Combina varios clips en un solo video continuo.",
    category: "video",
    icon: Combine,
    status: "soon",
    keywords: ["unir", "combinar", "juntar", "merge"],
  },
  {
    id: "video-to-gif",
    name: "Video a GIF",
    description: "Genera GIF animados desde fragmentos de tus videos.",
    category: "video",
    icon: Film,
    status: "soon",
    keywords: ["gif", "animado", "meme"],
  },

  // ─── Texto y Documentos ────────────────────────────────
  {
    id: "invoice-generator",
    name: "Generador de facturas",
    description: "Crea facturas profesionales con cálculo automático de impuestos y exporta a PDF.",
    category: "texto",
    icon: Receipt,
    status: "available",
    keywords: ["factura", "invoice", "cobrar", "presupuesto", "pdf", "impuestos", "iva"],
  },
  {
    id: "word-counter",
    name: "Contador de palabras",
    description: "Cuenta palabras, caracteres, oraciones y tiempo de lectura en tiempo real.",
    category: "texto",
    icon: AlignLeft,
    status: "available",
    keywords: ["palabras", "caracteres", "letras", "texto", "contador", "lectura"],
  },
  {
    id: "spell-checker",
    name: "Corrector ortográfico",
    description: "Revisa y corrige la ortografía de tus textos en español.",
    category: "texto",
    icon: SpellCheck,
    status: "soon",
    keywords: ["ortografía", "corregir", "tildes", "español"],
  },
  {
    id: "contract-generator",
    name: "Generador de contratos",
    description: "Crea contratos simples con plantillas personalizables.",
    category: "texto",
    icon: ScrollText,
    status: "soon",
    keywords: ["contrato", "legal", "plantilla", "acuerdo"],
  },
  {
    id: "markdown-to-pdf",
    name: "Markdown a PDF / Word",
    description: "Convierte tus documentos Markdown a PDF o Word con formato.",
    category: "texto",
    icon: FileCode,
    status: "soon",
    keywords: ["markdown", "md", "pdf", "word", "convertir"],
  },
  {
    id: "cv-builder",
    name: "Generador de CV",
    description: "Crea tu currículum con plantillas profesionales y editor visual.",
    category: "texto",
    icon: User,
    status: "soon",
    keywords: ["cv", "currículum", "hoja de vida", "trabajo", "resume"],
  },

  // ─── Utilidades y Dev ──────────────────────────────────
  {
    id: "link-shortener",
    name: "Acortador de links",
    description: "Acorta URLs y consulta analytics de clics, referrers y dispositivos.",
    category: "dev",
    icon: Link2,
    status: "available",
    keywords: ["url", "corto", "enlace", "acortar", "analytics", "clics", "estadísticas"],
  },
  {
    id: "qr-generator",
    name: "Generador de QR",
    description: "Crea códigos QR personalizados con colores y descárgalos en PNG.",
    category: "dev",
    icon: QrCode,
    status: "available",
    keywords: ["qr", "código", "enlace", "url", "personalizar"],
  },
  {
    id: "password-generator",
    name: "Generador de contraseñas",
    description: "Genera contraseñas seguras y evalúa la fortaleza de las tuyas.",
    category: "dev",
    icon: KeyRound,
    status: "available",
    keywords: ["contraseña", "seguridad", "password", "aleatoria", "validar"],
  },
  {
    id: "json-formatter",
    name: "Formateador JSON",
    description: "Formatea, valida y minifica JSON con detección de errores.",
    category: "dev",
    icon: Braces,
    status: "available",
    keywords: ["json", "formato", "validar", "minify", "pretty", "dev"],
  },
  {
    id: "base64-converter",
    name: "Convertidor Base64",
    description: "Codifica y decodifica texto en Base64 con soporte Unicode.",
    category: "dev",
    icon: BinaryIcon,
    status: "available",
    keywords: ["base64", "encode", "decode", "codificar", "decodificar"],
  },
  {
    id: "hash-generator",
    name: "Generador de hash",
    description: "Calcula MD5, SHA-1, SHA-256 y SHA-512 de cualquier texto.",
    category: "dev",
    icon: Fingerprint,
    status: "available",
    keywords: ["md5", "sha256", "sha1", "sha512", "hash", "checksum"],
  },
  {
    id: "text-diff",
    name: "Comparador de texto",
    description: "Compara dos textos y visualiza las diferencias línea por línea.",
    category: "dev",
    icon: GitCompareIcon,
    status: "soon",
    keywords: ["diff", "comparar", "diferencias", "cambios"],
  },

  // ─── Calculadoras y Conversores ────────────────────────
  {
    id: "unit-converter",
    name: "Conversor de unidades",
    description: "Convierte longitud, masa, temperatura, volumen, datos y más.",
    category: "calculadoras",
    icon: Ruler,
    status: "available",
    keywords: ["unidades", "metros", "kilos", "temperatura", "convertir", "medidas"],
  },
  {
    id: "date-calculator",
    name: "Calculadora de fechas",
    description: "Calcula diferencias entre fechas y suma o resta días, meses y años.",
    category: "calculadoras",
    icon: CalendarDays,
    status: "available",
    keywords: ["fechas", "días", "diferencia", "sumar", "restar", "plazo"],
  },
  {
    id: "vat-calculator",
    name: "Calculadora de IVA",
    description: "Calcula IVA, impuestos y totales con las tasas de tu país.",
    category: "calculadoras",
    icon: Percent,
    status: "soon",
    keywords: ["iva", "impuestos", "total", "subtotal"],
  },
  {
    id: "currency-converter",
    name: "Conversor de divisas",
    description: "Convierte entre monedas con tasas de cambio actualizadas.",
    category: "calculadoras",
    icon: Coins,
    status: "soon",
    keywords: ["divisas", "monedas", "dólar", "euro", "cambio"],
  },

  // ─── Inteligencia Artificial ───────────────────────────
  {
    id: "ai-summarizer",
    name: "Resumidor con IA",
    description: "Resume textos y PDF largos en segundos con IA.",
    category: "ia",
    icon: TextQuote,
    status: "soon",
    keywords: ["resumen", "resumir", "ia", "pdf", "texto"],
  },
  {
    id: "ai-translator",
    name: "Traductor de documentos",
    description: "Traduce documentos completos manteniendo el formato.",
    category: "ia",
    icon: Languages,
    status: "soon",
    keywords: ["traducir", "idiomas", "inglés", "español", "ia"],
  },
  {
    id: "faq-chatbot",
    name: "Chatbot de FAQ para negocios",
    description: "Genera un chatbot de preguntas frecuentes entrenado con tu negocio.",
    category: "ia",
    icon: MessagesSquare,
    status: "soon",
    keywords: ["chatbot", "faq", "negocio", "soporte", "ia"],
  },
  {
    id: "product-description-gen",
    name: "Generador de descripciones",
    description: "Crea descripciones de producto persuasivas con IA.",
    category: "ia",
    icon: Package,
    status: "soon",
    keywords: ["producto", "descripción", "ecommerce", "ventas", "ia"],
  },
];

// Aliases para iconos que cambian de nombre entre versiones de lucide
// (ya importados arriba con alias)

export function getToolById(id: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function getCategoryById(id: ToolCategoryId): ToolCategoryMeta {
  return TOOL_CATEGORIES.find((c) => c.id === id)!;
}

export function getToolsByCategory(category: ToolCategoryId): ToolMeta[] {
  return TOOLS.filter((t) => t.category === category);
}

export const AVAILABLE_TOOLS = TOOLS.filter((t) => t.status === "available");
export const COMING_SOON_COUNT = TOOLS.filter((t) => t.status === "soon").length;

/** Búsqueda de herramientas por nombre, descripción y keywords. */
export function searchTools(query: string): ToolMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  return TOOLS.filter((tool) => {
    const haystack = `${tool.name} ${tool.description} ${tool.keywords.join(" ")}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
