/**
 * Procesadores de imagen (sharp), 100% en memoria: Buffer -> Buffer.
 * Sin acceso a disco y sin persistir archivos de usuario.
 */
import sharp from "sharp";

export type ImageOutputFormat = "jpeg" | "png" | "webp";
export type CompressFormat = "keep" | ImageOutputFormat;

/** Formatos que aceptamos como entrada (validados con metadatos de sharp). */
const SUPPORTED_INPUT_FORMATS = new Set<string>(["jpeg", "png", "webp", "gif", "tiff", "avif"]);

export interface ImageProcessOptions {
  quality: number;
}

export interface ImageProcessResult {
  data: Buffer;
  format: ImageOutputFormat;
}

/** Lee los metadatos y valida que el buffer sea una imagen compatible. */
async function readImageFormat(buffer: Buffer): Promise<string> {
  let format: string | undefined;
  try {
    const metadata = await sharp(buffer).metadata();
    format = metadata.format;
  } catch {
    throw new Error("El archivo no es una imagen válida o está dañada.");
  }
  if (!format || !SUPPORTED_INPUT_FORMATS.has(format)) {
    throw new Error("Formato de imagen no compatible. Usa JPEG, PNG, WebP, GIF, TIFF o AVIF.");
  }
  return format;
}

function resolveOutputFormat(inputFormat: string, requested: CompressFormat): ImageOutputFormat {
  if (requested !== "keep") return requested;
  if (inputFormat === "jpeg" || inputFormat === "png" || inputFormat === "webp") {
    return inputFormat;
  }
  return "jpeg";
}

/**
 * Comprime una imagen. Con format="keep" respeta el formato original
 * (jpeg->jpeg, png->png, webp->webp, otros->jpeg).
 */
export async function compressImage(
  buffer: Buffer,
  options: { quality: number; format: CompressFormat },
): Promise<ImageProcessResult> {
  const inputFormat = await readImageFormat(buffer);
  const outputFormat = resolveOutputFormat(inputFormat, options.format);
  const pipeline = sharp(buffer);

  let data: Buffer;
  if (outputFormat === "jpeg") {
    data = await pipeline
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: options.quality, mozjpeg: true })
      .toBuffer();
  } else if (outputFormat === "webp") {
    data = await pipeline.webp({ quality: options.quality }).toBuffer();
  } else {
    data = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  }

  return { data, format: outputFormat };
}

/** Convierte una imagen al formato de destino indicado. */
export async function convertImage(
  buffer: Buffer,
  options: { target: ImageOutputFormat; quality: number },
): Promise<ImageProcessResult> {
  await readImageFormat(buffer);
  const pipeline = sharp(buffer);

  let data: Buffer;
  if (options.target === "jpeg") {
    data = await pipeline
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: options.quality, mozjpeg: true })
      .toBuffer();
  } else if (options.target === "webp") {
    data = await pipeline.webp({ quality: options.quality }).toBuffer();
  } else {
    data = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  }

  return { data, format: options.target };
}

/** Extensión de archivo estándar para cada formato de salida. */
export function imageExtension(format: ImageOutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

/** MIME type correspondiente a cada formato de salida. */
export function imageMimeType(format: ImageOutputFormat): string {
  return `image/${format}`;
}
