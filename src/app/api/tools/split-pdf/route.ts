import { NextResponse } from "next/server";

import { splitPdfAllPages, splitPdfByRanges } from "@/lib/processors/pdf";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asciiFallback(filename: string): string {
  return filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
}

function baseName(name: string): string {
  const cleaned = name.replace(/\.[^./\\]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : "documento";
}

function binaryResponse(
  data: Buffer,
  contentType: string,
  filename: string,
  originalSize: number,
  pageCount: number,
) {
  const body = new Uint8Array(data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Original-Size": String(originalSize),
      "X-Result-Size": String(body.byteLength),
      "X-Page-Count": String(pageCount),
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
    return jsonError("Debes seleccionar un archivo PDF.", 400);
  }
  if (fileEntry.size === 0) {
    return jsonError("El archivo está vacío.", 400);
  }
  if (fileEntry.size > MAX_FILE_SIZE) {
    return jsonError("El archivo supera el límite de 20 MB.", 413);
  }

  const mode = form.get("mode");
  if (mode !== "ranges" && mode !== "all") {
    return jsonError("El modo indicado no es válido.", 400);
  }

  const rawRanges = form.get("ranges");
  const ranges = typeof rawRanges === "string" ? rawRanges : "";
  if (mode === "ranges" && ranges.trim() === "") {
    return jsonError("Indica las páginas que quieres extraer. Ejemplo: 1-3, 5, 8-", 400);
  }

  try {
    const buffer = Buffer.from(await fileEntry.arrayBuffer());
    const base = baseName(fileEntry.name);

    if (mode === "ranges") {
      const { data, pages } = await splitPdfByRanges(buffer, ranges);
      const filename = `${base}-paginas.pdf`;
      return binaryResponse(data, "application/pdf", filename, fileEntry.size, pages.length);
    }

    const { zip, total } = await splitPdfAllPages(buffer);
    const filename = `${base}-paginas.zip`;
    return binaryResponse(zip, "application/zip", filename, fileEntry.size, total);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo dividir el PDF.";
    return jsonError(message, 400);
  }
}
