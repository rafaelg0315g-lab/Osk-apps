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
  /** Slug en español para la URL pública: /tools/<categoría>/<slug> */
  slug: string;
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
    slug: "unir-pdf",
    name: "Combinar PDF",
    description: "Une varios PDF en un solo documento, en el orden que quieras.",
    category: "pdf",
    icon: Combine,
    status: "available",
    keywords: ["unir", "juntar", "merge", "combinar", "fusionar"],
  },
  {
    id: "split-pdf",
    slug: "dividir-pdf",
    name: "Dividir PDF",
    description: "Extrae un rango de páginas o separa todas las páginas en PDFs individuales.",
    category: "pdf",
    icon: Scissors,
    status: "available",
    keywords: ["separar", "extraer", "cortar", "split", "rango"],
  },
  {
    id: "compress-pdf",
    slug: "comprimir-pdf",
    name: "Comprimir PDF",
    description: "Reduce el peso de tus PDF manteniendo la mejor calidad posible.",
    category: "pdf",
    icon: FileDown,
    status: "available",
    keywords: ["reducir", "peso", "tamaño", "optimizar"],
  },
  {
    id: "pdf-to-word",
    slug: "pdf-a-word",
    name: "PDF a Word",
    description: "Convierte tus PDF a documentos Word (.docx) editables.",
    category: "pdf",
    icon: FileText,
    status: "available",
    keywords: ["word", "docx", "convertir", "office"],
  },
  {
    id: "pdf-to-excel",
    slug: "pdf-a-excel",
    name: "PDF a Excel",
    description: "Extrae tablas de un PDF y conviértelas a hojas de cálculo.",
    category: "pdf",
    icon: Table,
    status: "available",
    keywords: ["excel", "xlsx", "hoja de cálculo", "tablas"],
  },
  {
    id: "pdf-to-ppt",
    slug: "pdf-a-powerpoint",
    name: "PDF a PowerPoint",
    description: "Transforma tus PDF en presentaciones PowerPoint editables.",
    category: "pdf",
    icon: Presentation,
    status: "available",
    keywords: ["powerpoint", "pptx", "presentación", "diapositivas"],
  },
  {
    id: "pdf-to-jpg",
    slug: "pdf-a-jpg",
    name: "PDF a JPG",
    description: "Convierte cada página del PDF en una imagen JPG.",
    category: "pdf",
    icon: FileImage,
    status: "available",
    keywords: ["jpg", "jpeg", "png", "imagen", "convertir"],
  },
  {
    id: "jpg-to-pdf",
    slug: "jpg-a-pdf",
    name: "JPG a PDF",
    description: "Convierte tus imágenes en un documento PDF.",
    category: "pdf",
    icon: Images,
    status: "available",
    keywords: ["jpg", "png", "imagen a pdf", "convertir"],
  },
  {
    id: "rotate-pdf",
    slug: "rotar-pdf",
    name: "Rotar páginas PDF",
    description: "Gira las páginas de tu PDF en el ángulo que necesites.",
    category: "pdf",
    icon: RotateCw,
    status: "available",
    keywords: ["girar", "rotar", "orientación"],
  },
  {
    id: "delete-pdf-pages",
    slug: "eliminar-paginas-pdf",
    name: "Eliminar páginas PDF",
    description: "Borra las páginas que no necesitas de tu documento.",
    category: "pdf",
    icon: FileX,
    status: "available",
    keywords: ["borrar", "quitar", "eliminar"],
  },
  {
    id: "protect-pdf",
    slug: "proteger-pdf",
    name: "Proteger PDF",
    description: "Agrega contraseña a tus PDF para mayor seguridad.",
    category: "pdf",
    icon: Lock,
    status: "available",
    keywords: ["contraseña", "cifrar", "seguridad", "encriptar"],
  },
  {
    id: "unlock-pdf",
    slug: "desbloquear-pdf",
    name: "Desbloquear PDF",
    description: "Quita la contraseña de PDFs que te pertenecen.",
    category: "pdf",
    icon: LockOpen,
    status: "available",
    keywords: ["quitar contraseña", "descifrar", "liberar"],
  },
  {
    id: "sign-pdf",
    slug: "firmar-pdf",
    name: "Firmar PDF",
    description: "Agrega tu firma digital a documentos PDF.",
    category: "pdf",
    icon: PenLineIcon,
    status: "available",
    keywords: ["firma", "rubrica", "digital", "contrato"],
  },
  {
    id: "number-pdf-pages",
    slug: "numerar-paginas-pdf",
    name: "Numerar páginas PDF",
    description: "Agrega números de página con la posición y formato que prefieras.",
    category: "pdf",
    icon: ListOrdered,
    status: "available",
    keywords: ["numerar", "números", "paginar"],
  },
  {
    id: "watermark-pdf",
    slug: "marca-de-agua-pdf",
    name: "Marca de agua PDF",
    description: "Agrega texto o marca de agua a tus documentos.",
    category: "pdf",
    icon: Droplets,
    status: "available",
    keywords: ["watermark", "marca", "texto", "confidencial"],
  },
  {
    id: "ocr-pdf",
    slug: "ocr-pdf",
    name: "OCR — PDF escaneado",
    description: "Extrae texto de PDFs escaneados con reconocimiento óptico.",
    category: "pdf",
    icon: ScanText,
    status: "available",
    keywords: ["ocr", "escaneado", "texto", "reconocimiento"],
  },

  // ─── Imágenes ──────────────────────────────────────────
  {
    id: "compress-image",
    slug: "comprimir-imagen",
    name: "Comprimir imagen",
    description: "Reduce el peso de tus imágenes JPG, PNG y WebP con control de calidad.",
    category: "imagen",
    icon: FileImage,
    status: "available",
    keywords: ["reducir", "peso", "optimizar", "quality", "jpg", "png", "webp"],
  },
  {
    id: "convert-image",
    slug: "convertir-imagen",
    name: "Convertir imagen",
    description: "Cambia el formato de tus imágenes: PNG, JPG y WebP.",
    category: "imagen",
    icon: Repeat,
    status: "available",
    keywords: ["convertir", "formato", "png", "jpg", "jpeg", "webp"],
  },
  {
    id: "resize-image",
    slug: "redimensionar-imagen",
    name: "Redimensionar imagen",
    description: "Cambia el ancho y alto de tus imágenes manteniendo la proporción.",
    category: "imagen",
    icon: Maximize2,
    status: "available",
    keywords: ["tamaño", "escalar", "resize", "dimensiones"],
  },
  {
    id: "crop-image",
    slug: "recortar-imagen",
    name: "Recortar imagen",
    description: "Corta y ajusta tus imágenes al área exacta que necesitas.",
    category: "imagen",
    icon: Crop,
    status: "available",
    keywords: ["cortar", "crop", "ajustar"],
  },
  {
    id: "remove-bg",
    slug: "quitar-fondo",
    name: "Quitar fondo (IA)",
    description: "Elimina el fondo de tus imágenes automáticamente con IA.",
    category: "imagen",
    icon: Eraser,
    status: "available",
    keywords: ["fondo", "transparente", "ia", "background"],
  },
  {
    id: "watermark-image",
    slug: "marca-de-agua-imagen",
    name: "Marca de agua en imagen",
    description: "Protege tus imágenes agregando texto o logotipos.",
    category: "imagen",
    icon: Droplets,
    status: "available",
    keywords: ["watermark", "logo", "proteger"],
  },
  {
    id: "collage",
    slug: "generar-collage",
    name: "Generar collage",
    description: "Combina varias imágenes en un collage con distintas plantillas.",
    category: "imagen",
    icon: LayoutGrid,
    status: "available",
    keywords: ["collage", "combinar", "mosaico", "plantillas"],
  },
  {
    id: "upscale-image",
    slug: "mejorar-resolucion-ia",
    name: "Upscale con IA",
    description: "Mejora la resolución de tus imágenes hasta 4x con IA.",
    category: "imagen",
    icon: Sparkles,
    status: "available",
    keywords: ["mejorar", "resolución", "hd", "4k", "ia"],
  },
  {
    id: "image-editor",
    slug: "editor-imagen",
    name: "Editor básico de imagen",
    description: "Ajusta brillo, contraste, saturación y aplica filtros.",
    category: "imagen",
    icon: SlidersHorizontal,
    status: "available",
    keywords: ["filtros", "brillo", "contraste", "editar"],
  },

  // ─── Video y Audio ─────────────────────────────────────
  {
    id: "convert-video",
    slug: "convertir-video",
    name: "Convertir video",
    description: "Cambia el formato de tus videos: MP4, WebM, MOV y más.",
    category: "video",
    icon: Clapperboard,
    status: "available",
    keywords: ["mp4", "webm", "mov", "formato", "convertir"],
  },
  {
    id: "compress-video",
    slug: "comprimir-video",
    name: "Comprimir video",
    description: "Reduce el tamaño de tus videos manteniendo la calidad.",
    category: "video",
    icon: Minimize2,
    status: "available",
    keywords: ["reducir", "peso", "optimizar"],
  },
  {
    id: "extract-audio",
    slug: "extraer-audio",
    name: "Extraer audio de video",
    description: "Convierte MP4 a MP3: saca el audio de cualquier video.",
    category: "video",
    icon: Music,
    status: "available",
    keywords: ["mp3", "audio", "mp4", "extraer", "sonido"],
  },
  {
    id: "trim-video",
    slug: "cortar-video",
    name: "Cortar video",
    description: "Recorta tus videos y quédate solo con el fragmento que quieres.",
    category: "video",
    icon: Scissors,
    status: "available",
    keywords: ["recortar", "trim", "editar", "fragmento"],
  },
  {
    id: "convert-audio",
    slug: "convertir-audio",
    name: "Convertir audio",
    description: "Convierte entre MP3, WAV, OGG, AAC y otros formatos.",
    category: "video",
    icon: AudioLines,
    status: "available",
    keywords: ["mp3", "wav", "ogg", "aac", "convertir"],
  },
  {
    id: "merge-videos",
    slug: "unir-videos",
    name: "Unir videos",
    description: "Combina varios clips en un solo video continuo.",
    category: "video",
    icon: Combine,
    status: "available",
    keywords: ["unir", "combinar", "juntar", "merge"],
  },
  {
    id: "video-to-gif",
    slug: "video-a-gif",
    name: "Video a GIF",
    description: "Genera GIF animados desde fragmentos de tus videos.",
    category: "video",
    icon: Film,
    status: "available",
    keywords: ["gif", "animado", "meme"],
  },

  // ─── Texto y Documentos ────────────────────────────────
  {
    id: "invoice-generator",
    slug: "generador-facturas",
    name: "Generador de facturas",
    description: "Crea facturas profesionales con cálculo automático de impuestos y exporta a PDF.",
    category: "texto",
    icon: Receipt,
    status: "available",
    keywords: ["factura", "invoice", "cobrar", "presupuesto", "pdf", "impuestos", "iva"],
  },
  {
    id: "word-counter",
    slug: "contador-palabras",
    name: "Contador de palabras",
    description: "Cuenta palabras, caracteres, oraciones y tiempo de lectura en tiempo real.",
    category: "texto",
    icon: AlignLeft,
    status: "available",
    keywords: ["palabras", "caracteres", "letras", "texto", "contador", "lectura"],
  },
  {
    id: "spell-checker",
    slug: "corrector-ortografico",
    name: "Corrector ortográfico",
    description: "Revisa y corrige la ortografía de tus textos en español.",
    category: "texto",
    icon: SpellCheck,
    status: "available",
    keywords: ["ortografía", "corregir", "tildes", "español"],
  },
  {
    id: "contract-generator",
    slug: "generador-contratos",
    name: "Generador de contratos",
    description: "Crea contratos simples con plantillas personalizables.",
    category: "texto",
    icon: ScrollText,
    status: "available",
    keywords: ["contrato", "legal", "plantilla", "acuerdo"],
  },
  {
    id: "markdown-to-pdf",
    slug: "markdown-a-pdf",
    name: "Markdown a PDF / Word",
    description: "Convierte tus documentos Markdown a PDF o Word con formato.",
    category: "texto",
    icon: FileCode,
    status: "available",
    keywords: ["markdown", "md", "pdf", "word", "convertir"],
  },
  {
    id: "cv-builder",
    slug: "generador-cv",
    name: "Generador de CV",
    description: "Crea tu currículum con plantillas profesionales y editor visual.",
    category: "texto",
    icon: User,
    status: "available",
    keywords: ["cv", "currículum", "hoja de vida", "trabajo", "resume"],
  },

  // ─── Utilidades y Dev ──────────────────────────────────
  {
    id: "link-shortener",
    slug: "acortador-links",
    name: "Acortador de links",
    description: "Acorta URLs y consulta analytics de clics, referrers y dispositivos.",
    category: "dev",
    icon: Link2,
    status: "available",
    keywords: ["url", "corto", "enlace", "acortar", "analytics", "clics", "estadísticas"],
  },
  {
    id: "qr-generator",
    slug: "generador-qr",
    name: "Generador de QR",
    description: "Crea códigos QR personalizados con colores y descárgalos en PNG.",
    category: "dev",
    icon: QrCode,
    status: "available",
    keywords: ["qr", "código", "enlace", "url", "personalizar"],
  },
  {
    id: "password-generator",
    slug: "generador-contrasenas",
    name: "Generador de contraseñas",
    description: "Genera contraseñas seguras y evalúa la fortaleza de las tuyas.",
    category: "dev",
    icon: KeyRound,
    status: "available",
    keywords: ["contraseña", "seguridad", "password", "aleatoria", "validar"],
  },
  {
    id: "json-formatter",
    slug: "formateador-json",
    name: "Formateador JSON",
    description: "Formatea, valida y minifica JSON con detección de errores.",
    category: "dev",
    icon: Braces,
    status: "available",
    keywords: ["json", "formato", "validar", "minify", "pretty", "dev"],
  },
  {
    id: "base64-converter",
    slug: "convertidor-base64",
    name: "Convertidor Base64",
    description: "Codifica y decodifica texto en Base64 con soporte Unicode.",
    category: "dev",
    icon: BinaryIcon,
    status: "available",
    keywords: ["base64", "encode", "decode", "codificar", "decodificar"],
  },
  {
    id: "hash-generator",
    slug: "generador-hash",
    name: "Generador de hash",
    description: "Calcula MD5, SHA-1, SHA-256 y SHA-512 de cualquier texto.",
    category: "dev",
    icon: Fingerprint,
    status: "available",
    keywords: ["md5", "sha256", "sha1", "sha512", "hash", "checksum"],
  },
  {
    id: "text-diff",
    slug: "comparador-texto",
    name: "Comparador de texto",
    description: "Compara dos textos y visualiza las diferencias línea por línea.",
    category: "dev",
    icon: GitCompareIcon,
    status: "available",
    keywords: ["diff", "comparar", "diferencias", "cambios"],
  },

  // ─── Calculadoras y Conversores ────────────────────────
  {
    id: "unit-converter",
    slug: "conversor-unidades",
    name: "Conversor de unidades",
    description: "Convierte longitud, masa, temperatura, volumen, datos y más.",
    category: "calculadoras",
    icon: Ruler,
    status: "available",
    keywords: ["unidades", "metros", "kilos", "temperatura", "convertir", "medidas"],
  },
  {
    id: "date-calculator",
    slug: "calculadora-fechas",
    name: "Calculadora de fechas",
    description: "Calcula diferencias entre fechas y suma o resta días, meses y años.",
    category: "calculadoras",
    icon: CalendarDays,
    status: "available",
    keywords: ["fechas", "días", "diferencia", "sumar", "restar", "plazo"],
  },
  {
    id: "vat-calculator",
    slug: "calculadora-iva",
    name: "Calculadora de IVA",
    description: "Calcula IVA, impuestos y totales con las tasas de tu país.",
    category: "calculadoras",
    icon: Percent,
    status: "available",
    keywords: ["iva", "impuestos", "total", "subtotal"],
  },
  {
    id: "currency-converter",
    slug: "conversor-divisas",
    name: "Conversor de divisas",
    description: "Convierte entre monedas con tasas de cambio actualizadas.",
    category: "calculadoras",
    icon: Coins,
    status: "available",
    keywords: ["divisas", "monedas", "dólar", "euro", "cambio"],
  },

  // ─── Inteligencia Artificial ───────────────────────────
  {
    id: "ai-summarizer",
    slug: "resumidor-ia",
    name: "Resumidor con IA",
    description: "Resume textos y PDF largos en segundos con IA.",
    category: "ia",
    icon: TextQuote,
    status: "available",
    keywords: ["resumen", "resumir", "ia", "pdf", "texto"],
  },
  {
    id: "ai-translator",
    slug: "traductor-documentos",
    name: "Traductor de documentos",
    description: "Traduce documentos completos manteniendo el formato.",
    category: "ia",
    icon: Languages,
    status: "available",
    keywords: ["traducir", "idiomas", "inglés", "español", "ia"],
  },
  {
    id: "faq-chatbot",
    slug: "chatbot-faq",
    name: "Chatbot de FAQ para negocios",
    description: "Genera un chatbot de preguntas frecuentes entrenado con tu negocio.",
    category: "ia",
    icon: MessagesSquare,
    status: "available",
    keywords: ["chatbot", "faq", "negocio", "soporte", "ia"],
  },
  {
    id: "product-description-gen",
    slug: "generador-descripciones",
    name: "Generador de descripciones",
    description: "Crea descripciones de producto persuasivas con IA.",
    category: "ia",
    icon: Package,
    status: "available",
    keywords: ["producto", "descripción", "ecommerce", "ventas", "ia"],
  },
];

// Aliases para iconos que cambian de nombre entre versiones de lucide
// (ya importados arriba con alias)

export function getToolById(id: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function getToolBySlug(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

/** URL pública de una herramienta: /tools/<categoría>/<slug> */
export function getToolUrl(tool: Pick<ToolMeta, "category" | "slug">): string {
  return `/tools/${tool.category}/${tool.slug}`;
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
