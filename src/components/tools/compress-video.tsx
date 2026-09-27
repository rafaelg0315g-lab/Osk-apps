"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileVideo, Gauge, Loader2, X } from "lucide-react";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_EXT = /\.(mp4|webm|mov)$/i;
const MAX_SIZE_MB = 200;
const CAPTURE_FPS = 30;
const AUDIO_BITS_PER_SECOND = 128000;

const MP4_MIME = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
const WEBM_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

/** Calidades ofrecidas (videoBitsPerSecond). */
const BITRATES = [2000000, 1000000, 500000];
const BITRATE_LABELS = ["Alta · 2 Mbps", "Media · 1 Mbps", "Baja · 0,5 Mbps"];

type ResolutionChoice = "orig" | "720" | "480" | "360";

const RESOLUTION_HEIGHTS: Record<Exclude<ResolutionChoice, "orig">, number> = {
  "720": 720,
  "480": 480,
  "360": 360,
};

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

interface CaptureResult {
  blob: Blob;
  size: number;
}

class CancelledError extends Error {
  constructor() {
    super("Proceso cancelado por el usuario.");
  }
}

function recorderSupported(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder === "function";
}

function pickFirstSupported(candidates: string[]): string | null {
  if (!recorderSupported()) return null;
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // continuar con el siguiente candidato
    }
  }
  return null;
}

function mimeLabel(mime: string): string {
  if (mime.includes("mp4")) return "MP4 (H.264 + AAC)";
  if (mime.includes("vp9")) return "WebM (VP9 + Opus)";
  if (mime.includes("vp8")) return "WebM (VP8 + Opus)";
  return mime.startsWith("video/webm") ? "WebM" : "MP4";
}

function extensionForMime(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
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

function makeEven(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

function computeOutputSize(vw: number, vh: number, targetHeight: number | null): { width: number; height: number } {
  if (!targetHeight || vh <= targetHeight || vw <= 0 || vh <= 0) {
    return { width: makeEven(vw), height: makeEven(vh) };
  }
  const scale = targetHeight / vh;
  return { width: makeEven(vw * scale), height: makeEven(vh * scale) };
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

function waitSeeked(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.01) {
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

interface CaptureParams {
  file: File;
  width: number;
  height: number;
  mimeType: string;
  videoBitsPerSecond: number;
  cancelRef: { cancelled: boolean };
  onProgress: (currentTime: number) => void;
  onNotice: (message: string) => void;
}

/** Exportación en tiempo real con MediaRecorder (misma base que convertir video). */
async function runCapture(params: CaptureParams): Promise<CaptureResult> {
  const { file, width, height, mimeType, videoBitsPerSecond, cancelRef, onProgress, onNotice } = params;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("aria-hidden", "true");
  video.style.position = "fixed";
  video.style.left = "-10000px";
  video.style.top = "0";
  video.style.width = "2px";
  video.style.height = "2px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });

  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let rafId = 0;
  const chunks: Blob[] = [];

  try {
    if (!ctx) throw new Error("No se pudo crear el lienzo de procesamiento en tu navegador.");
    await waitForMetadata(video);

    const stream = canvas.captureStream(CAPTURE_FPS);
    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          // ignorar
        }
      }
      const source = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      // Sin conexión a ctx.destination: el usuario no escucha la reproducción.
      source.connect(dest);
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    } catch {
      video.muted = true;
      if (audioCtx) {
        audioCtx.close().catch(() => undefined);
        audioCtx = null;
      }
      onNotice("No se pudo capturar el audio del video; el resultado se exportará sin sonido.");
    }

    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });

    const stopped = new Promise<void>((resolve, reject) => {
      recorder?.addEventListener("stop", () => resolve());
      recorder?.addEventListener("error", () => reject(new Error("Ocurrió un error durante la grabación del video.")));
    });
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      try {
        video.pause();
      } catch {
        // ignorar
      }
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };

    video.addEventListener("ended", finish);
    // Si el video falla a mitad de la reproducción, cortamos para no colgar el proceso.
    video.addEventListener("error", finish);

    let lastReported = -1;
    const draw = () => {
      if (finished) return;
      ctx.drawImage(video, 0, 0, width, height);
      if (cancelRef.cancelled) {
        finish();
        return;
      }
      const t = video.currentTime;
      if (t - lastReported >= 0.2 || lastReported < 0) {
        lastReported = t;
        onProgress(t);
      }
      if (Number.isFinite(video.duration) && video.duration > 0 && t >= video.duration - 0.05) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(draw);
    };

    await waitSeeked(video, 0);
    ctx.drawImage(video, 0, 0, width, height);
    recorder.start(250);
    await video.play();
    rafId = requestAnimationFrame(draw);

    await stopped;

    if (cancelRef.cancelled) throw new CancelledError();

    const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
    if (blob.size === 0) throw new Error("No se generaron datos del video. Inténtalo de nuevo.");
    return { blob, size: blob.size };
  } finally {
    cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignorar
      }
    }
    if (audioCtx) audioCtx.close().catch(() => undefined);
    try {
      video.pause();
    } catch {
      // ignorar
    }
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

