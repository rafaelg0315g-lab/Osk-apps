"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileVideo,
  Film,
  Loader2,
  Settings2,
  SkipBack,
  SkipForward,
  Timer,
  X,
} from "lucide-react";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_EXT = /\.(mp4|webm|mov)$/i;
const MAX_SIZE_MB = 200;
const MAX_GIF_SECONDS = 30;

type WidthChoice = "320" | "480" | "640";
type FpsChoice = "10" | "12" | "15";
type ColorsChoice = "64" | "128" | "256";

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

interface GifResult {
  blob: Blob;
  size: number;
  frames: number;
  width: number;
  height: number;
  fps: number;
}

class CancelledError extends Error {
  constructor() {
    super("Proceso cancelado por el usuario.");
  }
}

function isAllowedVideo(file: File): boolean {
  if (file.type) return ALLOWED_TYPES.has(file.type);
  return ALLOWED_EXT.test(file.name);
}

function baseName(name: string): string {
  const withoutExt = name.replace(/\.[^.]+$/, "");
  const clean = withoutExt.replace(/[/\\:*?"<>|]/g, "-").trim();
  return clean.length > 0 ? clean : "video";
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resolve();
      return;
    }
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("No se pudo leer el video. Tu navegador puede no soportar este formato o códec."));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}

function resolveDuration(video: HTMLVideoElement): Promise<number> {
  const direct = video.duration;
  if (Number.isFinite(direct) && direct > 0) return Promise.resolve(direct);
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      const d = video.duration;
      resolve(Number.isFinite(d) && d > 0 ? d : 0);
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = 1e7;
  });
}

async function probeVideoMeta(file: File): Promise<VideoMeta> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitForMetadata(video);
    const duration = await resolveDuration(video);
    return { duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    try {
      video.pause();
    } catch {
      // ignorar
    }
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Seek determinista: resuelve en 'seeked' o tras un tiempo de seguridad. */
function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.005) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }, 4000);
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

