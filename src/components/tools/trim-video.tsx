"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileVideo, Loader2, Scissors, SkipBack, SkipForward, Timer, X } from "lucide-react";

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
import { formatBytes } from "@/lib/utils";

const ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_EXT = /\.(mp4|webm|mov)$/i;
const MAX_SIZE_MB = 200;
const CAPTURE_FPS = 30;

const MP4_MIME = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
const MIME_CANDIDATES = [MP4_MIME, "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

interface TrimResult {
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

interface TrimCaptureParams {
  file: File;
  startTime: number;
  endTime: number;
  mimeType: string;
  cancelRef: { cancelled: boolean };
  onProgress: (currentTime: number) => void;
  onNotice: (message: string) => void;
}

/**
 * Graba el fragmento [startTime, endTime] en tiempo real: reproduce el video
 * oculto desde el inicio elegido, dibuja los fotogramas en un canvas y detiene
 * MediaRecorder al alcanzar el tiempo final.
 */
async function runTrimCapture(params: TrimCaptureParams): Promise<TrimResult> {
  const { file, startTime, endTime, mimeType, cancelRef, onProgress, onNotice } = params;

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
  const ctx = canvas.getContext("2d", { alpha: false });

  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let rafId = 0;
  const chunks: Blob[] = [];

  try {
    await waitForMetadata(video);
    canvas.width = Math.max(2, video.videoWidth);
    canvas.height = Math.max(2, video.videoHeight);
    if (!ctx) throw new Error("No se pudo crear el lienzo de procesamiento en tu navegador.");

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
      audioBitsPerSecond: 128000,
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

    let lastReported = -1;
    const draw = () => {
      if (finished) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (cancelRef.cancelled) {
        finish();
        return;
      }
      const t = video.currentTime;
      if (t - lastReported >= 0.2 || lastReported < 0) {
        lastReported = t;
        onProgress(t);
      }
      if (t >= endTime - 0.03) {
        finish();
        return;
      }
      rafId = requestAnimationFrame(draw);
    };

    await waitSeeked(video, startTime);
    video.addEventListener("ended", finish);
    // Si el video falla a mitad de la reproducción, cortamos para no colgar el proceso.
    video.addEventListener("error", finish);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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

export default function TrimVideoTool() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [result, setResult] = useState<TrimResult | null>(null);
  const [resultExt, setResultExt] = useState("webm");
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const cancelRef = useRef({ cancelled: false });

  useEffect(() => {
    const url = file ? URL.createObjectURL(file) : null;
    setFileUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const targetMime = useMemo(() => pickFirstSupported(MIME_CANDIDATES), []);

  const duration = meta?.duration ?? 0;
  const selectionValid =
    meta !== null &&
    duration > 0 &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    start < end &&
    end - start >= 0.5 &&
    end <= duration + 0.05;
  const selectionLength = selectionValid ? end - start : 0;

  const fragmentPct =
    exporting && selectionValid
      ? Math.min(100, Math.max(0, Math.round(((currentTime - start) / Math.max(0.001, end - start)) * 100)))
      : 0;

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
    setCurrentTime(0);

    void probeVideoMeta(next)
      .then((m) => {
        setMeta(m);
        setStart(0);
        setEnd(m.duration > 0 ? m.duration : 0);
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
    const max = duration > 0 ? Math.max(0, end - 0.5) : Math.max(0, next);
    setStart(Math.min(Math.max(0, next), max));
  };

  const clampEnd = (value: number) => {
    const next = Number.isFinite(value) ? value : 0;
    const min = start + 0.5;
    const max = duration > 0 ? duration : Math.max(min, next);
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

  const handleTrim = async () => {
    if (!file || !meta || !selectionValid || !targetMime || exporting) return;
    cancelRef.current = { cancelled: false };
    setExporting(true);
    setResult(null);
    setCurrentTime(start);
    try {
      const capture = await runTrimCapture({
        file,
        startTime: start,
        endTime: end,
        mimeType: targetMime,
        cancelRef: cancelRef.current,
        onProgress: (t) => setCurrentTime(t),
        onNotice: (message) => toast.warning(message),
      });
      setResultExt(extensionForMime(targetMime));
      setResult(capture);
      toast.success("Video recortado correctamente.");
    } catch (err) {
      if (err instanceof CancelledError) {
        toast.info("Exportación cancelada.");
      } else {
        const message = err instanceof Error ? err.message : "No se pudo recortar el video.";
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
    setStart(0);
    setEnd(0);
    setCurrentTime(0);
  };

  const outFilename = file ? `${baseName(file.name)}-recortado.${resultExt}` : "video-recortado.webm";

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="size-5 text-primary" aria-hidden />
            1. Sube tu video
          </CardTitle>
          <CardDescription>
            Acepta MP4, WebM y MOV de hasta {MAX_SIZE_MB} MB. El recorte ocurre en tu navegador en
            tiempo real: el archivo nunca se sube a ningún servidor.
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
                ref={previewRef}
                src={fileUrl}
                controls
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
            <Scissors className="size-5 text-primary" aria-hidden />
            2. Elige el fragmento
          </CardTitle>
          <CardDescription>
            Marca el inicio y el fin del recorte. Puedes usar los tiempos del reproductor de arriba.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="start-input">Inicio (segundos)</Label>
              <Input
                id="start-input"
                type="number"
                min={0}
                max={Math.max(0, end - 0.5)}
                step={0.1}
                value={Number.isFinite(start) ? start : 0}
                onChange={(e) => clampStart(Number(e.target.value))}
                disabled={exporting || !meta}
                inputMode="decimal"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={markStart} disabled={exporting || !file} className="gap-1.5">
                  <Timer className="size-3.5" aria-hidden />
                  Usar tiempo actual
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={goToStart} disabled={exporting || !file} className="gap-1.5">
                  <SkipBack className="size-3.5" aria-hidden />
                  Ir al inicio
                </Button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <Label htmlFor="end-input">Fin (segundos)</Label>
              <Input
                id="end-input"
                type="number"
                min={start + 0.5}
                max={duration > 0 ? duration : undefined}
                step={0.1}
                value={Number.isFinite(end) ? end : 0}
                onChange={(e) => clampEnd(Number(e.target.value))}
                disabled={exporting || !meta}
                inputMode="decimal"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={markEnd} disabled={exporting || !file} className="gap-1.5">
                  <Timer className="size-3.5" aria-hidden />
                  Usar tiempo actual
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={goToEnd} disabled={exporting || !file} className="gap-1.5">
                  <SkipForward className="size-3.5" aria-hidden />
                  Ir al fin
                </Button>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {selectionValid
              ? `Fragmento seleccionado: ${formatTime(start)} → ${formatTime(end)} (${selectionLength.toFixed(1)} s).`
              : "El fin debe ser al menos 0,5 s posterior al inicio y no superar la duración del video."}
          </p>

          {exporting ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  Recortando… {fragmentPct}%
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatTime(Math.max(0, currentTime - start))} / {formatTime(selectionLength)}
                </span>
              </div>
              <Progress value={fragmentPct} aria-label="Progreso del recorte" />
              <p className="text-xs text-muted-foreground">
                El procesamiento ocurre en tu navegador en tiempo real: tarda aproximadamente lo que
                dura el fragmento. No cierres esta pestaña.
              </p>
              <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
                <X className="size-4" aria-hidden />
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleTrim}
              disabled={!file || !selectionValid || !targetMime}
              className="w-full sm:w-auto"
            >
              <Scissors className="size-4" aria-hidden />
              Cortar video
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Recorte completado
            </CardTitle>
            <CardDescription>
              Fragmento de {formatTime(start)} a {formatTime(end)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{formatBytes(result.size)}</Badge>
              {targetMime && <Badge variant="outline">{extensionForMime(targetMime).toUpperCase()}</Badge>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton blob={result.blob} filename={outFilename} label="Descargar video recortado" size="lg" />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <X className="size-4" aria-hidden />
                Recortar otro video
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
