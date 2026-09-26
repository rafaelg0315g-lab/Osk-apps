"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileImage, Loader2, RefreshCw, Settings2 } from "lucide-react";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { processFiles } from "@/lib/upload-client";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type OutputFormat = "keep" | "jpeg" | "png" | "webp";

interface CompressionResult {
  blob: Blob;
  filename: string;
  originalSize: number;
  resultSize: number;
}

export default function CompressImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<OutputFormat>("keep");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => {
    setOriginalUrl(file ? URL.createObjectURL(file) : null);
  }, [file]);

  useEffect(() => {
    if (!originalUrl) return;
    return () => URL.revokeObjectURL(originalUrl);
  }, [originalUrl]);

  useEffect(() => {
    setResultUrl(result ? URL.createObjectURL(result.blob) : null);
  }, [result]);

  useEffect(() => {
    if (!resultUrl) return;
    return () => URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (next && next.type && !ALLOWED_TYPES.has(next.type)) {
      toast.error("Formato no compatible. Sube una imagen JPEG, PNG o WebP.");
      return;
    }
    setFile(next);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("quality", String(quality));
      form.append("format", format);
      const { blob, filename, headers } = await processFiles("/api/tools/compress-image", form);
      setResult({
        blob,
        filename,
        originalSize: Number(headers.get("X-Original-Size")) || file.size,
        resultSize: Number(headers.get("X-Result-Size")) || blob.size,
      });
      toast.success("Imagen comprimida correctamente.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo comprimir la imagen.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setQuality(80);
    setFormat("keep");
  };

  const savedPct =
    result && result.originalSize > 0
      ? Math.round((1 - result.resultSize / result.originalSize) * 100)
      : 0;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="size-5 text-primary" aria-hidden />
            1. Sube tu imagen
          </CardTitle>
          <CardDescription>
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB. El archivo se procesa en el servidor y
            nunca se guarda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
            disabled={loading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-primary" aria-hidden />
            2. Opciones de compresión
          </CardTitle>
          <CardDescription>Ajusta la calidad y el formato de salida.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="quality-slider">Calidad</Label>
              <span className="text-sm font-medium tabular-nums">{quality}%</span>
            </div>
            <Slider
              id="quality-slider"
              min={1}
              max={100}
              step={1}
              value={[quality]}
              onValueChange={(values) => setQuality(values[0] ?? quality)}
              disabled={loading}
              aria-label="Nivel de calidad de la compresión"
            />
            <p className="text-xs text-muted-foreground">
              {format === "png"
                ? "El formato PNG no usa calidad: se aplica compresión sin pérdida."
                : "Una calidad menor reduce más el peso, pero puede perder detalle."}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Formato de salida</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as OutputFormat)}
              disabled={loading}
            >
              <SelectTrigger className="w-full sm:w-64" aria-label="Formato de salida">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Mantener original</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            onClick={handleProcess}
            disabled={!file || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Settings2 className="size-4" aria-hidden />
            )}
            {loading ? "Comprimiendo..." : "Comprimir imagen"}
          </Button>

          {error && !result && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && resultUrl && originalUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Compresión completada
            </CardTitle>
            <CardDescription>Compara el antes y el después, y descarga tu imagen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Original · {formatBytes(result.originalSize)}
                </figcaption>
                <img
                  src={originalUrl}
                  alt="Vista previa de la imagen original"
                  className="max-h-56 w-full rounded-lg border object-contain"
                />
              </figure>
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Comprimida · {formatBytes(result.resultSize)}
                </figcaption>
                <img
                  src={resultUrl}
                  alt="Vista previa de la imagen comprimida"
                  className="max-h-56 w-full rounded-lg border object-contain"
                />
              </figure>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <span className="font-medium">{formatBytes(result.originalSize)}</span>
              <span aria-hidden className="text-muted-foreground">
                &rarr;
              </span>
              <span className="font-medium">{formatBytes(result.resultSize)}</span>
              {savedPct > 0 ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Ahorras un {savedPct}%
                </Badge>
              ) : savedPct < 0 ? (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  El resultado pesa un {Math.abs(savedPct)}% más
                </Badge>
              ) : (
                <Badge variant="secondary">Sin cambio de tamaño</Badge>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result.blob}
                filename={result.filename}
                label="Descargar imagen comprimida"
                size="lg"
              />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <RefreshCw className="size-4" aria-hidden />
                Procesar otra imagen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
