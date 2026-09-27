"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileImage,
  Loader2,
  Lock,
  LockOpen,
  Maximize2,
  Percent,
  RefreshCw,
  Settings2,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_DIM = 10000;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

let webpEncodeSupport: boolean | null = null;
function supportsWebpEncode(): boolean {
  if (webpEncodeSupport === null) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    webpEncodeSupport = probe.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webpEncodeSupport;
}

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

function resolveOutputMime(format: "keep" | "png" | "jpeg" | "webp", originalType: string) {
  let mime =
    format === "keep" ? (ALLOWED_TYPES.has(originalType) ? originalType : "image/png") : `image/${format}`;
  let fallback = false;
  if (mime === "image/webp" && !supportsWebpEncode()) {
    mime = "image/png";
    fallback = true;
  }
  return { mime, fallback };
}

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_DIM, Math.max(1, Math.round(n)));
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

type OutputFormat = "keep" | "png" | "jpeg" | "webp";
type SizeMode = "pixels" | "percent";

interface ResizeResult {
  blob: Blob;
  width: number;
  height: number;
}

export default function ResizeImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<SizeMode>("pixels");
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [percent, setPercent] = useState(100);
  const [lock, setLock] = useState(true);
  const [format, setFormat] = useState<OutputFormat>("keep");
  const [quality, setQuality] = useState(85);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResizeResult | null>(null);
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

  const resolved = useMemo(() => {
    if (!file) return null;
    return resolveOutputMime(format, file.type);
  }, [file, format]);

  const showQuality =
    resolved?.mime === "image/jpeg" || resolved?.mime === "image/webp";

  const applyPercent = (p: number) => {
    if (!img) return;
    const safe = Math.min(500, Math.max(1, p));
    setPercent(safe);
    setWidth(clampDim((img.naturalWidth * safe) / 100));
    setHeight(clampDim((img.naturalHeight * safe) / 100));
  };

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
        setWidth(clampDim(loaded.naturalWidth));
        setHeight(clampDim(loaded.naturalHeight));
        setPercent(100);
      } catch (err) {
        toast.error(errMessage(err, "No se pudo leer la imagen."));
      }
    })();
  };

  const handleWidthChange = (raw: string) => {
    const v = Number.parseInt(raw, 10);
    if (Number.isNaN(v)) return;
    const w = clampDim(v);
    setWidth(w);
    if (lock && img && img.naturalWidth > 0) {
      setHeight(clampDim((w * img.naturalHeight) / img.naturalWidth));
    }
  };

  const handleHeightChange = (raw: string) => {
    const v = Number.parseInt(raw, 10);
    if (Number.isNaN(v)) return;
    const h = clampDim(v);
    setHeight(h);
    if (lock && img && img.naturalHeight > 0) {
      setWidth(clampDim((h * img.naturalWidth) / img.naturalHeight));
    }
  };

  const handleProcess = async () => {
    if (!img || loading) return;
    setLoading(true);
    try {
      const mimeInfo = resolveOutputMime(format, file?.type ?? "");
      if (mimeInfo.fallback) {
        toast.info("Tu navegador no puede generar WebP; se usará PNG en su lugar.");
      }
      const w = clampDim(width);
      const h = clampDim(height);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar el lienzo de salida.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      const target = mimeInfo.mime === "image/jpeg" ? flattenForJpeg(canvas) : canvas;
      const blob = await canvasToBlob(target, mimeInfo.mime, quality / 100);
      setResult({ blob, width: w, height: h });
      setResultUrl(URL.createObjectURL(blob));
      toast.success("Imagen redimensionada correctamente.");
    } catch (err) {
      toast.error(errMessage(err, "No se pudo redimensionar la imagen."));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImg(null);
    setFileUrl(null);
    setResult(null);
    setResultUrl(null);
    setWidth(0);
    setHeight(0);
    setPercent(100);
    setFormat("keep");
    setQuality(85);
  };

  const outExt = resolved ? MIME_EXT[resolved.mime] ?? "png" : "png";
  const savedPct =
    result && file && file.size > 0
      ? Math.round((1 - result.blob.size / file.size) * 100)
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
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB. Todo el proceso ocurre en tu
            navegador: la imagen nunca se sube a ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
          />
          {file && fileUrl && img && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">
                Original: {img.naturalWidth} × {img.naturalHeight} px · {formatBytes(file.size)}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {img && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Maximize2 className="size-5 text-primary" aria-hidden />
              2. Nuevo tamaño
            </CardTitle>
            <CardDescription>
              Elige las dimensiones exactas en píxeles o un porcentaje del tamaño original.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full sm:w-fit"
              value={mode}
              onValueChange={(v) => {
                if (v === "pixels" || v === "percent") setMode(v);
              }}
              aria-label="Modo de dimensionado"
            >
              <ToggleGroupItem value="pixels" className="flex-1 sm:flex-none" aria-label="Modo píxeles">
                Píxeles
              </ToggleGroupItem>
              <ToggleGroupItem value="percent" className="flex-1 sm:flex-none" aria-label="Modo porcentaje">
                <Percent className="size-4" aria-hidden />
                Porcentaje
              </ToggleGroupItem>
            </ToggleGroup>

            {mode === "pixels" ? (
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="resize-width">Ancho (px)</Label>
                  <Input
                    id="resize-width"
                    type="number"
                    min={1}
                    max={MAX_DIM}
                    value={width}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    onBlur={() => setWidth(clampDim(width))}
                    disabled={loading}
                  />
                </div>
                <div className="flex justify-center pb-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={lock ? "Desbloquear proporción" : "Bloquear proporción"}
                    aria-pressed={lock}
                    title={lock ? "Proporción bloqueada: el alto se ajusta al ancho" : "Proporción libre"}
                    onClick={() => setLock((v) => !v)}
                    disabled={loading}
                  >
                    {lock ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resize-height">Alto (px)</Label>
                  <Input
                    id="resize-height"
                    type="number"
                    min={1}
                    max={MAX_DIM}
                    value={height}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    onBlur={() => setHeight(clampDim(height))}
                    disabled={loading}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  className="w-full"
                  value={String(percent)}
                  onValueChange={(v) => {
                    if (!v) return;
                    applyPercent(Number.parseInt(v, 10));
                  }}
                  aria-label="Porcentajes rápidos"
                >
                  {[25, 50, 75, 100].map((p) => (
                    <ToggleGroupItem key={p} value={String(p)} className="flex-1">
                      {p}%
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="flex items-center gap-2">
                  <Label htmlFor="resize-percent" className="sr-only">
                    Porcentaje personalizado
                  </Label>
                  <Input
                    id="resize-percent"
                    type="number"
                    min={1}
                    max={500}
                    value={percent}
                    onChange={(e) => {
                      const v = Number.parseInt(e.target.value, 10);
                      if (!Number.isNaN(v)) applyPercent(v);
                    }}
                    onBlur={() => applyPercent(percent)}
                    className="w-28"
                    disabled={loading}
                  />
                  <span className="text-sm text-muted-foreground">
                    % del original ({img.naturalWidth} × {img.naturalHeight} px)
                  </span>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Formato de salida</Label>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as OutputFormat)}
                  disabled={loading}
                >
                  <SelectTrigger className="w-full" aria-label="Formato de salida">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Mantener original</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {showQuality && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="resize-quality">Calidad</Label>
                    <span className="text-sm font-medium tabular-nums">{quality}%</span>
                  </div>
                  <Slider
                    id="resize-quality"
                    min={1}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={(values) => setQuality(values[0] ?? quality)}
                    disabled={loading}
                    aria-label="Calidad de la imagen de salida"
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Resultado: {clampDim(width)} × {clampDim(height)} px
              {resolved ? ` · formato ${MIME_EXT[resolved.mime]?.toUpperCase() ?? "PNG"}` : ""}
            </p>

            <Button
              type="button"
              onClick={handleProcess}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Settings2 className="size-4" aria-hidden />}
              {loading ? "Redimensionando..." : "Redimensionar imagen"}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && resultUrl && fileUrl && file && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Imagen redimensionada
            </CardTitle>
            <CardDescription>Compara el resultado y descárgalo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Original · {img?.naturalWidth} × {img?.naturalHeight} px · {formatBytes(file.size)}
                </figcaption>
                <img
                  src={fileUrl}
                  alt="Vista previa de la imagen original"
                  className="max-h-56 w-full rounded-lg border object-contain"
                />
              </figure>
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Resultado · {result.width} × {result.height} px · {formatBytes(result.blob.size)}
                </figcaption>
                <img
                  src={resultUrl}
                  alt="Vista previa de la imagen redimensionada"
                  className="max-h-56 w-full rounded-lg border object-contain"
                />
              </figure>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <span className="font-medium">{formatBytes(file.size)}</span>
              <span aria-hidden className="text-muted-foreground">&rarr;</span>
              <span className="font-medium">{formatBytes(result.blob.size)}</span>
              {savedPct > 0 ? (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Pesa un {savedPct}% menos
                </Badge>
              ) : savedPct < 0 ? (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Pesa un {Math.abs(savedPct)}% más
                </Badge>
              ) : (
                <Badge variant="secondary">Mismo peso aproximado</Badge>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result.blob}
                filename={`${baseName(file.name)}-${result.width}x${result.height}.${outExt}`}
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
    </ToolShell>
  );
}
