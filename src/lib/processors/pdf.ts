/**
 * Procesadores de PDF (pdf-lib + jszip), 100% en memoria: Buffer -> Buffer.
 * Sin acceso a disco y sin persistir archivos de usuario.
 */
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

export interface PdfInputFile {
  name: string;
  data: Buffer;
}

/** Carga un PDF tratando errores de parseo/permisos con mensajes claros. */
async function loadPdf(data: Buffer, name?: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(data, { ignoreEncryption: true });
  } catch {
    throw new Error(
      name ? `"${name}" no es un PDF válido o está dañado.` : "El archivo no es un PDF válido o está dañado.",
    );
  }
}

/** Combina varios PDF en un único documento, en el orden indicado. */
export async function mergePdfs(files: PdfInputFile[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const doc = await loadPdf(file.data, file.name);
    const copiedPages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of copiedPages) {
      merged.addPage(page);
    }
  }
  const bytes = await merged.save();
  return Buffer.from(bytes);
}

/**
 * Convierte una expresión de rangos 1-based inclusiva ("1-3,5,8-") en la
 * lista ordenada y sin duplicados de páginas (1-based) seleccionadas.
 * "8-" significa desde la página 8 hasta el final.
 */
export function parsePageRanges(input: string, totalPages: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Indica las páginas que quieres extraer. Ejemplo: 1-3, 5, 8-");
  }

  const pages: number[] = [];
  const parts = trimmed.split(",");

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) {
      throw new Error("El formato de los rangos no es válido. Ejemplo: 1-3, 5, 8-");
    }

    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page < 1) {
        throw new Error("Las páginas se numeran desde 1. Revisa el rango indicado.");
      }
      if (page > totalPages) {
        throw new Error(`El documento solo tiene ${totalPages} páginas`);
      }
      pages.push(page);
      continue;
    }

    if (/^\d+-\d+$/.test(part)) {
      const [start, end] = part.split("-").map(Number);
      if (start < 1) {
        throw new Error("Las páginas se numeran desde 1. Revisa el rango indicado.");
      }
      if (end < start) {
        throw new Error(`El rango "${part}" no es válido: el inicio debe ser menor o igual que el fin.`);
      }
      if (start > totalPages || end > totalPages) {
        throw new Error(`El documento solo tiene ${totalPages} páginas`);
      }
      for (let page = start; page <= end; page += 1) {
        pages.push(page);
      }
      continue;
    }

    if (/^\d+-$/.test(part)) {
      const start = Number(part.slice(0, -1));
      if (start < 1) {
        throw new Error("Las páginas se numeran desde 1. Revisa el rango indicado.");
      }
      if (start > totalPages) {
        throw new Error(`El documento solo tiene ${totalPages} páginas`);
      }
      for (let page = start; page <= totalPages; page += 1) {
        pages.push(page);
      }
      continue;
    }

    throw new Error(`"${part}" no es un rango válido. Ejemplo de formato: 1-3, 5, 8-`);
  }

  return [...new Set(pages)];
}

/** Extrae las páginas indicadas en un nuevo PDF de una sola pieza. */
export async function splitPdfByRanges(
  data: Buffer,
  ranges: string,
): Promise<{ data: Buffer; pages: number[]; total: number }> {
  const source = await loadPdf(data);
  const total = source.getPageCount();
  const pages = parsePageRanges(ranges, total);

  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(source, pages.map((page) => page - 1));
  for (const page of copiedPages) {
    output.addPage(page);
  }

  const bytes = await output.save();
  return { data: Buffer.from(bytes), pages, total };
}

/** Genera un PDF por página y los empaqueta en un ZIP (pagina-1.pdf, ...). */
export async function splitPdfAllPages(data: Buffer): Promise<{ zip: Buffer; total: number }> {
  const source = await loadPdf(data);
  const total = source.getPageCount();
  const zip = new JSZip();

  for (const index of source.getPageIndices()) {
    const output = await PDFDocument.create();
    const [copiedPage] = await output.copyPages(source, [index]);
    output.addPage(copiedPage);
    const bytes = await output.save();
    zip.file(`pagina-${index + 1}.pdf`, bytes);
  }

  const zipped = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { zip: zipped, total };
}
