"use client";

import { useEffect, useState } from "react";
import { FileImage, Loader2, TriangleAlert } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "application/pdf,.pdf";
const PAGE_LIMIT_WARNING = 100;

type ExportScale = "1" | "2";

const SCALE_OPTIONS: { value: ExportScale; label: string }[] = [
  { value: "1", label: "1x — más ligeras" },
  { value: "2", label: "2x — más detalle" },
];

interface PagePreview {
  url: string;
  page: number;
}

interface ConvertResult {
  blob: Blob;
  filename: string;
  pages: number;
  zipped: boolean;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function baseName(name: string): string {
  const withoutExt = name.replace(/\.pdf$/i, "");
  return withoutExt.trim() || "documento";
}

/** Renderiza una página en un canvas con fondo blanco. */
async function renderPageToCanvas(page: pdfjsLib.PDFPageProxy, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

export default function PdfToJpgTool() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(85);
  const [scale, setScale] = useState<ExportScale>("2");
  const [numPages, setNumPages] = useState<number | null>(null);
  const [previews, setPreviews] = useState<PagePreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);

  // Carga el documento y genera miniaturas de las primeras 3 páginas.
  useEffect(() => {
    if (!file) {
      setNumPages(null);
      setPreviews([]);
      return;
    }

    let cancelled = false;
    const createdUrls: string[] = [];

    const run = async () => {
      setPreviewLoading(true);
      setError(null);
      try {
        const buffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        try {
          const doc = await loadingTask.promise;
          if (cancelled) return;
          setNumPages(doc.numPages);

          const count = Math.min(3, doc.numPages);
          const items: PagePreview[] = [];
          for (let i = 1; i <= count; i++) {
            const page = await doc.getPage(i);
            const canvas = await renderPageToCanvas(page, 0.35);
            const blob = await canvasToJpegBlob(canvas, 0.7);
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
            if (cancelled) break;
            if (blob) {
              const url = URL.createObjectURL(blob);
              createdUrls.push(url);
              items.push({ url, page: i });
            }
          }

          if (cancelled) {
            createdUrls.forEach((url) => URL.revokeObjectURL(url));
            return;
          }
          setPreviews(items);
        } finally {
          await loadingTask.destroy().catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setNumPages(null);
          setPreviews([]);
          setError("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [file]);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (next && !isPdfFile(next)) {
      toast.error(`"${next.name}" no es un archivo PDF.`);
      return;
    }
    setFile(next);
    setResult(null);
    setError(null);
    setNumPages(null);
    setPreviews([]);
    setProgress(0);
    setStatusText(null);
  };

  const handleProcess = async () => {
    if (!file || processing) return;
    if (!isPdfFile(file)) {
      const message = "El archivo seleccionado no es un PDF válido.";
      setError(message);
      toast.error(message);
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setStatusText("Abriendo el PDF…");

    try {
      const buffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      try {
        const doc = await loadingTask.promise;
        const total = doc.numPages;
        const jpegQuality = quality / 100;
        const renderScale = Number(scale);
        const zip = total > 1 ? new JSZip() : null;
        let singleBlob: Blob | null = null;

        for (let i = 1; i <= total; i++) {
          setStatusText(`Convirtiendo página ${i} de ${total}…`);
          setProgress(Math.round(((i - 1) / total) * 100));

          const page = await doc.getPage(i);
          const canvas = await renderPageToCanvas(page, renderScale);
          const jpegBlob = await canvasToJpegBlob(canvas, jpegQuality);
          canvas.width = 0;
          canvas.height = 0;
          page.cleanup();
          if (!jpegBlob) {
            throw new Error(`No se pudo convertir la página ${i} en imagen.`);
          }

          if (zip) {
            zip.file(`pagina-${i}.jpg`, jpegBlob);
          } else {
            singleBlob = jpegBlob;
          }

          setProgress(Math.round((i / total) * 100));
          // Pausa breve para que el navegador pinte el progreso entre páginas.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        let blob: Blob;
        let filename: string;
        if (zip) {
          blob = await zip.generateAsync({ type: "blob" });
          filename = `${baseName(file.name)}-jpg.zip`;
        } else {
          if (!singleBlob) throw new Error("No se generó ninguna imagen.");
          blob = singleBlob;
          filename = `${baseName(file.name)}.jpg`;
        }

        setResult({ blob, filename, pages: total, zipped: zip !== null });
        setStatusText(null);
        toast.success(
          zip
            ? `${total} imágenes JPG empaquetadas en un ZIP.`
            : "Imagen JPG lista para descargar.",
        );
      } finally {
        await loadingTask.destroy().catch(() => undefined);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo convertir el PDF. Inténtalo de nuevo.";
      setError(message);
      setStatusText(null);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setNumPages(null);
    setPreviews([]);
    setProgress(0);
    setStatusText(null);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="size-5 text-primary" aria-hidden />
            1. Sube tu PDF
          </CardTitle>
          <CardDescription>
            Cada página se convierte en una imagen JPG dentro de tu navegador, sin subir nada a
            ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
            disabled={processing}
            hint="Solo archivos PDF · Máx. 20 MB"
          />

          {file && previewLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Generando vista previa…
            </p>
          )}

          {previews.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {previews.map((preview) => (
                <figure key={preview.url} className="space-y-1">
                  <img
                    src={preview.url}
                    alt={`Miniatura de la página ${preview.page}`}
                    className="h-28 w-full rounded-md border bg-white object-contain sm:h-36"
                  />
                  <figcaption className="text-center text-xs text-muted-foreground">
                    Página {preview.page}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {numPages !== null && (
            <p className="text-sm text-muted-foreground">
              El documento tiene <span className="font-medium text-foreground">{numPages}</span>{" "}
              {numPages === 1 ? "página" : "páginas"}.
            </p>
          )}

          {numPages !== null && numPages > PAGE_LIMIT_WARNING && (
            <Alert className="border-amber-500/50 text-amber-700 dark:text-amber-400">
              <TriangleAlert aria-hidden />
              <AlertDescription>
                Este documento supera las {PAGE_LIMIT_WARNING} páginas. La conversión puede tardar
                varios minutos y consumir mucha memoria. Si solo necesitas algunas páginas,
                considéralas extraerlas antes con la herramienta &quot;Dividir PDF&quot;.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Opciones de imagen</CardTitle>
          <CardDescription>
            Con más de una página recibirás un ZIP con un JPG por página (pagina-1.jpg,
            pagina-2.jpg…).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="pdf2jpg-quality">Calidad JPEG</Label>
              <span className="text-sm font-medium tabular-nums">{quality}%</span>
            </div>
            <Slider
              id="pdf2jpg-quality"
              min={30}
              max={95}
              step={1}
              value={[quality]}
              onValueChange={(values) => setQuality(values[0] ?? 85)}
              disabled={processing}
              aria-label="Calidad JPEG de las imágenes exportadas"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pdf2jpg-scale">Escala de renderizado</Label>
            <Select
              value={scale}
              onValueChange={(value) => setScale(value as ExportScale)}
              disabled={processing}
            >
              <SelectTrigger id="pdf2jpg-scale" className="w-full">
                <SelectValue placeholder="Elige la escala" />
              </SelectTrigger>
              <SelectContent>
                {SCALE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Convertir y descargar</CardTitle>
          <CardDescription>
            El proceso puede tardar unos segundos en documentos largos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {processing && (
            <div className="space-y-2" aria-live="polite">
              <Progress value={progress} />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {statusText ?? "Procesando…"}
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {result.zipped
                  ? `ZIP con ${result.pages} imágenes JPG · ${formatBytes(result.blob.size)}`
                  : `1 imagen JPG · ${formatBytes(result.blob.size)}`}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <DownloadButton blob={result.blob} filename={result.filename} label="Descargar" />
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Convertir otro archivo
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleProcess}
              disabled={!file || processing}
              className="w-full gap-2 sm:w-auto"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileImage className="size-4" aria-hidden />
              )}
              {processing ? "Convirtiendo…" : "Convertir a JPG"}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
