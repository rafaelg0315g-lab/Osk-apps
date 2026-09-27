"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  FileType2,
  Loader2,
  Music,
  Volume2,
  X,
} from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes } from "@/lib/utils";

const ACCEPT =
  "audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/flac,audio/x-flac,.mp3,.wav,.ogg,.m4a,.flac";
const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "audio/x-flac",
]);
const ALLOWED_EXT = /\.(mp3|wav|ogg|m4a|flac|aac)$/i;
const MAX_SIZE_MB = 100;

const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

type TargetTab = "wav" | "opus";
type RateChoice = "orig" | "44100" | "48000";

interface ConvertResult {
  blob: Blob;
  filename: string;
  kind: "wav" | "webm";
}

class CancelledError extends Error {
  constructor() {
    super("Proceso cancelado por el usuario.");
  }
}

function isAllowedAudio(file: File): boolean {
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

function createOfflineAudioContext(channels: number, length: number, sampleRate: number): OfflineAudioContext {
  const Ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error("Tu navegador no soporta el renderizado de audio offline.");
  return new Ctor(channels, length, sampleRate);
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

/** Re-muestrea un AudioBuffer a otra frecuencia con OfflineAudioContext. */
async function resampleBuffer(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const frames = Math.max(1, Math.ceil(buffer.duration * targetRate));
  const offline = createOfflineAudioContext(channels, frames, targetRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

export default function ConvertAudioTool() {
  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [tab, setTab] = useState<TargetTab>("wav");
  const [rate, setRate] = useState<RateChoice>("orig");
  const [wavBusy, setWavBusy] = useState(false);
  const [converting, setConverting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const decodeToken = useRef(0);
  const cancelRef = useRef({ cancelled: false });

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (!next) {
      setFile(null);
      setBuffer(null);
      setDecodeError(null);
      setResult(null);
      return;
    }
    if (!isAllowedAudio(next)) {
      toast.error("Formato no compatible. Sube un audio MP3, WAV, OGG, M4A o FLAC.");
      return;
    }
    const token = decodeToken.current + 1;
    decodeToken.current = token;

    setFile(next);
    setBuffer(null);
    setDecodeError(null);
    setResult(null);

    void (async () => {
      setDecoding(true);
      try {
        const arrayBuffer = await next.arrayBuffer();
        if (decodeToken.current !== token) return;
        const ctx = createAudioContext();
        try {
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          if (decodeToken.current !== token) return;
          setBuffer(decoded);
        } finally {
          ctx.close().catch(() => undefined);
        }
      } catch {
        if (decodeToken.current !== token) return;
        const message = "No se pudo decodificar el audio. Tu navegador puede no soportar este formato.";
        setDecodeError(message);
        toast.error(message);
      } finally {
        if (decodeToken.current === token) setDecoding(false);
      }
    })();
  };

  const handleConvertWav = async () => {
    if (!buffer || !file || wavBusy) return;
    setWavBusy(true);
    setResult(null);
    try {
      const targetRate = rate === "orig" ? null : Number(rate);
      let out = buffer;
      if (targetRate && Math.abs(targetRate - buffer.sampleRate) > 1) {
        out = await resampleBuffer(buffer, targetRate);
      }
      const blob = audioBufferToWav(out);
      setResult({ blob, filename: `${baseName(file.name)}.wav`, kind: "wav" });
      toast.success("Conversión a WAV completada.");
    } catch {
      const message =
        "No se pudo generar el WAV. Puede faltar memoria para archivos muy largos; prueba con otro archivo.";
      toast.error(message);
    } finally {
      setWavBusy(false);
    }
  };

  const handleCancel = () => {
    cancelRef.current.cancelled = true;
  };

  const handleConvertOpus = async () => {
    if (!buffer || !file || converting) return;
    const mimeType = pickAudioMime();
    if (!mimeType) {
      toast.error("Tu navegador no permite grabar audio WebM/Opus.");
      return;
    }
    cancelRef.current = { cancelled: false };
    setConverting(true);
    setResult(null);
    setElapsed(0);

    let audioCtx: AudioContext | null = null;
    let recorder: MediaRecorder | null = null;
    let source: AudioBufferSourceNode | null = null;
    let rafId = 0;
    const chunks: Blob[] = [];

    try {
      audioCtx = createAudioContext();
      if (audioCtx.state === "suspended") {
        try {
          await audioCtx.resume();
        } catch {
          // ignorar
        }
      }
      const dest = audioCtx.createMediaStreamDestination();
      source = audioCtx.createBufferSource();
      source.buffer = buffer;
      // Solo hacia el destino del stream: la conversión no se escucha.
      source.connect(dest);

      recorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 160000 });
      const stopped = new Promise<void>((resolve, reject) => {
        recorder?.addEventListener("stop", () => resolve());
        recorder?.addEventListener("error", () => reject(new Error("Ocurrió un error durante la conversión.")));
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
          source?.stop();
        } catch {
          // ignorar
        }
        if (recorder && recorder.state !== "inactive") recorder.stop();
      };

      source.onended = () => finish();

      const startTime = audioCtx.currentTime;
      const totalDuration = buffer.duration;
      const tick = () => {
        if (finished) return;
        if (cancelRef.current.cancelled) {
          finish();
          return;
        }
        const t = audioCtx ? audioCtx.currentTime - startTime : 0;
        setElapsed(Math.min(t, totalDuration));
        if (t >= totalDuration) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      source.start();
      recorder.start(250);
      rafId = requestAnimationFrame(tick);

      await stopped;

      if (cancelRef.current.cancelled) throw new CancelledError();

      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      if (blob.size === 0) throw new Error("No se generaron datos de audio. Inténtalo de nuevo.");
      setResult({ blob, filename: `${baseName(file.name)}.webm`, kind: "webm" });
      toast.success("Conversión a WebM/Opus completada.");
    } catch (err) {
      if (err instanceof CancelledError) {
        toast.info("Conversión cancelada.");
      } else {
        const message = err instanceof Error ? err.message : "No se pudo convertir el audio.";
        toast.error(message);
      }
    } finally {
      cancelAnimationFrame(rafId);
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignorar
        }
      }
      try {
        source?.disconnect();
      } catch {
        // ignorar
      }
      if (audioCtx) audioCtx.close().catch(() => undefined);
      setConverting(false);
    }
  };

  const total = buffer?.duration ?? 0;
  const pct = total > 0 && converting ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileAudio className="size-5 text-primary" aria-hidden />
            1. Sube tu audio
          </CardTitle>
          <CardDescription>
            Acepta MP3, WAV, OGG, M4A y FLAC de hasta {MAX_SIZE_MB} MB. El archivo se procesa en tu
            navegador y nunca se sube a ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={MAX_SIZE_MB}
            hint="MP3, WAV, OGG, M4A o FLAC"
          />

          {file && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{formatBytes(file.size)}</Badge>
              {decoding && (
                <Badge className="flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  Decodificando…
                </Badge>
              )}
              {buffer && (
                <>
                  <Badge variant="secondary">Duración: {formatTime(buffer.duration)}</Badge>
                  <Badge variant="secondary">{channelsLabel(buffer.numberOfChannels)}</Badge>
                  <Badge variant="secondary">{formatSampleRate(buffer.sampleRate)}</Badge>
                </>
              )}
            </div>
          )}

          {decodeError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>No se pudo decodificar el audio</AlertTitle>
              <AlertDescription>{decodeError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="size-5 text-primary" aria-hidden />
            2. Elige el formato de salida
          </CardTitle>
          <CardDescription>Convierte el audio al formato que necesites.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={(value) => setTab(value as TargetTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="wav">WAV</TabsTrigger>
              <TabsTrigger value="opus">WebM/Opus</TabsTrigger>
              <TabsTrigger value="mp3" disabled>
                MP3
              </TabsTrigger>
            </TabsList>

            <TabsContent value="wav" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rate-select">Frecuencia de muestreo</Label>
                <Select value={rate} onValueChange={(value) => setRate(value as RateChoice)} disabled={wavBusy || !buffer}>
                  <SelectTrigger id="rate-select" className="w-full sm:w-72" aria-label="Frecuencia de muestreo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orig">
                      {buffer ? `Mantener decodificada (${buffer.sampleRate} Hz)` : "Mantener la original"}
                    </SelectItem>
                    <SelectItem value="44100">44100 Hz</SelectItem>
                    <SelectItem value="48000">48000 Hz</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  WAV sin pérdida: PCM de 16 bits, hasta 2 canales entrelazados.
                </p>
              </div>
              <Button type="button" onClick={handleConvertWav} disabled={!buffer || wavBusy} className="w-full sm:w-auto">
                {wavBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileAudio className="size-4" aria-hidden />}
                Convertir a WAV
              </Button>
            </TabsContent>

            <TabsContent value="opus" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                La conversión a WebM/Opus se realiza reproduciendo el audio en tiempo real dentro de
                tu navegador: tardará lo que dura el archivo y no se escuchará nada durante el
                proceso.
              </p>
              {converting ? (
                <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                      Convirtiendo… {pct}%
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatTime(elapsed)} / {formatTime(total)}
                    </span>
                  </div>
                  <Progress value={pct} aria-label="Progreso de la conversión a Opus" />
                  <p className="text-xs text-muted-foreground">No cierres esta pestaña durante la conversión.</p>
                  <Button type="button" variant="outline" onClick={handleCancel} className="gap-2">
                    <X className="size-4" aria-hidden />
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={handleConvertOpus} disabled={!buffer} className="w-full sm:w-auto">
                  <Volume2 className="size-4" aria-hidden />
                  Convertir a WebM/Opus
                </Button>
              )}
            </TabsContent>

            <TabsContent value="mp3" className="space-y-2">
              <p className="text-sm text-muted-foreground">
                La conversión a MP3 no está disponible en esta versión porque requiere un codificador
                en el servidor. Puedes usar WAV o WebM/Opus como alternativa.
              </p>
            </TabsContent>
          </Tabs>

          {tab === "wav" && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <FileType2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              La frecuencia &quot;decodificada&quot; es la que tu navegador usa al leer el archivo;
              elegir 44100 o 48000 Hz fuerza un re-muestreo de alta calidad.
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
              {result.kind === "wav" ? "Archivo WAV (PCM 16 bits)." : "Archivo WebM (Opus)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{formatBytes(result.blob.size)}</Badge>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton blob={result.blob} filename={result.filename} label="Descargar audio convertido" size="lg" />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResult(null);
                }}
                className="gap-2"
              >
                <X className="size-4" aria-hidden />
                Convertir de nuevo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
