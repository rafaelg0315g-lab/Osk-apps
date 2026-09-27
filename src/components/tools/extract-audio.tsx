"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  FileVideo,
  Info,
  Loader2,
  Music,
  X,
} from "lucide-react";

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

const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

interface VideoMeta {
  duration: number;
}

interface AudioInfo {
  duration: number;
  channels: number;
  sampleRate: number;
}

interface ExtractResult {
  blob: Blob;
  filename: string;
  kind: "wav" | "webm";
  info: AudioInfo | null;
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
  return clean.length > 0 ? clean : "audio";
}

function createAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Tu navegador no soporta Web Audio.");
  return new Ctor();
}

function pickAudioMime(): string | null {
  if (typeof window === "undefined" || typeof window.MediaRecorder !== "function") return null;
  for (const type of AUDIO_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // continuar con el siguiente candidato
    }
  }
  return null;
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

function formatSampleRate(rate: number): string {
  return `${(rate / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} kHz`;
}

function channelsLabel(n: number): string {
  if (n === 1) return "Mono";
  if (n === 2) return "Estéreo";
  return `${n} canales`;
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

async function probeVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitForMetadata(video);
    return await resolveDuration(video);
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

/** Codifica un AudioBuffer a WAV PCM de 16 bits (hasta 2 canales entrelazados). */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits por muestra
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i];
      if (sample > 1) sample = 1;
      else if (sample < -1) sample = -1;
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

interface RecordParams {
  file: File;
  duration: number;
  cancelRef: { cancelled: boolean };
  onProgress: (currentTime: number) => void;
}