export default function CompressVideoTool() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionChoice>("720");
  const [qualityIndex, setQualityIndex] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [resultExt, setResultExt] = useState("webm");
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : null;
    setFileUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const targetMime = useMemo(() => {
    // Preferencia: WebM primero, MP4 como alternativa si el navegador lo soporta.
    return pickFirstSupported([...WEBM_CANDIDATES, MP4_MIME]);
  }, []);

  const targetHeight = resolution === "orig" ? null : RESOLUTION_HEIGHTS[resolution];
  const outSize = useMemo(() => {
    if (!meta || meta.width <= 0 || meta.height <= 0) return null;
    return computeOutputSize(meta.width, meta.height, targetHeight);
  }, [meta, targetHeight]);

  const bitrate = BITRATES[qualityIndex] ?? BITRATES[1];
  const total = meta?.duration ?? 0;

  /** Estimación antes de iniciar: (video + audio) × duración / 8. */
  const estimatedBytes = meta && meta.duration > 0 ? ((bitrate + AUDIO_BITS_PER_SECOND) * meta.duration) / 8 : 0;
  const pct = total > 0 && exporting ? Math.min(100, Math.round((currentTime / total) * 100)) : 0;

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
    setCurrentTime(0);

    void probeVideoMeta(next)
      .then((m) => {
        setMeta(m);
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

  const handleCancel = () => {
    cancelRef.current.cancelled = true;
  };

  const handleCompress = async () => {
    if (!file || !meta || !targetMime || exporting) return;
    cancelRef.current = { cancelled: false };
    setExporting(true);
    setResult(null);
    setCurrentTime(0);
    try {
      const capture = await runCapture({
        file,
        width: outSize?.width ?? makeEven(meta.width),
        height: outSize?.height ?? makeEven(meta.height),
        mimeType: targetMime,
        videoBitsPerSecond: bitrate,
        cancelRef: cancelRef.current,
        onProgress: (t) => setCurrentTime(t),
        onNotice: (message) => toast.warning(message),
      });
      setResultExt(extensionForMime(targetMime));
      setResult(capture);
      toast.success("Video comprimido correctamente.");
    } catch (err) {
      if (err instanceof CancelledError) {
        toast.info("Exportación cancelada.");
      } else {
        const message = err instanceof Error ? err.message : "No se pudo comprimir el video.";
        toast.error(message);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setMeta(null);
    setMetaError(null);
    setResult(null);
    setResolution("720");
    setQualityIndex(1);
    setCurrentTime(0);
  };

  const savedPct =
    result && file && file.size > 0 ? Math.round((1 - result.size / file.size) * 100) : 0;
  const outFilename = file ? `${baseName(file.name)}-comprimido.${resultExt}` : "video-comprimido.webm";

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="size-5 text-primary" aria-hidden />
            1. Sube tu video
          </CardTitle>
          <CardDescription>
            Acepta MP4, WebM y MOV de hasta {MAX_SIZE_MB} MB. El archivo se procesa en tu navegador y
            nunca se sube a ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={MAX_SIZE_MB}
            hint="MP4, WebM o MOV"
            disabled={exporting}
          />

          {file && fileUrl && (
            <div className="space-y-3">
              <video
                src={fileUrl}
                controls
                playsInline
                preload="metadata"
                className="max-h-64 w-full rounded-lg border bg-black"
                aria-label="Vista previa del video original"
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
                {targetMime && <Badge variant="outline">{mimeLabel(targetMime)}</Badge>}
                {exporting && (
                  <Badge className="flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    Procesando…
                  </Badge>
                )}
              </div>
              {metaError && !exporting && (
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
            <Gauge className="size-5 text-primary" aria-hidden />
            2. Opciones de compresión
          </CardTitle>
          <CardDescription>
            A menor bitrate, menor peso del archivo (y algo más de pérdida de calidad).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!targetMime && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>Navegador no compatible</AlertTitle>
              <AlertDescription>
                Tu navegador no soporta MediaRecorder, necesario para comprimir videos. Prueba con
                una versión reciente de Chrome, Firefox o Edge.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resolution-select">Resolución</Label>
              <Select
                value={resolution}
                onValueChange={(value) => setResolution(value as ResolutionChoice)}
                disabled={exporting}
              >
                <SelectTrigger id="resolution-select" className="w-full" aria-label="Resolución de salida">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orig">Original</SelectItem>
                  <SelectItem value="720">720p</SelectItem>
                  <SelectItem value="480">480p</SelectItem>
                  <SelectItem value="360">360p</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {outSize
                  ? `Salida: ${outSize.width}×${outSize.height} px (nunca agranda).`
                  : "Sube un video para ver la resolución de salida."}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="quality-slider">Calidad</Label>
                <span className="text-sm font-medium">{BITRATE_LABELS[qualityIndex] ?? BITRATE_LABELS[1]}</span>
              </div>
              <Slider
                id="quality-slider"
                min={0}
                max={BITRATES.length - 1}
                step={1}
                value={[qualityIndex]}
                onValueChange={(values) => setQualityIndex(values[0] ?? 1)}
                disabled={exporting}
                aria-label="Nivel de calidad del video comprimido"
              />
              <p className="text-xs text-muted-foreground">
                Calidad alta, media o baja corresponden a 2, 1 y 0,5 Mbps de video.
              </p>
            </div>
          </div>

          {meta && meta.duration > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">Tamaño estimado del resultado:</span>
              <span className="font-medium tabular-nums">≈ {formatBytes(estimatedBytes)}</span>
              <span className="text-xs text-muted-foreground">
                (bitrate × duración; el tamaño real puede variar)
              </span>
            </div>
          )}

          {exporting ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  Comprimiendo… {pct}%
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatTime(currentTime)} / {formatTime(total)}
                </span>
              </div>
              <Progress value={pct} aria-label="Progreso de la compresión" />
              <p className="text-xs text-muted-foreground">
                El procesamiento ocurre en tu navegador en tiempo real: tarda aproximadamente lo que
                dura el video. No cierres esta pestaña.
              </p>
              <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
                <X className="size-4" aria-hidden />
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleCompress}
              disabled={!file || !meta || metaError !== null || !targetMime}
              className="w-full sm:w-auto"
            >
              <Gauge className="size-4" aria-hidden />
              Comprimir video
            </Button>
          )}
        </CardContent>
      </Card>

      {result && file && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Compresión completada
            </CardTitle>
            <CardDescription>Tamaño real obtenido frente al original.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <span className="font-medium">{formatBytes(file.size)}</span>
              <span aria-hidden className="text-muted-foreground">
                &rarr;
              </span>
              <span className="font-medium">{formatBytes(result.size)}</span>
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
              <DownloadButton blob={result.blob} filename={outFilename} label="Descargar video comprimido" size="lg" />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <X className="size-4" aria-hidden />
                Comprimir otro video
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
