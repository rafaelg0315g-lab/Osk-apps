import { NextResponse } from "next/server";

import {
  compressImage,
  imageExtension,
  imageMimeType,
  type CompressFormat,
} from "@/lib/processors/image";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const VALID_FORMATS: CompressFormat[] = ["keep", "jpeg", "png", "webp"];

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asciiFallback(filename: string): string {
  return filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
}

function baseName(name: string): string {
  const cleaned = name.replace(/\.[^./\\]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : "archivo";
}

function binaryResponse(data: Buffer, contentType: string, filename: string, originalSize: number) {
  const body = new Uint8Array(data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Original-Size": String(originalSize),
      "X-Result-Size": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("No se pudo procesar la solicitud. Vuelve a intentarlo.", 400);
  }

  const fileEntry = form.get("file");
  if (!(fileEntry instanceof File)) {
    return jsonError("Debes seleccionar una imagen.", 400);
  }
  if (fileEntry.size === 0) {
    return jsonError("El archivo está vacío.", 400);
  }
  if (fileEntry.size > MAX_FILE_SIZE) {
    return jsonError("El archivo supera el límite de 20 MB.", 413);
  }

  const rawQuality = form.get("quality");
  let quality = 80;
  if (typeof rawQuality === "string" && rawQuality.trim() !== "") {
    const parsed = Number(rawQuality);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      return jsonError("La calidad debe ser un número entre 1 y 100.", 400);
    }
    quality = parsed;
  }

  const rawFormat = form.get("format");
  const format: CompressFormat =
    typeof rawFormat === "string" && rawFormat.trim() !== "" ? (rawFormat as CompressFormat) : "keep";
  if (!VALID_FORMATS.includes(format)) {
    return jsonError("El formato de salida indicado no es válido.", 400);
  }

  try {
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const { data, format: outputFormat } = await compressImage(buffer, { quality, format });
    const filename = `${baseName(fileEntry.name)}-comprimido.${imageExtension(outputFormat)}`;
    return binaryResponse(data, imageMimeType(outputFormat), filename, fileEntry.size);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo comprimir la imagen.";
    return jsonError(message, 400);
  }
}