/** Plan B: graba el audio del video en reproducción (MediaRecorder solo audio). */
async function recordAudioTrack(params: RecordParams): Promise<ExtractResult> {
  const { file, duration, cancelRef, onProgress } = params;
  const mimeType = pickAudioMime();
  if (!mimeType) throw new Error("Tu navegador no permite grabar audio (MediaRecorder no disponible).");

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

  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let rafId = 0;
  const chunks: Blob[] = [];

  try {
    await waitForMetadata(video);
    audioCtx = createAudioContext();
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

    const stream = new MediaStream();
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);

    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 160000 });

    const stopped = new Promise<void>((resolve, reject) => {
      recorder?.addEventListener("stop", () => resolve());
      recorder?.addEventListener("error", () => reject(new Error("Ocurrió un error durante la grabación del audio.")));
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
    const tick = () => {
      if (finished) return;
      if (cancelRef.cancelled) {
        finish();
        return;
      }
      const t = video.currentTime;
      if (t - lastReported >= 0.2 || lastReported < 0) {
        lastReported = t;
        onProgress(t);
      }
      rafId = requestAnimationFrame(tick);
    };

    recorder.start(250);
    await video.play();
    rafId = requestAnimationFrame(tick);

    await stopped;

    if (cancelRef.cancelled) throw new CancelledError();

    const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
    if (blob.size === 0) throw new Error("No se generaron datos de audio. Inténtalo de nuevo.");
    return {
      blob,
      filename: `${baseName(file.name)}.webm`,
      kind: "webm",
      info: { duration: duration > 0 ? duration : video.duration, channels: 1, sampleRate: 48000 },
    };
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

export default function ExtractAudioTool() {
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "decoding" | "recording">("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const cancelRef = useRef({ cancelled: false });

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (!next) {
      setFile(null);
      setDuration(0);
      setMetaError(null);
      setResult(null);
      setDecodeFailed(false);
      return;
    }
    if (!isAllowedVideo(next)) {
      toast.error("Formato no compatible. Sube un video MP4, WebM o MOV.");
      return;
    }
    setFile(next);
    setDuration(0);
    setMetaError(null);
    setResult(null);
    setDecodeFailed(false);

    void probeVideoDuration(next)
      .then((d) => setDuration(d))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "No se pudo leer el video.";
        setMetaError(message);
        toast.error(message);
      });
  };

  const handleCancel = () => {
    cancelRef.current.cancelled = true;
  };

  const handleExtract = async () => {
    if (!file || busy) return;
    cancelRef.current = { cancelled: false };
    setBusy(true);
    setResult(null);
    setCurrentTime(0);
    setPhase("decoding");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = createAudioContext();
      try {
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        const blob = audioBufferToWav(buffer);
        setResult({
          blob,
          filename: `${baseName(file.name)}.wav`,
          kind: "wav",
          info: {
            duration: buffer.duration,
            channels: buffer.numberOfChannels,
            sampleRate: buffer.sampleRate,
          },
        });
        toast.success("Audio extraído correctamente.");
        return;
      } finally {
        ctx.close().catch(() => undefined);
      }
    } catch {
      // decodeAudioData falló (códec no soportado): ofrecemos el plan B.
      setDecodeFailed(true);
      toast.warning(
        "El audio no se pudo decodificar directamente. Puedes grabarlo en tiempo real (el resultado será WebM).",
      );
    } finally {
      setPhase("idle");
      setBusy(false);
    }
  };

  const handleRecordFallback = async () => {
    if (!file || busy) return;
    cancelRef.current = { cancelled: false };
    setBusy(true);
    setResult(null);
    setCurrentTime(0);
    setPhase("recording");
    try {
      const extracted = await recordAudioTrack({
        file,
        duration,
        cancelRef: cancelRef.current,
        onProgress: (t) => setCurrentTime(t),
      });
      setResult(extracted);
      toast.success("Audio grabado correctamente.");
    } catch (err) {
      if (err instanceof CancelledError) {
        toast.info("Grabación cancelada.");
      } else {
        const message = err instanceof Error ? err.message : "No se pudo grabar el audio.";
        toast.error(message);
      }
    } finally {
      setPhase("idle");
      setBusy(false);
    }
  };

  const total = duration > 0 ? duration : 0;
  const pct = total > 0 && phase === "recording" ? Math.min(100, Math.round((currentTime / total) * 100)) : 0;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="size-5 text-primary" aria-hidden />
            1. Sube tu video
          </CardTitle>
          <CardDescription>
            Acepta MP4, WebM y MOV de hasta {MAX_SIZE_MB} MB. El audio se extrae en tu navegador: el
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
            disabled={busy}
          />
          {file && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{formatBytes(file.size)}</Badge>
              {duration > 0 && <Badge variant="secondary">Duración: {formatTime(duration)}</Badge>}
              {busy && (
                <Badge className="flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  {phase === "decoding" ? "Decodificando…" : "Grabando…"}
                </Badge>
              )}
            </div>
          )}
          {metaError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>No se pudo analizar el video</AlertTitle>
              <AlertDescription>{metaError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="size-5 text-primary" aria-hidden />
            2. Extrae el audio
          </CardTitle>
          <CardDescription>
            El audio se convierte a WAV (PCM 16 bits) sin pérdida, conservando la frecuencia de
            muestreo original.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {decodeFailed && !result && (
            <Alert>
              <Info className="size-4" aria-hidden />
              <AlertTitle>Decodificación directa no disponible</AlertTitle>
              <AlertDescription>
                Tu navegador no pudo decodificar el audio de este video. Como alternativa, se puede
                grabar la pista de audio en tiempo real mientras el video se reproduce en segundo
                plano; el resultado será un archivo WebM (Opus) en lugar de WAV.
              </AlertDescription>
            </Alert>
          )}

          {phase === "recording" && (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  Grabando audio… {pct}%
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatTime(currentTime)} / {formatTime(total)}
                </span>
              </div>
              <Progress value={pct} aria-label="Progreso de la grabación de audio" />
              <p className="text-xs text-muted-foreground">
                La grabación ocurre en tiempo real en tu navegador. No cierres esta pestaña.
              </p>
              <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
                <X className="size-4" aria-hidden />
                Cancelar
              </Button>
            </div>
          )}

          {phase !== "recording" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {decodeFailed ? (
                <Button
                  type="button"
                  onClick={handleRecordFallback}
                  disabled={!file || metaError !== null || busy}
                  className="w-full sm:w-auto"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Music className="size-4" aria-hidden />}
                  Grabar audio en tiempo real
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleExtract}
                  disabled={!file || metaError !== null || busy}
                  className="w-full sm:w-auto"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Music className="size-4" aria-hidden />}
                  Extraer audio
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Audio listo
            </CardTitle>
            <CardDescription>
              {result.kind === "wav"
                ? "Pista de audio en formato WAV sin pérdida."
                : "Pista de audio en formato WebM (Opus) grabada en tiempo real."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{formatBytes(result.blob.size)}</Badge>
              {result.info && (
                <>
                  <Badge variant="secondary">Duración: {formatTime(result.info.duration)}</Badge>
                  <Badge variant="secondary">{channelsLabel(result.info.channels)}</Badge>
                  <Badge variant="secondary">{formatSampleRate(result.info.sampleRate)}</Badge>
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton blob={result.blob} filename={result.filename} label="Descargar audio" size="lg" />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setDecodeFailed(false);
                }}
                className="gap-2"
              >
                <X className="size-4" aria-hidden />
                Extraer otro audio
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <FileAudio className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Para videos con audio AAC (la mayoría de los MP4), la extracción es directa y conservar la
        calidad original. En navegadores sin soporte de decodificación se usa la grabación en tiempo
        real como alternativa.
      </p>
    </ToolShell>
  );
}
