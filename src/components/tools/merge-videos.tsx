"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Film, Layers, Loader2, X } from "lucide-react";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov";
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_EXT = /\.(mp4|webm|mov)$/i;
const MAX_SIZE_MB = 200;
const MAX_FILES = 6;
const CAPTURE_FPS = 30;

const MP4_MIME = "video/mp4;codecs=avc1.42E01E,mp4a.40.2";
const WEBM_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

interface ItemMeta {
  duration: number;
  width: number;
  height: number;
}

interface MergeItem {
  file: File;
  meta: ItemMeta | null;
}

interface MergeResult {
  blob: Blob;
  size: number;
  ext: string;
}

class CancelledError extends Error {
  constructor() {
    super("Proceso cancelado por el usuario.");
  }
}

function recorderSupported(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder === "function";
}

function isTypeSupported(type: string): boolean {
  if (!recorderSupported()) return false;
  try {
    return MediaRecorder.isTypeSupported(type);
  } catch {
    return false;
  }
}

function pickFirstSupported(candidates: string[]): string | null {
  if (!recorderSupported()) return null;
  for (const type of candidates) {
    if (isTypeSupported(type)) return type;
  }
  return null;
}

function extensionForMime(mime: string): string {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

function isMp4File(file: File): boolean {
  return file.type === "video/mp4" || /\.mp4$/i.test(file.name);
}

function isAllowedVideo(file: File): boolean {
  if (file.type) return ALLOWED_TYPES.has(file.type);
  return ALLOWED_EXT.test(file.name);
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
      reject(new Error("No se pudo leer uno de los videos."));
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

async function probeVideoMeta(file: File): Promise<ItemMeta> {
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

interface MergeParams {
  items: { file: File; duration: number }[];
  mimeType: string;
  cancelRef: { cancelled: boolean };
  onProgress: (elapsed: number, segmentIndex: number) => void;
  onNotice: (message: string) => void;
}

/**
 * Une varios videos en tiempo real: reproduce los elementos ocultos de forma
 * secuencial, dibuja cada fotograma (con bandas negras si el tamaño difiere) y
 * graba canvas + audio compartido con MediaRecorder.
 */
async function runMerge(params: MergeParams): Promise<MergeResult> {
  const { items, mimeType, cancelRef, onProgress, onNotice } = params;

  const urls = items.map((it) => URL.createObjectURL(it.file));
  const videos = urls.map((url) => {
    const v = document.createElement("video");
    v.src = url;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("aria-hidden", "true");
    v.style.position = "fixed";
    v.style.left = "-10000px";
    v.style.top = "0";
    v.style.width = "2px";
    v.style.height = "2px";
    v.style.opacity = "0";
    v.style.pointerEvents = "none";
    document.body.appendChild(v);
    return v;
  });

  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let stream: MediaStream | null = null;
  let rafId = 0;
  let finished = false;
  const chunks: Blob[] = [];
  const durations = items.map((it) => it.duration);

  // Resolución del segmento actual (permite cancelar o saltar por seguridad).
  let segmentRelease: (() => void) | null = null;
  const activeRef = { current: 0 };
  const completedRef = { current: 0 };

  const cleanupAll = () => {
    cancelAnimationFrame(rafId);
    videos.forEach((v, i) => {
      try {
        v.pause();
      } catch {
        // ignorar
      }
      v.removeAttribute("src");
      v.load();
      v.remove();
      URL.revokeObjectURL(urls[i]);
    });
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close().catch(() => undefined);
  };

  try {
    // Cargar metadatos de todos los elementos.
    for (const v of videos) await waitForMetadata(v);

    const first = videos[0];
    const W = Math.max(2, first.videoWidth);
    const H = Math.max(2, first.videoHeight);

    canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No se pudo crear el lienzo de procesamiento en tu navegador.");
    const c2d: CanvasRenderingContext2D = ctx;

    const drawContain = (v: HTMLVideoElement) => {
      c2d.fillStyle = "#000000";
      c2d.fillRect(0, 0, W, H);
      const vw = v.videoWidth || W;
      const vh = v.videoHeight || H;
      const scale = Math.min(W / vw, H / vh);
      const w = vw * scale;
      const h = vh * scale;
      c2d.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
    };

    // Un solo AudioContext compartido; una fuente por elemento (elementos distintos).
    stream = canvas.captureStream(CAPTURE_FPS);
    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          // ignorar
        }
      }
      const dest = audioCtx.createMediaStreamDestination();
      for (const v of videos) {
        const source = audioCtx.createMediaElementSource(v);
        // Sin conexión a ctx.destination: la reproducción no se escucha.
        source.connect(dest);
      }
      for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
    } catch {
      videos.forEach((v) => {
        v.muted = true;
      });
      if (audioCtx) {
        audioCtx.close().catch(() => undefined);
        audioCtx = null;
      }
      onNotice("No se pudo capturar el audio; el resultado se exportará sin sonido.");
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

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      const current = videos[activeRef.current];
      if (current) {
        try {
          current.pause();
        } catch {
          // ignorar
        }
      }
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };

    // Espera el fin del segmento: 'ended', un corte por seguridad o la cancelación.
    const waitForSegment = (v: HTMLVideoElement, index: number) =>
      new Promise<void>((resolve, reject) => {
        const release = () => {
          v.removeEventListener("ended", onEnded);
          v.removeEventListener("error", onError);
          segmentRelease = null;
        };
        const onEnded = () => {
          release();
          resolve();
        };
        const onError = () => {
          release();
          reject(new Error(`Error al reproducir "${items[index].file.name}".`));
        };
        segmentRelease = () => {
          release();
          resolve();
        };
        v.addEventListener("ended", onEnded);
        v.addEventListener("error", onError);
      });

    let lastReported = -1;
    const draw = () => {
      if (finished) return;
      const idx = activeRef.current;
      const v = videos[idx];
      if (v && v.readyState >= 2) drawContain(v);

      if (cancelRef.cancelled) {
        finish();
        segmentRelease?.();
        return;
      }
      if (v) {
        // Corte de seguridad si 'ended' no llega (video sin fin declarado).
        const expected = durations[idx];
        if (expected > 0 && v.currentTime >= expected - 0.05) {
          segmentRelease?.();
        }
        const elapsed = completedRef.current + v.currentTime;
        if (elapsed - lastReported >= 0.2 || lastReported < 0) {
          lastReported = elapsed;
          onProgress(elapsed, idx);
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    // Primer fotograma antes de grabar para evitar un arranque en negro.
    await waitSeeked(first, 0);
    drawContain(first);
    recorder.start(250);
    rafId = requestAnimationFrame(draw);

    for (let i = 0; i < videos.length; i++) {
      if (cancelRef.cancelled) break;
      activeRef.current = i;
      const v = videos[i];
      await waitSeeked(v, 0);
      try {
        await v.play();
      } catch {
        throw new Error(`No se pudo reproducir "${items[i].file.name}".`);
      }
      await waitForSegment(v, i);
      if (cancelRef.cancelled) break;
      completedRef.current += durations[i] > 0 ? durations[i] : v.currentTime;
    }

    finish();
    await stopped;

    if (cancelRef.cancelled) throw new CancelledError();

    const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
    if (blob.size === 0) throw new Error("No se generaron datos del video unido. Inténtalo de nuevo.");
    return { blob, size: blob.size, ext: extensionForMime(mimeType) };
  } finally {
    finished = true;
    cancelAnimationFrame(rafId);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignorar
      }
    }
    segmentRelease = null;
    cleanupAll();
  }
}

export default function MergeVideosTool() {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [exporting, setExporting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [result, setResult] = useState<MergeResult | null>(null);
  const cancelRef = useRef({ cancelled: false });
  const probeToken = useRef(0);

  // Cancela el trabajo en curso si el componente se desmonta.
  useEffect(() => {
    return () => {
      cancelRef.current.cancelled = true;
    };
  }, []);

  const allMetasReady = items.length >= 2 && items.every((it) => it.meta && it.meta.duration > 0);
  const firstMeta = items[0]?.meta ?? null;
  const dimsDiffer =
    allMetasReady && items.some((it) => it.meta && (it.meta.width !== firstMeta?.width || it.meta.height !== firstMeta?.height));
  const totalDuration = allMetasReady ? items.reduce((acc, it) => acc + (it.meta?.duration ?? 0), 0) : 0;

  const mergeMime = useMemo(() => {
    if (!recorderSupported()) return null;
    const allMp4 = items.length > 0 && items.every((it) => isMp4File(it.file));
    if (allMp4 && isTypeSupported(MP4_MIME)) return MP4_MIME;
    return pickFirstSupported(WEBM_CANDIDATES);
  }, [items]);

  const pct =
    totalDuration > 0 && exporting ? Math.min(100, Math.round((elapsed / totalDuration) * 100)) : 0;

  const handleFilesChange = (files: File[]) => {
    const token = probeToken.current + 1;
    probeToken.current = token;

    if (files.length === 0) {
      setItems([]);
      return;
    }

    const nextItems: MergeItem[] = files.map((f) => {
      const existing = items.find((it) => it.file === f);
      return { file: f, meta: existing?.meta ?? null };
    });
    setItems(nextItems);
    setResult(null);

    files.forEach((f, idx) => {
      if (nextItems[idx].meta) return;
      void probeVideoMeta(f)
        .then((meta) => {
          if (probeToken.current !== token) return;
          setItems((prev) => prev.map((it) => (it.file === f ? { ...it, meta } : it)));
        })
        .catch(() => {
          if (probeToken.current !== token) return;
          toast.error(`No se pudo leer "${f.name}". Se quitó de la lista.`);
          setItems((prev) => prev.filter((it) => it.file !== f));
        });
    });
  };

  const handleCancel = () => {
    cancelRef.current.cancelled = true;
  };

  const handleMerge = async () => {
    if (!allMetasReady || !mergeMime || exporting) return;
    cancelRef.current = { cancelled: false };
    setExporting(true);
    setResult(null);
    setElapsed(0);
    setSegmentIndex(0);
    try {
      const merged = await runMerge({
        items: items.map((it) => ({ file: it.file, duration: it.meta?.duration ?? 0 })),
        mimeType: mergeMime,
        cancelRef: cancelRef.current,
        onProgress: (e, idx) => {
          setElapsed(e);
          setSegmentIndex(idx);
        },
        onNotice: (message) => toast.warning(message),
      });
      setResult(merged);
      toast.success("Videos unidos correctamente.");
    } catch (err) {
      if (err instanceof CancelledError) {
        toast.info("Unión cancelada.");
      } else {
        const message = err instanceof Error ? err.message : "No se pudieron unir los videos.";
        toast.error(message);
      }
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    setItems([]);
    setResult(null);
    setElapsed(0);
    setSegmentIndex(0);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="size-5 text-primary" aria-hidden />
            1. Sube tus videos (2 a {MAX_FILES})
          </CardTitle>
          <CardDescription>
            Se unirán en el orden de la lista (puedes reordenarlos). MP4, WebM o MOV de hasta{" "}
            {MAX_SIZE_MB} MB por archivo. El proceso ocurre en tu navegador y nunca se sube nada a
            ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={items.map((it) => it.file)}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            multiple
            maxFiles={MAX_FILES}
            maxSizeMB={MAX_SIZE_MB}
            reorderable
            hint="Selecciona de 2 a 6 videos"
            disabled={exporting}
          />

          {items.some((it) => it.meta) && (
            <ul className="space-y-1 text-sm text-muted-foreground" aria-label="Detalles de los videos">
              {items.map((it, index) => (
                <li key={`${it.file.name}-${index}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {index + 1}. {it.file.name}
                  </span>
                  {it.meta ? (
                    <>
                      <Badge variant="secondary">{formatTime(it.meta.duration)}</Badge>
                      <Badge variant="secondary">
                        {it.meta.width}×{it.meta.height} px
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline">Analizando…</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          {dimsDiffer && (
            <Alert>
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>Dimensiones distintas</AlertTitle>
              <AlertDescription>
                Los videos no tienen el mismo tamaño. Todos se ajustarán a las dimensiones del
                primero ({firstMeta?.width}×{firstMeta?.height} px), con bandas negras si el aspecto
                no coincide.
              </AlertDescription>
            </Alert>
          )}

          {!mergeMime && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>Navegador no compatible</AlertTitle>
              <AlertDescription>
                Tu navegador no soporta MediaRecorder, necesario para unir videos. Prueba con una
                versión reciente de Chrome, Firefox o Edge.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-5 text-primary" aria-hidden />
            2. Une los videos
          </CardTitle>
          <CardDescription>
            {allMetasReady
              ? `Duración total: ${formatTime(totalDuration)}. El proceso tarda aproximadamente lo mismo, porque ocurre en tiempo real en tu navegador.`
              : "Espera a que se analicen todos los videos para continuar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {exporting ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  Uniendo… {pct}%
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatTime(elapsed)} / {formatTime(totalDuration)}
                </span>
              </div>
              <Progress value={pct} aria-label="Progreso de la unión" />
              <p className="text-xs text-muted-foreground">
                Video {Math.min(segmentIndex + 1, items.length)} de {items.length}. No cierres esta
                pestaña mientras se une.
              </p>
              <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
                <X className="size-4" aria-hidden />
                Cancelar
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={handleMerge} disabled={!allMetasReady || !mergeMime} className="w-full sm:w-auto">
              <Layers className="size-4" aria-hidden />
              Unir videos
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Unión completada
            </CardTitle>
            <CardDescription>
              Un solo archivo con los {items.length} videos en orden, duración total{" "}
              {formatTime(totalDuration)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{formatBytes(result.size)}</Badge>
              <Badge variant="outline">{result.ext.toUpperCase()}</Badge>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result.blob}
                filename={`videos-unidos.${result.ext}`}
                label="Descargar video unido"
                size="lg"
              />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <X className="size-4" aria-hidden />
                Unir otros videos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
