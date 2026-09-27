"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import PptxGenJS from "pptxgenjs";
import { FileSliders, Loader2, Presentation } from "lucide-react";
import { toast } from "sonner";

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

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const MAX_FILE_MB = 20;
const MAX_PAGES = 60;
const TARGET_WIDTH_PX = 1600; // ancho máximo del JPEG por página
const MAX_SCALE = 4; // límite de ampliación para páginas pequeñas
const JPEG_QUALITY = 0.85;
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

function toBlob(output: string | ArrayBuffer | Blob | Uint8Array): Blob {
  if (output instanceof Blob) return output;
  if (typeof output === "string") {
    return new Blob([output], { type: PPTX_MIME });
  }
  return new Blob([output as BlobPart], { type: PPTX_MIME });
}

/** Renderiza una página a JPEG (fondo blanco, ancho máximo ~1600 px). */
async function renderPageToJpeg(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(TARGET_WIDTH_PX / baseViewport.width, MAX_SCALE);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el lienzo de renderizado.");

  // Fondo blanco: JPEG no soporta transparencia y las diapositivas son claras.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export default function PdfToPpt() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");

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
    setResult(null);
    setProgress(0);
    setProgressLabel("");
    if (valid.length > 0) {
      void inspectPages(valid[0]);
    }
  };

  const handleConvert = async () => {
    const file = files[0];
    if (!file || processing) return;

    setProcessing(true);
    setResult(null);
    setProgress(0);
    setProgressLabel("Abriendo el PDF…");

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjsLib.getDocument({ data });
      const doc = await task.promise;
      const total = Math.min(doc.numPages, MAX_PAGES);
      const totalPages = doc.numPages;

      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_16x9";
      pptx.author = "OSK APPS";
      pptx.title = baseName(file.name);

      for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const jpegDataUrl = await renderPageToJpeg(page);
        const slide = pptx.addSlide();
        slide.addImage({
          data: jpegDataUrl.replace(/^data:/, ""),
          x: 0,
          y: 0,
          w: "100%",
          h: "100%",
        });
        page.cleanup();
        setProgress(Math.round((pageNumber / total) * 95));
        setProgressLabel(`Generando diapositiva ${pageNumber} de ${total}`);
      }
      await task.destroy();

      setProgressLabel("Empaquetando la presentación…");
      const output = await pptx.write({ outputType: "blob" });
      const blob = toBlob(output);

      setResult(blob);
      setResultName(`${baseName(file.name)}.pptx`);
      setProgress(100);
      setProgressLabel("");
      toast.success(
        totalPages > MAX_PAGES
          ? `Presentación generada con las primeras ${MAX_PAGES} páginas`
          : `Presentación generada con ${totalPages} diapositivas`,
      );
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
    setPageCount(null);
    setResult(null);
    setProgress(0);
    setProgressLabel("");
  };

  const exceedsLimit = pageCount !== null && pageCount > MAX_PAGES;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>Archivo PDF</CardTitle>
          <CardDescription>
            Cada página se convierte en una diapositiva 16:9 con la página a
            pantalla completa. Máx. {MAX_FILE_MB} MB.
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
            hint="Hasta 60 páginas"
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
              <FileSliders aria-hidden />
              <AlertTitle>Límite de páginas</AlertTitle>
              <AlertDescription>
                Este PDF tiene {pageCount} páginas y el límite es {MAX_PAGES}.
                Solo se convertirán las primeras {MAX_PAGES}.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="border-violet-500/40 bg-violet-500/5 text-violet-900 dark:text-violet-200">
            <Presentation aria-hidden />
            <AlertDescription>
              Las diapositivas contienen la imagen de cada página a página
              completa (formato 16:9); el texto no es editable. Las páginas se
              ajustan al formato de diapositiva.
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
              disabled={files.length === 0 || processing || inspecting}
              className="gap-2 bg-violet-600 text-white hover:bg-violet-700"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Presentation aria-hidden />
              )}
              Convertir a PowerPoint
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
            <CardTitle>Presentación lista</CardTitle>
            <CardDescription>
              {resultName} ({Math.max(0, Math.min(pageCount ?? 0, MAX_PAGES))}{" "}
              diapositivas)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DownloadButton
              blob={result}
              filename={resultName}
              label="Descargar .pptx"
              size="lg"
            />
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
