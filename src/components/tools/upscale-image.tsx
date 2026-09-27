"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileImage,
  Info,
  Loader2,
  Maximize2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIDE = 4096;

const FACTORS = [2, 3, 4] as const;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen. El archivo puede estar dañado."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el archivo de imagen."))),
      type,
      quality,
    );
  });
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name || "imagen";
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** JPEG no soporta transparencia: compone sobre fondo blanco. */
function flattenForJpeg(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out;
}

/**
 * Máscara de enfoque (unsharp mask) con convolución 3x3 en cruz:
 * centro ponderado con 1 + 4a y vecinos restados con peso a.
 */
function applyUnsharp(canvas: HTMLCanvasElement, amount: number) {
  if (amount <= 0) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const s = image.data;
  const out = new Uint8ClampedArray(s);
  const a = amount;
  const stride = w * 4;
  for (let y = 1; y < h - 1; y++) {
    let i = (y * w + 1) * 4;
    for (let x = 1; x < w - 1; x++, i += 4) {
      for (let c = 0; c < 3; c++) {
        out[i + c] =
          s[i + c] * (1 + 4 * a) - a * (s[i - 4 + c] + s[i + 4 + c] + s[i - stride + c] + s[i + stride + c]);
      }
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}

interface UpscaleResult {
  blob: Blob;
  width: number;
  height: number;
}

export default function UpscaleImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [factor, setFactor] = useState<2 | 3 | 4>(2);
  const [sharpen, setSharpen] = useState(40);
  const [denoise, setDenoise] = useState(false);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpscaleResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Revoca los object URLs cuando cambian o al desmontar.
  useEffect(() => {
    if (!fileUrl) return;
    return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  useEffect(() => {
    if (!resultUrl) return;
    return () => URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  const maxSide = img ? Math.max(img.naturalWidth, img.naturalHeight) : 0;
  const maxFactor = maxSide > 0 ? Math.floor(MAX_SIDE / maxSide) : 4;
  const anyFactorAllowed = maxFactor >= FACTORS[0];
  const targetW = img ? Math.round(img.naturalWidth * factor) : 0;
  const targetH = img ? Math.round(img.naturalHeight * factor) : 0;
  const estimate = file ? file.size * factor * factor : 0;

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (!next) {
      setFile(null);
      setImg(null);
      setFileUrl(null);
      setResult(null);
      setResultUrl(null);
      return;
    }
    if (next.type && !ALLOWED_TYPES.has(next.type)) {
      toast.error("Formato no compatible. Sube una imagen JPEG, PNG o WebP.");
      return;
    }
    setResult(null);
    setResultUrl(null);
    void (async () => {
      try {
        const loaded = await loadImageFromFile(next);
        setFile(next);
        setFileUrl(URL.createObjectURL(next));
        setImg(loaded);
        const ms = Math.max(loaded.naturalWidth, loaded.naturalHeight);
        const mf = Math.floor(MAX_SIDE / ms);
        const best = FACTORS.filter((f) => f <= mf).pop();
        if (best) setFactor(best);
      } catch (err) {
        toast.error(errMessage(err, "No se pudo leer la imagen."));
      }
    })();
  };

  const handleProcess = async () => {
    if (!img || !file || busy) return;
    setBusy(true);
    try {
      // Deja que el navegador pinte el estado de carga antes del trabajo pesado.
      await new Promise((r) => setTimeout(r, 60));

      let src = document.createElement("canvas");
      src.width = img.naturalWidth;
      src.height = img.naturalHeight;
      const sctx = src.getContext("2d");
      if (!sctx) throw new Error("No se pudo preparar el procesamiento de la imagen.");
      if (denoise) {
        sctx.filter = "blur(0.6px)";
        sctx.drawImage(img, 0, 0);
        sctx.filter = "none";
      } else {
        sctx.drawImage(img, 0, 0);
      }

      // Reescalado escalonado: pasos sucesivos de x2 con suavizado de alta calidad.
      let curW = src.width;
      let curH = src.height;
      let remaining = factor;
      while (remaining > 1.001) {
        const step = remaining >= 2 ? 2 : remaining;
        const nw = Math.max(1, Math.round(curW * step));
        const nh = Math.max(1, Math.round(curH * step));
        const dst = document.createElement("canvas");
        dst.width = nw;
        dst.height = nh;
        const dctx = dst.getContext("2d");
        if (!dctx) throw new Error("No se pudo preparar el procesamiento de la imagen.");
        dctx.imageSmoothingEnabled = true;
        dctx.imageSmoothingQuality = "high";
        dctx.drawImage(src, 0, 0, nw, nh);
        src = dst;
        curW = nw;
        curH = nh;
        remaining /= step;
      }

      applyUnsharp(src, (sharpen / 100) * 0.35);

      const mime = format === "png" ? "image/png" : "image/jpeg";
      const target = mime === "image/jpeg" ? flattenForJpeg(src) : src;
      const blob = await canvasToBlob(target, mime, quality / 100);
      setResult({ blob, width: curW, height: curH });
      setResultUrl(URL.createObjectURL(blob));
      toast.success("Imagen escalada correctamente.");
    } catch (err) {
      toast.error(errMessage(err, "No se pudo escalar la imagen."));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImg(null);
    setFileUrl(null);
    setResult(null);
    setResultUrl(null);
    setFactor(2);
    setSharpen(40);
    setDenoise(false);
    setFormat("png");
    setQuality(90);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="size-5 text-primary" aria-hidden />
            1. Sube tu imagen
          </CardTitle>
          <CardDescription>
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB. El reescalado ocurre en tu dispositivo,
            sin IA y sin subir la imagen a ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
          />
          {file && img && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                Original: {img.naturalWidth} × {img.naturalHeight} px · {formatBytes(file.size)}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {img && file && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5 text-primary" aria-hidden />
              2. Configuración del escalado
            </CardTitle>
            <CardDescription>
              Interpolación progresiva por pasos + máscara de enfoque final.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!anyFactorAllowed && (
              <p className="text-sm text-amber-600 dark:text-amber-400" role="status">
                Esta imagen ya supera el máximo de {MAX_SIDE} px por lado permitido, así que no se
                puede ampliar más.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Factor de escalado</Label>
                <Select
                  value={String(factor)}
                  onValueChange={(value) => setFactor(Number.parseInt(value, 10) as 2 | 3 | 4)}
                  disabled={busy || !anyFactorAllowed}
                >
                  <SelectTrigger className="w-full" aria-label="Factor de escalado">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACTORS.map((f) => (
                      <SelectItem key={f} value={String(f)} disabled={f > maxFactor}>
                        {f}x · {Math.round(img.naturalWidth * f)} × {Math.round(img.naturalHeight * f)} px
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Máximo {MAX_SIDE} px por lado. Nuevo tamaño: {targetW} × {targetH} px.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="up-sharpen">Enfoque (unsharp mask)</Label>
                  <span className="text-sm font-medium tabular-nums">{sharpen}%</span>
                </div>
                <Slider
                  id="up-sharpen"
                  min={0}
                  max={100}
                  step={1}
                  value={[sharpen]}
                  onValueChange={(values) => setSharpen(values[0] ?? sharpen)}
                  disabled={busy}
                  aria-label="Intensidad del enfoque"
                />
                <p className="text-xs text-muted-foreground">
                  0 desactiva el enfoque. Valores altos dan más nitidez pero pueden crear halos.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="up-denoise"
                checked={denoise}
                onCheckedChange={(v) => setDenoise(v)}
                disabled={busy}
                aria-label="Reducir ruido leve antes de escalar"
              />
              <Label htmlFor="up-denoise">Reducir ruido leve (suavizado previo)</Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Formato de salida</Label>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as "png" | "jpeg")}
                  disabled={busy}
                >
                  <SelectTrigger className="w-full" aria-label="Formato de salida">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG (sin pérdida)</SelectItem>
                    <SelectItem value="jpeg">JPEG (más ligero)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {format === "jpeg" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="up-quality">Calidad</Label>
                    <span className="text-sm font-medium tabular-nums">{quality}%</span>
                  </div>
                  <Slider
                    id="up-quality"
                    min={1}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={(values) => setQuality(values[0] ?? quality)}
                    disabled={busy}
                    aria-label="Calidad JPEG de la salida"
                  />
                </div>
              )}
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Peso estimado del resultado: ~{formatBytes(estimate)} (aproximación a partir del
              archivo original; el peso real se muestra tras procesar).
            </p>

            <Button
              type="button"
              onClick={handleProcess}
              disabled={busy || !anyFactorAllowed}
              className="w-full sm:w-auto"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Maximize2 className="size-4" aria-hidden />
              )}
              {busy ? "Escalando..." : `Escalar a ${factor}x`}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && resultUrl && file && img && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Imagen escalada
            </CardTitle>
            <CardDescription>
              {img.naturalWidth} × {img.naturalHeight} px &rarr; {result.width} × {result.height} px ·{" "}
              {formatBytes(file.size)} &rarr; {formatBytes(result.blob.size)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex justify-center">
              <img
                src={resultUrl}
                alt="Vista previa de la imagen escalada"
                className="max-h-[50vh] w-auto max-w-full rounded-lg border object-contain"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result.blob}
                filename={`${baseName(file.name)}-${factor}x.${format === "png" ? "png" : "jpg"}`}
                label="Descargar imagen"
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

      <Alert>
        <Info className="size-4" aria-hidden />
        <AlertTitle>Cómo funciona</AlertTitle>
        <AlertDescription>
          Reescalado inteligente en tu dispositivo, sin IA: amplía la imagen en pasos sucesivos de
          2x con interpolación de alta calidad y aplica después una máscara de enfoque. La imagen no
          inventa detalle como haría una IA de superresolución, pero conserva el máximo de la
          información original.
        </AlertDescription>
      </Alert>
    </ToolShell>
  );
}
