"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";
import { FileText, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Item de texto de pdf.js con la información necesaria para reconstruir líneas. */
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

/** Chunk de texto con su posición en coordenadas PDF (puntos). */
interface TextChunk {
  x: number;
  endX: number;
  y: number;
  text: string;
}

const MAX_FILE_MB = 20;
const LINE_TOLERANCE = 2.5; // puntos: diferencia de Y máxima para estar en la misma línea

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/**
 * Agrupa los items de texto de una página en líneas:
 * ordena por Y descendente y X ascendente, y junta los items cuya
 * coordenada vertical (transform[5]) está dentro de la tolerancia.
 */
function extractLines(items: PdfTextItem[]): string[] {
  const chunks: TextChunk[] = [];
  for (const item of items) {
    const text = item.str;
    if (!text.trim()) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    chunks.push({ x, y, endX: x + (item.width ?? 0), text });
  }

  chunks.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: string[] = [];
  let current: TextChunk[] = [];
  let anchorY: number | null = null;

  const flush = () => {
    if (current.length === 0) return;
    current.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd: number | null = null;
    for (const chunk of current) {
      const needsSpace =
        prevEnd !== null &&
        chunk.x - prevEnd > 1.2 &&
        !/\s$/.test(text) &&
        !/^\s/.test(chunk.text);
      if (needsSpace) text += " ";
      text += chunk.text;
      prevEnd = chunk.endX;
    }
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean) lines.push(clean);
    current = [];
    anchorY = null;
  };

  for (const chunk of chunks) {
    if (anchorY === null || Math.abs(chunk.y - anchorY) <= LINE_TOLERANCE) {
      if (anchorY === null) anchorY = chunk.y;
      current.push(chunk);
    } else {
      flush();
      current.push(chunk);
      anchorY = chunk.y;
    }
  }
  flush();

  return lines;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Genera un .docx mínimo válido (OOXML) a partir de los párrafos extraídos. */
async function buildDocx(paragraphs: string[]): Promise<Blob> {
  const body = paragraphs
    .map(
      (text) =>
        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    )
    .join("");

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${body}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418"/></w:sectPr>` +
    `</w:body></w:document>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const documentRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", rootRels);
  zip.file("word/document.xml", documentXml);
  zip.file("word/_rels/document.xml.rels", documentRels);

  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export default function PdfToWord() {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");
  const [paragraphCount, setParagraphCount] = useState(0);

  const handleFilesChange = (next: File[]) => {
    const valid = next.filter((file) => {
      if (file.name.toLowerCase().endsWith(".pdf")) return true;
      toast.error(`"${file.name}" no es un archivo PDF`);
      return false;
    });
    setFiles(valid);
    setResult(null);
    setParagraphCount(0);
    setProgress(0);
    setProgressLabel("");
  };

  const handleConvert = async () => {
    const file = files[0];
    if (!file || processing) return;

    setProcessing(true);
    setResult(null);
    setParagraphCount(0);
    setProgress(0);
    setProgressLabel("Abriendo el PDF…");

    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const task = pdfjsLib.getDocument({ data });
      const doc = await task.promise;

      const paragraphs: string[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        const items: PdfTextItem[] = [];
        for (const item of content.items) {
          if ("str" in item) {
            items.push({ str: item.str, transform: item.transform, width: item.width });
          }
        }
        paragraphs.push(...extractLines(items));
        page.cleanup();
        setProgress(Math.round((pageNumber / doc.numPages) * 90));
        setProgressLabel(`Extrayendo texto: página ${pageNumber} de ${doc.numPages}`);
      }
      await task.destroy();

      if (paragraphs.length === 0) {
        toast.error("No se encontró texto en el PDF", {
          description:
            "Puede ser un documento escaneado (solo imágenes). Prueba la herramienta OCR.",
        });
        setProcessing(false);
        return;
      }

      setProgress(95);
      setProgressLabel("Generando el documento Word…");
      const blob = await buildDocx(paragraphs);

      setParagraphCount(paragraphs.length);
      setResult(blob);
      setResultName(`${baseName(file.name)}.docx`);
      setProgress(100);
      setProgressLabel("");
      toast.success(`Documento Word generado con ${paragraphs.length} párrafos`);
    } catch (error) {
      toast.error("No se pudo convertir el PDF", {
        description:
          error instanceof Error
            ? error.message
            : "El archivo podría estar dañado o protegido con contraseña.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setResult(null);
    setParagraphCount(0);
    setProgress(0);
    setProgressLabel("");
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>Archivo PDF</CardTitle>
          <CardDescription>
            Selecciona el PDF del que quieres extraer el texto. Máx. {MAX_FILE_MB} MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={files}
            onFilesChange={handleFilesChange}
            accept=".pdf,application/pdf"
            multiple={false}
            maxFiles={1}
            maxSizeMB={MAX_FILE_MB}
            disabled={processing}
            hint="PDF con texto (no escaneado)"
          />

          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200">
            <Wand2 aria-hidden />
            <AlertDescription>
              Se conserva el texto en párrafos; el diseño complejo (columnas,
              tablas, imágenes) puede simplificarse. Todo el proceso ocurre en tu
              navegador: el archivo no se envía a ningún servidor.
            </AlertDescription>
          </Alert>

          {processing && (
            <div className="space-y-2">
              <Progress value={progress} aria-label="Progreso de la conversión" />
              <p className="text-xs text-muted-foreground">{progressLabel}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleConvert}
              disabled={files.length === 0 || processing}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileText aria-hidden />
              )}
              Convertir a Word
            </Button>
            {result && (
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={processing}
              >
                Convertir otro archivo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Documento listo</CardTitle>
            <CardDescription>
              {paragraphCount} párrafo{paragraphCount === 1 ? "" : "s"} extraídos del PDF.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DownloadButton
              blob={result}
              filename={resultName}
              label="Descargar .docx"
              size="lg"
            />
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
