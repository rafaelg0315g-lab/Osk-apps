"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, Repeat } from "lucide-react";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { processFiles } from "@/lib/upload-client";
import { cn, formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/tiff,image/avif,.jpg,.jpeg,.png,.webp,.gif,.tiff,.avif";

type TargetFormat = "png" | "jpeg" | "webp";

const TARGETS: { value: TargetFormat; label: string; description: string }[] = [
  { value: "png", label: "PNG", description: "Sin pérdida y con transparencia." },
  { value: "jpeg", label: "JPEG", description: "Ideal para fotos; sin transparencia." },
  { value: "webp", label: "WebP", description: "Ligero y moderno; admite transparencia." },
];

interface ConversionResult {
  blob: Blob;
  filename: string;
  originalSize: number;
  resultSize: number;
}

export default function ConvertImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<TargetFormat>("png");
  const [quality, setQuality] = useState(80);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }, [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
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
      form.append("target", target);
      form.append("quality", String(quality));
      const { blob, filename, headers } = await processFiles("/api/tools/convert-image", form);
      setResult({
        blob,
        filename,
        originalSize: Number(headers.get("X-Original-Size")) || file.size,
        resultSize: Number(headers.get("X-Result-Size")) || blob.size,
      });
      toast.success("Imagen convertida correctamente.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo convertir la imagen.";
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
    setTarget("png");
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="size-5 text-primary" aria-hidden />
            1. Sube tu imagen
          </CardTitle>
          <CardDescription>
            Convierte entre PNG, JPEG y WebP (también aceptamos GIF, TIFF y AVIF como entrada). El
            archivo se procesa en el servidor y nunca se guarda.
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
            <Repeat className="size-5 text-primary" aria-hidden />
            2. Formato de destino
          </CardTitle>
          <CardDescription>Elige a qué formato quieres convertir la imagen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label id="target-label">Formato</Label>
            <div
              role="radiogroup"
              aria-labelledby="target-label"
              className="grid gap-2 sm:grid-cols-3"
            >
              {TARGETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={target === option.value}
                  disabled={loading}
                  onClick={() => setTarget(option.value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    target === option.value ? "border-primary bg-primary/5" : "bg-card",
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {target !== "png" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="convert-quality">Calidad</Label>
                <span className="text-sm font-medium tabular-nums">{quality}%</span>
              </div>
              <Slider
                id="convert-quality"
                min={1}
                max={100}
                step={1}
                value={[quality]}
                onValueChange={(values) => setQuality(values[0] ?? quality)}
                disabled={loading}
                aria-label="Nivel de calidad de la conversión"
              />
              <p className="text-xs text-muted-foreground">
                Una calidad menor reduce más el peso, pero puede perder detalle.
              </p>
            </div>
          )}

          <Button
            type="button"
            onClick={handleProcess}
            disabled={!file || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Repeat className="size-4" aria-hidden />
            )}
            {loading ? "Convirtiendo..." : "Convertir imagen"}
          </Button>

          {error && !result && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Conversión completada
            </CardTitle>
            <CardDescription>
              Tu imagen está lista en formato {result.filename.split(".").pop()?.toUpperCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <span className="font-medium">{formatBytes(result.originalSize)}</span>
              <span aria-hidden className="text-muted-foreground">
                &rarr;
              </span>
              <span className="font-medium">{formatBytes(result.resultSize)}</span>
              {result.resultSize < result.originalSize && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">
                  El archivo resultante pesa menos
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result.blob}
                filename={result.filename}
                label="Descargar imagen convertida"
                size="lg"
              />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <RefreshCw className="size-4" aria-hidden />
                Convertir otra imagen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
