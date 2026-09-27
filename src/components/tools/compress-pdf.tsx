"use client";

import { useState } from "react";
import { FileDown, Loader2, TriangleAlert } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

type RenderScale = "1" | "1.5" | "2";

const SCALE_OPTIONS: { value: RenderScale; label: string }[] = [
  { value: "1", label: "Baja (1x) — máximo ahorro" },
  { value: "1.5", label: "Media (1.5x) — equilibrio" },
  { value: "2", label: "Alta (2x) — mejor calidad" },
];

interface CompressResult {
  blob: Blob;
  size: number;
  pages: number;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function baseName(name: string): string {
  const withoutExt = name.replace(/\.pdf$/i, "");
  return withoutExt.trim() || "documento";
}

/** Rasteriza una página del PDF en un canvas y la devuelve como JPEG. */
async function renderPageToJpeg(
  page: pdfjsLib.PDFPageProxy,
  scale: number,
  quality: number,
): Promise<Blob> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) {
    throw new Error("No se pudo rasterizar una página del documento.");
  }
  return blob;
}

export default function CompressPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(60);
  const [scale, setScale] = useState<RenderScale>("1.5");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompressResult | null>(null);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (next && !isPdfFile(next)) {
      toast.error(`"${next.name}" no es un archivo PDF.`);
      return;
    }
    setFile(next);
    setResult(null);
    setError(null);
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
        const source = await loadingTask.promise;
        const total = source.numPages;
        const output = await PDFDocument.create();
        const renderScale = Number(scale);
        const jpegQuality = quality / 100;

        for (let i = 1; i <= total; i++) {
          setStatusText(`Rasterizando página ${i} de ${total}…`);
          setProgress(Math.round(((i - 1) / total) * 100));

          const page = await source.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const jpegBlob = await renderPageToJpeg(page, renderScale, jpegQuality);
          const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
          const image = await output.embedJpg(jpegBytes);
          const pdfPage = output.addPage([baseViewport.width, baseViewport.height]);
          pdfPage.drawImage(image, {
            x: 0,
            y: 0,
            width: baseViewport.width,
            height: baseViewport.height,
          });
          page.cleanup();

          setProgress(Math.round((i / total) * 100));
          // Pausa breve para que el navegador pinte el progreso entre páginas.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const bytes = await output.save();
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });

        setResult({ blob, size: blob.size, pages: total });
        setStatusText(null);
        toast.success("PDF comprimido y listo para descargar.");
      } finally {
        await loadingTask.destroy().catch(() => undefined);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo comprimir el PDF. Inténtalo de nuevo.";
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
    setProgress(0);
    setStatusText(null);
  };

  const savingPercent =
    result && file && file.size > 0 ? ((file.size - result.size) / file.size) * 100 : null;
  const doesSave = savingPercent !== null && savingPercent > 0.5;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="size-5 text-primary" aria-hidden />
            1. Sube tu PDF
          </CardTitle>
          <CardDescription>
            El archivo se procesa íntegramente en tu navegador: nunca se sube a ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
            disabled={processing}
            hint="Solo archivos PDF · Máx. 20 MB"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Ajustes de compresión</CardTitle>
          <CardDescription>
            Cada página se convierte en una imagen JPEG y se reconstruye el PDF. El texto deja de
            ser seleccionable, así que elige la calidad según el uso del documento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="compress-quality">Calidad JPEG</Label>
              <span className="text-sm font-medium tabular-nums">{quality}%</span>
            </div>
            <Slider
              id="compress-quality"
              min={30}
              max={90}
              step={1}
              value={[quality]}
              onValueChange={(values) => setQuality(values[0] ?? 60)}
              disabled={processing}
              aria-label="Calidad JPEG de la compresión"
            />
            <p className="text-xs text-muted-foreground">
              Menor calidad = menor peso. Con valores bajos pueden aparecer artefactos en textos
              pequeños.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="compress-scale">Resolución de renderizado</Label>
            <Select
              value={scale}
              onValueChange={(value) => setScale(value as RenderScale)}
              disabled={processing}
            >
              <SelectTrigger id="compress-scale" className="w-full">
                <SelectValue placeholder="Elige la resolución" />
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
          <CardTitle>3. Comprimir y descargar</CardTitle>
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

          {result && file && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Original</p>
                  <p className="text-sm font-semibold">{formatBytes(file.size)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Comprimido</p>
                  <p className="text-sm font-semibold">{formatBytes(result.size)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Páginas</p>
                  <p className="text-sm font-semibold">{result.pages}</p>
                </div>
              </div>
              <div className="flex justify-center">
                {savingPercent !== null && doesSave && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                    Ahorras un {Math.round(savingPercent)}%
                  </Badge>
                )}
                {savingPercent !== null && !doesSave && (
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    {savingPercent >= 0
                      ? "Casi sin cambio de peso"
                      : `Un ${Math.abs(Math.round(savingPercent))}% más pesado`}
                  </Badge>
                )}
              </div>
              {!doesSave && (
                <p className="text-center text-xs text-muted-foreground">
                  Los PDF con mucho texto pueden pesar más al convertirlos en imágenes. Prueba con
                  una calidad o resolución más baja, o usa esta herramienta solo con documentos
                  con gráficos e imágenes.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <DownloadButton
                  blob={result.blob}
                  filename={`${baseName(file.name)}-comprimido.pdf`}
                  label="Descargar PDF comprimido"
                />
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Comprimir otro archivo
                </Button>
              </div>
            </div>
          )}

          {!result && (
            <Button
              type="button"
              onClick={handleProcess}
              disabled={!file || processing}
              className="w-full gap-2 sm:w-auto"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileDown className="size-4" aria-hidden />
              )}
              {processing ? "Comprimiendo…" : "Comprimir PDF"}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
