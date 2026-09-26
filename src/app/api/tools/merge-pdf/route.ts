import { NextResponse } from "next/server";

import { mergePdfs, type PdfInputFile } from "@/lib/processors/pdf";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 15;
const MIN_FILES = 2;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function asciiFallback(filename: string): string {
  return filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
}

function binaryResponse(
  data: Buffer,
  contentType: string,
  filename: string,
  originalSize: number,
  fileCount: number,
) {
  const body = new Uint8Array(data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Original-Size": String(originalSize),
      "X-Result-Size": String(body.byteLength),
      "X-File-Count": String(fileCount),
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

  const entries = form.getAll("files");
  const files = entries.filter((entry): entry is File => entry instanceof File);

  if (files.length < MIN_FILES) {
    return jsonError("Debes subir al menos 2 archivos PDF para combinarlos.", 400);
  }
  if (files.length > MAX_FILES) {
    return jsonError(`Puedes combinar un máximo de ${MAX_FILES} archivos PDF.`, 400);
  }

  const pdfFiles: PdfInputFile[] = [];
  for (const file of files) {
    if (file.size === 0) {
      return jsonError(`"${file.name}" está vacío.`, 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(`"${file.name}" supera el límite de 20 MB.`, 413);
    }
    pdfFiles.push({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
  }

  try {
    const merged = await mergePdfs(pdfFiles);
    const totalSize = pdfFiles.reduce((sum, file) => sum + file.data.byteLength, 0);
    return binaryResponse(merged, "application/pdf", "combinado.pdf", totalSize, pdfFiles.length);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron combinar los PDF.";
    return jsonError(message, 400);
  }
}
