"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eraser,
  FileImage,
  Info,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Sparkles,
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AI_SIDE = 1600;

const AI_PROMPT =
  "remove the background completely, isolate the main subject on a plain white background, keep the subject unchanged and sharp";

/** Tablero de ajedrez para visualizar la transparencia. */
const CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #d4d4d8 25%, transparent 25%, transparent 75%, #d4d4d8 75%), linear-gradient(45deg, #d4d4d8 25%, transparent 25%, transparent 75%, #d4d4d8 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 8px 8px",
};

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

function loadImageFromDataURL(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo decodificar la imagen devuelta por la IA."));
    img.src = dataUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el archivo PNG."))),
      type,
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

interface RemoveBgResult {
  blob: Blob;
  width: number;
  height: number;
}

export default function RemoveBgTool() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "manual">("ai");

  // Modo IA
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTolerance, setAiTolerance] = useState(8);
  const [solidWhite, setSolidWhite] = useState(false);
  const [aiResult, setAiResult] = useState<RemoveBgResult | null>(null);
  const [aiResultUrl, setAiResultUrl] = useState<string | null>(null);
  const aiSourceRef = useRef<ImageData | null>(null);
  const aiGenRef = useRef(0);

  // Modo manual
  const [manualTolerance, setManualTolerance] = useState(50);
  const [hasEdits, setHasEdits] = useState(false);
  const [manualResult, setManualResult] = useState<RemoveBgResult | null>(null);
  const [manualResultUrl, setManualResultUrl] = useState<string | null>(null);
  const manualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const originalDataRef = useRef<ImageData | null>(null);
  const manualGenRef = useRef(0);

  // Revoca los object URLs cuando cambian o al desmontar.
  useEffect(() => {
    if (!fileUrl) return;
    return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  useEffect(() => {
    if (!aiResultUrl) return;
    return () => URL.revokeObjectURL(aiResultUrl);
  }, [aiResultUrl]);

  useEffect(() => {
    if (!manualResultUrl) return;
    return () => URL.revokeObjectURL(manualResultUrl);
  }, [manualResultUrl]);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (!next) {
      setFile(null);
      setImg(null);
      setFileUrl(null);
      return;
    }
    if (next.type && !ALLOWED_TYPES.has(next.type)) {
      toast.error("Formato no compatible. Sube una imagen JPEG, PNG o WebP.");
      return;
    }
    aiSourceRef.current = null;
    originalDataRef.current = null;
    setAiResult(null);
    setAiResultUrl(null);
    setManualResult(null);
    setManualResultUrl(null);
    setHasEdits(false);
    void (async () => {
      try {
        const loaded = await loadImageFromFile(next);
        setFile(next);
        setFileUrl(URL.createObjectURL(next));
        setImg(loaded);
      } catch (err) {
        toast.error(errMessage(err, "No se pudo leer la imagen."));
      }
    })();
  };

  /** Aplica el umbral de blanco a transparente sobre la respuesta de la IA. */
  const applyAiThreshold = () => {
    const src = aiSourceRef.current;
    if (!src) return;
    const gen = ++aiGenRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    if (!solidWhite) {
      const d = out.data;
      const lim = 245 - aiTolerance;
      const satLim = 32 + aiTolerance;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        if (mn > lim && mx - mn < satLim) {
          d[i + 3] = 0;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
    void (async () => {
      try {
        const blob = await canvasToBlob(canvas, "image/png");
        if (aiGenRef.current !== gen) return;
        setAiResult({ blob, width: canvas.width, height: canvas.height });
        setAiResultUrl(URL.createObjectURL(blob));
      } catch {
        if (aiGenRef.current === gen) {
          toast.error("No se pudo generar el PNG con el fondo eliminado.");
        }
      }
    })();
  };

  // Recalcula la transparencia al cambiar la tolerancia o el fondo sólido.
  useEffect(() => {
    if (!aiSourceRef.current) return;
    applyAiThreshold();
  }, [aiTolerance, solidWhite]);

  const runAI = async () => {
    if (!img || aiBusy) return;
    setAiBusy(true);
    try {
      const scale = Math.min(1, MAX_AI_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const send = document.createElement("canvas");
      send.width = w;
      send.height = h;
      const sctx = send.getContext("2d");
      if (!sctx) throw new Error("No se pudo preparar la imagen para enviar.");
      sctx.drawImage(img, 0, 0, w, h);
      const dataUrl = send.toDataURL("image/jpeg", 0.9);

      let response: Response;
      try {
        response = await fetch("/api/ai/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl, prompt: AI_PROMPT }),
        });
      } catch {
        throw new Error("No se pudo conectar con el servicio de IA. Revisa tu conexión e inténtalo de nuevo.");
      }

      if (!response.ok) {
        let message = `Error ${response.status}`;
        try {
          const data = (await response.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // respuesta sin JSON: usamos el mensaje genérico
        }
        if (response.status === 429 && message === `Error ${response.status}`) {
          message = "Has alcanzado el límite diario de ediciones con IA. Inténtalo de nuevo más tarde.";
        }
        throw new Error(message);
      }

      const data = (await response.json()) as { image?: string };
      if (!data.image || !data.image.startsWith("data:image/")) {
        throw new Error("La respuesta del servicio de IA no es válida.");
      }
      const outImg = await loadImageFromDataURL(data.image);
      const out = document.createElement("canvas");
      out.width = outImg.naturalWidth;
      out.height = outImg.naturalHeight;
      const octx = out.getContext("2d", { willReadFrequently: true });
      if (!octx) throw new Error("No se pudo procesar la respuesta de la IA.");
      octx.drawImage(outImg, 0, 0);
      aiSourceRef.current = octx.getImageData(0, 0, out.width, out.height);
      applyAiThreshold();
      toast.success("Fondo procesado con IA. Ajusta la tolerancia si hace falta refinar.");
    } catch (err) {
      toast.error(errMessage(err, "No se pudo quitar el fondo con IA."));
    } finally {
      setAiBusy(false);
    }
  };

  // Prepara el lienzo del modo manual cada vez que cambia la imagen.
  // Los estados hasEdits/manualResult ya se reinician en handleFilesChange.
  useEffect(() => {
    if (!img) return;
    const canvas = manualCanvasRef.current;
    if (!canvas) return;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    originalDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }, [img]);

  const refreshManualResult = () => {
    const canvas = manualCanvasRef.current;
    if (!canvas) return;
    const gen = ++manualGenRef.current;
    void (async () => {
      try {
        const blob = await canvasToBlob(canvas, "image/png");
        if (manualGenRef.current !== gen) return;
        setManualResult({ blob, width: canvas.width, height: canvas.height });
        setManualResultUrl(URL.createObjectURL(blob));
      } catch {
        if (manualGenRef.current === gen) {
          toast.error("No se pudo generar el PNG con el fondo eliminado.");
        }
      }
    })();
  };

  const floodFill = (sx: number, sy: number) => {
    const canvas = manualCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const start = sy * w + sx;
    if (d[start * 4 + 3] === 0) return;
    const sr = d[start * 4];
    const sg = d[start * 4 + 1];
    const sb = d[start * 4 + 2];
    const tol = manualTolerance * 3;
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const p = queue[head++];
      const i = p * 4;
      if (Math.abs(d[i] - sr) + Math.abs(d[i + 1] - sg) + Math.abs(d[i + 2] - sb) > tol) continue;
      d[i + 3] = 0;
      const x = p % w;
      const y = Math.floor(p / w);
      if (x > 0 && !visited[p - 1]) {
        visited[p - 1] = 1;
        queue[tail++] = p - 1;
      }
      if (x < w - 1 && !visited[p + 1]) {
        visited[p + 1] = 1;
        queue[tail++] = p + 1;
      }
      if (y > 0 && !visited[p - w]) {
        visited[p - w] = 1;
        queue[tail++] = p - w;
      }
      if (y < h - 1 && !visited[p + w]) {
        visited[p + w] = 1;
        queue[tail++] = p + w;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    setHasEdits(true);
    refreshManualResult();
  };

  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = manualCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.floor(((e.clientX - rect.left) * canvas.width) / rect.width);
    const y = Math.floor(((e.clientY - rect.top) * canvas.height) / rect.height);
    floodFill(x, y);
  };

  const resetManual = () => {
    const canvas = manualCanvasRef.current;
    const original = originalDataRef.current;
    if (!canvas || !original) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.putImageData(original, 0, 0);
    setHasEdits(false);
    setManualResult(null);
    setManualResultUrl(null);
    toast.success("Cambios manuales descartados.");
  };

  const handleClearAll = () => {
    setFile(null);
    setImg(null);
    setFileUrl(null);
    aiSourceRef.current = null;
    originalDataRef.current = null;
    setAiResult(null);
    setAiResultUrl(null);
    setManualResult(null);
    setManualResultUrl(null);
    setHasEdits(false);
  };

  const activeResult = mode === "ai" ? aiResult : manualResult;
  const activeUrl = mode === "ai" ? aiResultUrl : manualResultUrl;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="size-5 text-primary" aria-hidden />
            1. Sube tu imagen
          </CardTitle>
          <CardDescription>
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB. Funciona mejor con fondos uniformes y
            un sujeto bien definido.
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
            <Badge variant="secondary">
              Original: {img.naturalWidth} × {img.naturalHeight} px · {formatBytes(file.size)}
            </Badge>
          )}
        </CardContent>
      </Card>

      {img && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eraser className="size-5 text-primary" aria-hidden />
              2. Elimina el fondo
            </CardTitle>
            <CardDescription>
              Elige el modo automático con IA o el modo manual por clics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(value) => setMode(value === "manual" ? "manual" : "ai")}>
              <TabsList>
                <TabsTrigger value="ai" className="gap-1.5">
                  <Sparkles className="size-4" aria-hidden />
                  IA
                </TabsTrigger>
                <TabsTrigger value="manual" className="gap-1.5">
                  <MousePointerClick className="size-4" aria-hidden />
                  Manual
                </TabsTrigger>
              </TabsList>

              <TabsContent value="ai" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
                <p className="text-sm text-muted-foreground">
                  La IA reconstruye la imagen sin fondo. Para ahorrar datos, tu imagen se envía
                  reescala a un máximo de 1600 px y el resultado mantiene esa resolución.
                </p>
                <Button type="button" onClick={runAI} disabled={aiBusy} className="w-full sm:w-auto">
                  {aiBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  {aiBusy ? "Procesando..." : "Quitar fondo con IA"}
                </Button>
                {aiBusy && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                  >
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Procesando con IA (puede tardar ~10 s)
                  </div>
                )}
                {aiSourceRef.current && (
                  <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="ai-tolerance">Tolerancia del blanco a transparente</Label>
                        <span className="text-sm font-medium tabular-nums">{aiTolerance}</span>
                      </div>
                      <Slider
                        id="ai-tolerance"
                        min={0}
                        max={20}
                        step={1}
                        value={[aiTolerance]}
                        onValueChange={(values) => setAiTolerance(values[0] ?? aiTolerance)}
                        disabled={aiBusy || solidWhite}
                        aria-label="Tolerancia del umbral de blanco"
                      />
                      <p className="text-xs text-muted-foreground">
                        Los píxeles casi blancos se vuelven transparentes. Súbelo si quedan restos
                        de fondo; bájalo si el sujeto pierde zonas claras.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="ai-solid"
                        checked={solidWhite}
                        onCheckedChange={(v) => setSolidWhite(v)}
                        aria-label="Fondo blanco sólido sin transparencia"
                      />
                      <Label htmlFor="ai-solid">Fondo blanco sólido (sin transparencia)</Label>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="manual" forceMount className="mt-4 space-y-4 data-[state=inactive]:hidden">
                <p className="text-sm text-muted-foreground">
                  Haz clic sobre el color del fondo que quieres eliminar dentro de la imagen. Puedes
                  repetir el clic en varias zonas hasta dejar el fondo limpio.
                </p>
                <div className="flex justify-center">
                  <canvas
                    ref={manualCanvasRef}
                    onPointerDown={handleCanvasClick}
                    style={CHECKER}
                    aria-label="Lienzo editable: haz clic sobre el fondo a eliminar"
                    className="block max-h-[60vh] w-auto max-w-full cursor-crosshair rounded-lg border"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="manual-tolerance">Tolerancia</Label>
                    <span className="text-sm font-medium tabular-nums">{manualTolerance}</span>
                  </div>
                  <Slider
                    id="manual-tolerance"
                    min={10}
                    max={100}
                    step={1}
                    value={[manualTolerance]}
                    onValueChange={(values) => setManualTolerance(values[0] ?? manualTolerance)}
                    aria-label="Tolerancia del relleno manual"
                  />
                  <p className="text-xs text-muted-foreground">
                    Afecta a los próximos clics: valores bajos solo eliminan colores casi iguales;
                    valores altos se extienden a degradados y sombras.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetManual}
                  disabled={!hasEdits}
                  className="gap-2"
                >
                  <RefreshCw className="size-4" aria-hidden />
                  Restablecer
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {img && activeResult && activeUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              3. Resultado
            </CardTitle>
            <CardDescription>
              Las zonas a cuadros son transparentes. El resultado se descarga en PNG.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex justify-center">
              <img
                src={activeUrl}
                alt="Imagen sin fondo"
                style={CHECKER}
                className="max-h-[50vh] w-auto max-w-full rounded-lg border object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {activeResult.width} × {activeResult.height} px · {formatBytes(activeResult.blob.size)}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={activeResult.blob}
                filename={`${baseName(file?.name ?? "imagen")}-sin-fondo.png`}
                label="Descargar PNG"
                size="lg"
              />
              <Button type="button" variant="outline" onClick={handleClearAll} className="gap-2">
                <RefreshCw className="size-4" aria-hidden />
                Probar con otra imagen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <Info className="size-4" aria-hidden />
        <AlertTitle>Privacidad</AlertTitle>
        <AlertDescription>
          El modo IA envía tu imagen (reescalada) a nuestro servicio de IA para procesarla. El modo
          manual no sale de tu dispositivo: todo el procesamiento ocurre en tu navegador.
        </AlertDescription>
      </Alert>
    </ToolShell>
  );
}