export default function VideoToGifTool() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [widthChoice, setWidthChoice] = useState<WidthChoice>("480");
  const [fpsChoice, setFpsChoice] = useState<FpsChoice>("12");
  const [colorsChoice, setColorsChoice] = useState<ColorsChoice>("128");
  const [generating, setGenerating] = useState(false);
  const [framesDone, setFramesDone] = useState(0);
  const [result, setResult] = useState<GifResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : null;
    setFileUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const url = result ? URL.createObjectURL(result.blob) : null;
    setResultUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result]);

  const duration = meta?.duration ?? 0;
  const fps = Number(fpsChoice);
  const maxColors = Number(colorsChoice);

  const rangeValid =
    meta !== null &&
    duration > 0 &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end > start &&
    end - start >= 0.2 &&
    end - start <= MAX_GIF_SECONDS + 0.001 &&
    end <= duration + 0.05;

  const totalFrames = rangeValid ? Math.max(1, Math.round((end - start) * fps)) : 0;
  const outWidth = useMemo(() => {
    if (!meta || meta.width <= 0) return 0;
    const chosen = Number(widthChoice);
    // Nunca agrandar: si el video es más pequeño, se usa su ancho original.
    return Math.max(2, Math.min(chosen, meta.width));
  }, [meta, widthChoice]);
  const outHeight = useMemo(() => {
    if (!meta || meta.width <= 0 || outWidth <= 0) return 0;
    return Math.max(2, Math.round((outWidth * meta.height) / meta.width));
  }, [meta, outWidth]);

  const pct = totalFrames > 0 && generating ? Math.min(100, Math.round((framesDone / totalFrames) * 100)) : 0;

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (!next) {
      setFile(null);
      setMeta(null);
      setMetaError(null);
      setResult(null);
      return;
    }
    if (!isAllowedVideo(next)) {
      toast.error("Formato no compatible. Sube un video MP4, WebM o MOV.");
      return;
    }
    setFile(next);
    setMeta(null);
    setMetaError(null);
    setResult(null);
    setStart(0);
    setEnd(0);
    setFramesDone(0);

    void probeVideoMeta(next)
      .then((m) => {
        setMeta(m);
        setStart(0);
        setEnd(m.duration > 0 ? Math.min(m.duration, 5) : 0);
        if (m.duration <= 0 || m.width <= 0) {
          setMetaError("No se pudieron leer los metadatos del video (duración o dimensiones).");
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "No se pudo leer el video.";
        setMetaError(message);
        toast.error(message);
      });
  };

  const clampStart = (value: number) => {
    const next = Number.isFinite(value) ? value : 0;
    const max = duration > 0 ? Math.max(0, end - 0.2) : Math.max(0, next);
    setStart(Math.min(Math.max(0, next), max));
  };

  const clampEnd = (value: number) => {
    const next = Number.isFinite(value) ? value : 0;
    const min = start + 0.2;
    const max = duration > 0 ? Math.min(duration, start + MAX_GIF_SECONDS) : Math.max(min, next);
    setEnd(Math.min(Math.max(min, next), max));
  };

  const markStart = () => {
    const t = previewRef.current?.currentTime ?? 0;
    clampStart(t);
  };

  const markEnd = () => {
    const t = previewRef.current?.currentTime ?? 0;
    if (t > start) clampEnd(t);
    else toast.warning("El tiempo actual es anterior al inicio marcado.");
  };

  const goToStart = () => {
    if (previewRef.current) previewRef.current.currentTime = start;
  };

  const goToEnd = () => {
    if (previewRef.current) previewRef.current.currentTime = end;
  };

  const handleCancel = () => {
    cancelRef.current.cancelled = true;
  };

  const handleGenerate = async () => {
    if (!file || !meta || !rangeValid || generating) return;
    cancelRef.current = { cancelled: false };
    setGenerating(true);
    setResult(null);
    setFramesDone(0);

    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.playsInline = true;
    video.preload = "auto";
    video.muted = true;
    video.setAttribute("aria-hidden", "true");
    video.style.position = "fixed";
    video.style.left = "-10000px";
    video.style.top = "0";
    video.style.width = "2px";
    video.style.height = "2px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    document.body.appendChild(video);

    const w = outWidth;
    const h = outHeight;
    const step = 1 / fps;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });

    try {
      if (!ctx) throw new Error("No se pudo crear el lienzo de procesamiento en tu navegador.");
      await waitForMetadata(video);

      const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
      const encoder = GIFEncoder();
      const frames = Math.max(1, Math.round((end - start) / step) || 1);

      for (let i = 0; i < frames; i++) {
        if (cancelRef.current.cancelled) throw new CancelledError();
        const t = Math.min(start + i * step, Math.max(start, end - 0.001));
        await seekTo(video, t);
        ctx.drawImage(video, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        const palette = quantize(data, maxColors);
        const index = applyPalette(data, palette);
        encoder.writeFrame(index, w, h, { palette, delay: Math.round(step * 1000) });
        setFramesDone(i + 1);
      }

      encoder.finish();
      const bytes = encoder.bytes();
      const blob = new Blob([bytes as unknown as BlobPart], { type: "image/gif" });
      if (blob.size === 0) throw new Error("No se generaron datos del GIF. Inténtalo de nuevo.");
      setResult({ blob, size: blob.size, frames, width: w, height: h, fps });
      toast.success("GIF generado correctamente.");
    } catch (err) {
      if (err instanceof CancelledError) {
        toast.info("Generación cancelada.");
      } else {
        const message = err instanceof Error ? err.message : "No se pudo generar el GIF.";
        toast.error(message);
      }
    } finally {
      try {
        video.pause();
      } catch {
        // ignorar
      }
      video.removeAttribute("src");
      video.load();
      video.remove();
      URL.revokeObjectURL(url);
      setGenerating(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setMeta(null);
    setMetaError(null);
    setResult(null);
    setStart(0);
    setEnd(0);
    setFramesDone(0);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="size-5 text-primary" aria-hidden />
            1. Sube tu video
          </CardTitle>
          <CardDescription>
            Acepta MP4, WebM y MOV de hasta {MAX_SIZE_MB} MB. El GIF se genera en tu navegador: el
            archivo nunca sale de tu dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={MAX_SIZE_MB}
            hint="MP4, WebM o MOV"
            disabled={generating}
          />

          {file && fileUrl && (
            <div className="space-y-3">
              <video
                ref={previewRef}
                src={fileUrl}
                controls
                muted
                playsInline
                preload="metadata"
                className="max-h-72 w-full rounded-lg border bg-black"
                aria-label="Vista previa del video"
              />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{formatBytes(file.size)}</Badge>
                {meta && (
                  <>
                    <Badge variant="secondary">Duración: {formatTime(meta.duration)}</Badge>
                    <Badge variant="secondary">
                      {meta.width}×{meta.height} px
                    </Badge>
                  </>
                )}
                {generating && (
                  <Badge className="flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    Generando…
                  </Badge>
                )}
              </div>
              {metaError && !generating && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden />
                  <AlertTitle>No se pudo analizar el video</AlertTitle>
                  <AlertDescription>{metaError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="size-5 text-primary" aria-hidden />
            2. Elige el fragmento y la calidad
          </CardTitle>
          <CardDescription>
            Máximo {MAX_GIF_SECONDS} segundos de GIF. Usa el reproductor para encontrar los tiempos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="gif-start">Inicio (segundos)</Label>
              <Input
                id="gif-start"
                type="number"
                min={0}
                max={Math.max(0, end - 0.2)}
                step={0.1}
                value={Number.isFinite(start) ? start : 0}
                onChange={(e) => clampStart(Number(e.target.value))}
                disabled={generating || !meta}
                inputMode="decimal"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={markStart} disabled={generating || !file} className="gap-1.5">
                  <Timer className="size-3.5" aria-hidden />
                  Usar tiempo actual
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={goToStart} disabled={generating || !file} className="gap-1.5">
                  <SkipBack className="size-3.5" aria-hidden />
                  Ir al inicio
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="gif-end">Fin (segundos)</Label>
              <Input
                id="gif-end"
                type="number"
                min={start + 0.2}
                max={duration > 0 ? duration : undefined}
                step={0.1}
                value={Number.isFinite(end) ? end : 0}
                onChange={(e) => clampEnd(Number(e.target.value))}
                disabled={generating || !meta}
                inputMode="decimal"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={markEnd} disabled={generating || !file} className="gap-1.5">
                  <Timer className="size-3.5" aria-hidden />
                  Usar tiempo actual
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={goToEnd} disabled={generating || !file} className="gap-1.5">
                  <SkipForward className="size-3.5" aria-hidden />
                  Ir al fin
                </Button>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {rangeValid
              ? `Fragmento: ${formatTime(start)} → ${formatTime(end)} (${(end - start).toFixed(1)} s) · ${totalFrames} fotogramas · GIF de ${(totalFrames / fps).toFixed(1)} s.`
              : `El fragmento debe durar entre 0,2 y ${MAX_GIF_SECONDS} segundos dentro del video.`}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="gif-width">Ancho</Label>
              <Select value={widthChoice} onValueChange={(v) => setWidthChoice(v as WidthChoice)} disabled={generating}>
                <SelectTrigger id="gif-width" className="w-full" aria-label="Ancho del GIF">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="320">320 px</SelectItem>
                  <SelectItem value="480">480 px</SelectItem>
                  <SelectItem value="640">640 px</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gif-fps">Fotogramas por segundo</Label>
              <Select value={fpsChoice} onValueChange={(v) => setFpsChoice(v as FpsChoice)} disabled={generating}>
                <SelectTrigger id="gif-fps" className="w-full" aria-label="Fotogramas por segundo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 fps</SelectItem>
                  <SelectItem value="12">12 fps</SelectItem>
                  <SelectItem value="15">15 fps</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gif-colors">Colores (paleta)</Label>
              <Select value={colorsChoice} onValueChange={(v) => setColorsChoice(v as ColorsChoice)} disabled={generating}>
                <SelectTrigger id="gif-colors" className="w-full" aria-label="Colores de la paleta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="64">64 colores</SelectItem>
                  <SelectItem value="128">128 colores</SelectItem>
                  <SelectItem value="256">256 colores</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {outWidth > 0 && outHeight > 0
              ? `Salida: ${outWidth}×${outHeight} px (mantiene el aspecto; si el video es más pequeño, no se agranda).`
              : "Sube un video para ver el tamaño de salida."}
          </p>

          {generating ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  Generando GIF… {pct}%
                </span>
                <span className="tabular-nums text-muted-foreground">
                  Fotograma {Math.min(framesDone, totalFrames)} de {totalFrames}
                </span>
              </div>
              <Progress value={pct} aria-label="Progreso de generación del GIF" />
              <p className="text-xs text-muted-foreground">
                Cada fotograma se extrae y cuantiza en tu navegador. No cierres esta pestaña.
              </p>
              <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
                <X className="size-4" aria-hidden />
                Cancelar
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={handleGenerate} disabled={!file || !rangeValid} className="w-full sm:w-auto">
              <Settings2 className="size-4" aria-hidden />
              Generar GIF
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              GIF listo
            </CardTitle>
            <CardDescription>
              {result.frames} fotogramas a {result.fps} fps · {result.width}×{result.height} px ·
              duración {(result.frames / result.fps).toFixed(1)} s.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg bg-muted/40 p-4 sm:justify-start">
              {resultUrl && (
                <img
                  src={resultUrl}
                  alt="Vista previa del GIF generado"
                  className="max-h-48 rounded-lg border"
                />
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{formatBytes(result.size)}</Badge>
                <Badge variant="outline">GIF</Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton blob={result.blob} filename={`${file ? baseName(file.name) : "video"}.gif`} label="Descargar GIF" size="lg" />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <X className="size-4" aria-hidden />
                Generar otro GIF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
