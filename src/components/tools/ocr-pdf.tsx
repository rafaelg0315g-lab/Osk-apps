"use client";

import { useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import { Loader2, ScanText } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface TesseractLoggerMessage {
  status: string;
  progress: number;
}

const MAX_FILE_MB = 20;
const MAX_PAGES = 15;
const MAX_RENDER_DIMENSION = 2000; // píxeles máximo por lado para el OCR

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

function isNetworkError(message: string): boolean {
  return /fetch|network|failed to fetch|net::|load|download|xhr/i.test(message);
}

export default function OcrPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("");
  const [resultText, setResultText] = useState("");
  const [resultName, setResultName] = useState("");
  const currentPageRef = useRef(0);

  const inspectPages = async (file: File) => {
    setInspecting(true);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjsLib.getDocument({ data });
      const doc = await task.promise;
      setPageCount(doc.numPages);
      await task.destroy();
    } catch {
      toast.error("No se pudo leer el PDF", {
        description: "El archivo podría estar dañado o protegido con contraseña.",
      });
      setFiles([]);
      setPageCount(null);
    } finally {
      setInspecting(false);
    }
  };

  const handleFilesChange = (next: File[]) => {
    const valid = next.filter((file) => {
      if (file.name.toLowerCase().endsWith(".pdf")) return true;
      toast.error(`"${file.name}" no es un archivo PDF`);
      return false;
    });
    setFiles(valid);
    setPageCount(null);
    setResultText("");
    setProgress(0);
    setStatusLabel("");
    if (valid.length > 0) {
      void inspectPages(valid[0]);
    }
  };

  const handleRunOcr = async () => {
    const file = files[0];
    if (!file || processing) return;

    setProcessing(true);
    setResultText("");
    setProgress(0);
    setStatusLabel("Abriendo el PDF…");

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjsLib.getDocument({ data });
      const doc = await task.promise;
      const total = Math.min(doc.numPages, MAX_PAGES);
      const parts: string[] = [];

      const logger = (message: TesseractLoggerMessage) => {
        if (message.status === "recognizing text") {
          const overall = ((currentPageRef.current - 1) + message.progress) / total;
          setProgress(Math.round(overall * 100));
          setStatusLabel(
            `Reconociendo texto: página ${currentPageRef.current} de ${total}`,
          );
        } else {
          setStatusLabel("Preparando el motor OCR (puede tardar unos segundos)…");
        }
      };

      for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        currentPageRef.current = pageNumber;
        const page = await doc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(
          1,
          Math.min(
            2,
            MAX_RENDER_DIMENSION / Math.max(baseViewport.width, baseViewport.height),
          ),
        );
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No se pudo preparar el lienzo de renderizado.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, viewport }).promise;

        setStatusLabel(`Reconociendo texto: página ${pageNumber} de ${total}`);
        const recognition = await Tesseract.recognize(canvas, "spa+eng", { logger });
        const text = recognition.data.text.trim();
        parts.push(`— Página ${pageNumber} —\n${text || "(sin texto reconocido)"}`);

        page.cleanup();
        setProgress(Math.round((pageNumber / total) * 100));
        if (pageNumber < total) {
          setStatusLabel(`Preparando página ${pageNumber + 1} de ${total}…`);
        }
      }
      await task.destroy();

      const finalText = parts.join("\n\n");
      if (!finalText.trim()) {
        toast.error("No se reconoció texto en el documento");
        setProcessing(false);
        return;
      }

      setResultText(finalText);
      setResultName(`${baseName(file.name)}-ocr.txt`);
      setStatusLabel("");
      toast.success("OCR completado");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNetworkError(message)) {
        toast.error("No se pudo completar el OCR", {
          description:
            "No se pudieron descargar los datos del idioma. Esta herramienta requiere conexión a internet la primera vez que se usa.",
        });
      } else {
        toast.error("No se pudo completar el OCR", {
          description: message || "Inténtalo de nuevo con otro PDF.",
        });
      }
    } finally {
      setProcessing(false);
      currentPageRef.current = 0;
    }
  };

  const reset = () => {
    setFiles([]);
    setPageCount(null);
    setResultText("");
    setProgress(0);
    setStatusLabel("");
  };

  const exceedsLimit = pageCount !== null && pageCount > MAX_PAGES;
  const charCount = resultText.length;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>PDF escaneado</CardTitle>
          <CardDescription>
            Extrae el texto de un PDF escaneado (imágenes) con reconocimiento
            óptico en español e inglés. Máx. {MAX_FILE_MB} MB.
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
            disabled={processing || inspecting}
            hint="Hasta 15 páginas por proceso"
          />

          {inspecting && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Leyendo el documento…
            </p>
          )}

          {pageCount !== null && !inspecting && (
            <p className="text-sm text-muted-foreground">
              El PDF tiene {pageCount} página{pageCount === 1 ? "" : "s"}.
            </p>
          )}

          {exceedsLimit && (
            <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200">
              <ScanText aria-hidden />
              <AlertTitle>Límite de páginas</AlertTitle>
              <AlertDescription>
                Este PDF tiene {pageCount} páginas y el límite es {MAX_PAGES}.
                Solo se procesarán las primeras {MAX_PAGES}.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200">
            <AlertDescription>
              El motor OCR se ejecuta en tu navegador, pero necesita conexión a
              internet para descargar los datos de idioma la primera vez. El
              proceso puede tardar entre unos segundos y un minuto por página.
            </AlertDescription>
          </Alert>

          {processing && (
            <div className="space-y-2">
              <Progress value={progress} aria-label="Progreso del OCR" />
              <p className="text-xs text-muted-foreground">{statusLabel}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleRunOcr}
              disabled={files.length === 0 || processing || inspecting}
              className="gap-2 bg-orange-600 text-white hover:bg-orange-700"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ScanText aria-hidden />
              )}
              Reconocer texto
            </Button>
            {resultText && (
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={processing}
              >
                Procesar otro archivo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {resultText && (
        <Card>
          <CardHeader>
            <CardTitle>Texto reconocido</CardTitle>
            <CardDescription>
              {charCount} caracteres. Revisa el resultado: la precisión depende
              de la calidad del escaneo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              readOnly
              value={resultText}
              className="max-h-96 min-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-sm"
              aria-label="Texto extraído con OCR"
            />
            <div className="flex flex-wrap gap-3">
              <CopyButton value={resultText} label="Copiar texto" size="sm" />
              <DownloadButton
                blob={new Blob([resultText], { type: "text/plain;charset=utf-8" })}
                filename={resultName}
                label="Descargar .txt"
                size="sm"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
