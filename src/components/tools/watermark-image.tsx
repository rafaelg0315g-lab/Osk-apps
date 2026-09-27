"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileImage,
  ImagePlus,
  Loader2,
  RefreshCw,
  Stamp,
  Type,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn, formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type Position9 = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

const POSITIONS: Position9[] = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

const POSITION_LABELS: Record<Position9, string> = {
  tl: "Arriba a la izquierda",
  tc: "Arriba al centro",
  tr: "Arriba a la derecha",
  ml: "Centro izquierda",
  mc: "Centro",
  mr: "Centro derecha",
  bl: "Abajo a la izquierda",
  bc: "Abajo al centro",
  br: "Abajo a la derecha",
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

/** Punto central donde se dibuja la marca según la posición elegida. */
function pivotFor(pos: Position9, W: number, H: number, tw: number, th: number, margin: number) {
  const x = pos.endsWith("l") ? margin + tw / 2 : pos.endsWith("r") ? W - margin - tw / 2 : W / 2;
  const y = pos.startsWith("t") ? margin + th / 2 : pos.startsWith("b") ? H - margin - th / 2 : H / 2;
  return { x, y };
}

interface ComposeOptions {
  img: HTMLImageElement;
  tab: "text" | "logo";
  text: string;
  textColor: string;
  textOpacity: number;
  textSizePct: number;
  rotation: number;
  logo: HTMLImageElement | null;
  logoOpacity: number;
  logoSizePct: number;
  posMode: "fixed" | "mosaic";
  position: Position9;
}

function composeWatermark(opts: ComposeOptions): HTMLCanvasElement {
  const { img, tab, text, textColor, textOpacity, textSizePct, rotation, logo, logoOpacity, logoSizePct, posMode, position } = opts;
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el lienzo de composición.");
  ctx.drawImage(img, 0, 0);

  if (tab === "text" && text.trim()) {
    const fontSize = Math.max(8, Math.round((W * textSizePct) / 100));
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.globalAlpha = textOpacity / 100;
    ctx.fillStyle = textColor;
    const tw = ctx.measureText(text).width;
    const th = Math.round(fontSize * 1.15);
    const margin = Math.round(fontSize * 0.6);

    if (posMode === "mosaic") {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const stepX = Math.max(tw + fontSize * 2, fontSize * 4);
      const stepY = Math.max(fontSize * 4, th * 3);
      const half = Math.hypot(W, H) / 2 + Math.max(tw, th);
      let row = 0;
      for (let y = -half; y <= half; y += stepY, row++) {
        const offset = row % 2 === 0 ? 0 : stepX / 2;
        for (let x = -half + offset; x <= half; x += stepX) {
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
    } else {
      const p = pivotFor(position, W, H, tw, th, margin);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  } else if (tab === "logo" && logo) {
    const lw = Math.max(16, (W * logoSizePct) / 100);
    const lh = lw * (logo.naturalHeight / logo.naturalWidth);
    const margin = Math.round(Math.max(W, H) * 0.025);
    ctx.globalAlpha = logoOpacity / 100;

    if (posMode === "mosaic") {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      const stepX = lw * 1.8;
      const stepY = lh * 3.2;
      const half = Math.hypot(W, H) / 2 + Math.max(lw, lh);
      let row = 0;
      for (let y = -half; y <= half; y += stepY, row++) {
        const offset = row % 2 === 0 ? 0 : stepX / 2;
        for (let x = -half + offset; x <= half; x += stepX) {
          ctx.drawImage(logo, x - lw / 2, y - lh / 2, lw, lh);
        }
      }
      ctx.restore();
    } else {
      const p = pivotFor(position, W, H, lw, lh, margin);
      ctx.drawImage(logo, p.x - lw / 2, p.y - lh / 2, lw, lh);
    }
  }
  return canvas;
}

interface WatermarkResult {
  blob: Blob;
  width: number;
  height: number;
}

export default function WatermarkImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"text" | "logo">("text");
  const [text, setText] = useState("OSK APPS");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textOpacity, setTextOpacity] = useState(70);
  const [textSizePct, setTextSizePct] = useState(12);
  const [rotation, setRotation] = useState(0);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoOpacity, setLogoOpacity] = useState(70);
  const [logoSizePct, setLogoSizePct] = useState(20);
  const [posMode, setPosMode] = useState<"fixed" | "mosaic">("fixed");
  const [position, setPosition] = useState<Position9>("br");
  const [format, setFormat] = useState<"keep" | "jpeg" | "png">("keep");
  const [quality, setQuality] = useState(90);
  const [compare, setCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WatermarkResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const genRef = useRef(0);

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
    const mime =
      format === "keep" ? (ALLOWED_TYPES.has(file.type) ? file.type : "image/png") : `image/${format}`;
    return { mime };
  }, [file, format]);

  const showQuality = resolved?.mime === "image/jpeg";

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
      } catch (err) {
        toast.error(errMessage(err, "No se pudo leer la imagen."));
      }
    })();
  };

  const handleLogoChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (!next) {
      setLogoFile(null);
      setLogoImg(null);
      setResult(null);
      return;
    }
    void (async () => {
      try {
        const loaded = await loadImageFromFile(next);
        setLogoFile(next);
        setLogoImg(loaded);
      } catch (err) {
        toast.error(errMessage(err, "No se pudo leer el logo."));
      }
    })();
  };

  // Regenera la vista previa automáticamente (con debounce) al cambiar cualquier parámetro.
  useEffect(() => {
    if (!img) return;
    if (tab === "text" && !text.trim()) return;
    if (tab === "logo" && !logoImg) return;
    const gen = ++genRef.current;
    const timer = setTimeout(() => {
      setBusy(true);
      void (async () => {
        try {
          const canvas = composeWatermark({
            img,
            tab,
            text,
            textColor,
            textOpacity,
            textSizePct,
            rotation,
            logo: logoImg,
            logoOpacity,
            logoSizePct,
            posMode,
            position,
          });
          const mime = resolved?.mime ?? "image/png";
          const target = mime === "image/jpeg" ? flattenForJpeg(canvas) : canvas;
          const blob = await canvasToBlob(target, mime, quality / 100);
          if (genRef.current !== gen) return;
          setResult({ blob, width: canvas.width, height: canvas.height });
          setResultUrl(URL.createObjectURL(blob));
        } catch (err) {
          if (genRef.current === gen) {
            toast.error(errMessage(err, "No se pudo aplicar la marca de agua."));
          }
        } finally {
          if (genRef.current === gen) setBusy(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [img, tab, text, textColor, textOpacity, textSizePct, rotation, logoImg, logoOpacity, logoSizePct, posMode, position, format, quality, file, resolved]);

  const handleReset = () => {
    setFile(null);
    setImg(null);
    setFileUrl(null);
    setResult(null);
    setResultUrl(null);
    setLogoFile(null);
    setLogoImg(null);
    setTab("text");
    setText("OSK APPS");
    setTextColor("#ffffff");
    setTextOpacity(70);
    setTextSizePct(12);
    setRotation(0);
    setPosMode("fixed");
    setPosition("br");
    setFormat("keep");
    setQuality(90);
  };

  const outExt = resolved ? MIME_EXT[resolved.mime] ?? "png" : "png";

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="size-5 text-primary" aria-hidden />
            1. Sube tu imagen
          </CardTitle>
          <CardDescription>
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB. La marca de agua se aplica en tu
            navegador: nada se sube a ningún servidor.
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
              <Stamp className="size-5 text-primary" aria-hidden />
              2. Configura la marca de agua
            </CardTitle>
            <CardDescription>
              Usa texto o un logo, elige su tamaño, opacidad y posición sobre la imagen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Tabs value={tab} onValueChange={(value) => setTab(value === "logo" ? "logo" : "text")}>
              <TabsList>
                <TabsTrigger value="text" className="gap-1.5">
                  <Type className="size-4" aria-hidden />
                  Texto
                </TabsTrigger>
                <TabsTrigger value="logo" className="gap-1.5">
                  <ImagePlus className="size-4" aria-hidden />
                  Logo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wm-text">Texto de la marca de agua</Label>
                  <Input
                    id="wm-text"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (!e.target.value.trim()) setResult(null);
                    }}
                    placeholder="Escribe tu texto..."
                    maxLength={60}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="wm-color">Color del texto</Label>
                    <div className="flex items-center gap-2">
                      <input
                        id="wm-color"
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        aria-label="Color del texto de la marca de agua"
                        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                      />
                      <span className="font-mono text-xs text-muted-foreground">{textColor}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="wm-opacity">Opacidad</Label>
                      <span className="text-sm font-medium tabular-nums">{textOpacity}%</span>
                    </div>
                    <Slider
                      id="wm-opacity"
                      min={10}
                      max={100}
                      step={1}
                      value={[textOpacity]}
                      onValueChange={(values) => setTextOpacity(values[0] ?? textOpacity)}
                      aria-label="Opacidad del texto"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="wm-size">Tamaño (del ancho)</Label>
                      <span className="text-sm font-medium tabular-nums">{textSizePct}%</span>
                    </div>
                    <Slider
                      id="wm-size"
                      min={5}
                      max={40}
                      step={1}
                      value={[textSizePct]}
                      onValueChange={(values) => setTextSizePct(values[0] ?? textSizePct)}
                      aria-label="Tamaño del texto relativo al ancho"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="wm-rotation">Rotación</Label>
                      <span className="text-sm font-medium tabular-nums">{rotation}°</span>
                    </div>
                    <Slider
                      id="wm-rotation"
                      min={-45}
                      max={45}
                      step={1}
                      value={[rotation]}
                      onValueChange={(values) => setRotation(values[0] ?? rotation)}
                      aria-label="Rotación del texto"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="logo" className="mt-4 space-y-4">
                <FileDropzone
                  files={logoFile ? [logoFile] : []}
                  onFilesChange={handleLogoChange}
                  accept={LOGO_ACCEPT}
                  maxSizeMB={5}
                  hint="Logo PNG con transparencia recomendado"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="wm-logo-opacity">Opacidad</Label>
                      <span className="text-sm font-medium tabular-nums">{logoOpacity}%</span>
                    </div>
                    <Slider
                      id="wm-logo-opacity"
                      min={10}
                      max={100}
                      step={1}
                      value={[logoOpacity]}
                      onValueChange={(values) => setLogoOpacity(values[0] ?? logoOpacity)}
                      aria-label="Opacidad del logo"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="wm-logo-size">Tamaño (del ancho)</Label>
                      <span className="text-sm font-medium tabular-nums">{logoSizePct}%</span>
                    </div>
                    <Slider
                      id="wm-logo-size"
                      min={5}
                      max={40}
                      step={1}
                      value={[logoSizePct]}
                      onValueChange={(values) => setLogoSizePct(values[0] ?? logoSizePct)}
                      aria-label="Tamaño del logo relativo al ancho"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label>Posición</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={posMode}
                  onValueChange={(v) => {
                    if (v === "fixed" || v === "mosaic") setPosMode(v);
                  }}
                  aria-label="Modo de posición"
                >
                  <ToggleGroupItem value="fixed">Fija</ToggleGroupItem>
                  <ToggleGroupItem value="mosaic">Mosaico</ToggleGroupItem>
                </ToggleGroup>
              </div>
              {posMode === "fixed" ? (
                <div className="grid w-fit grid-cols-3 gap-1.5">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-label={POSITION_LABELS[p]}
                      aria-pressed={position === p}
                      onClick={() => setPosition(p)}
                      className={cn(
                        "flex size-10 items-center justify-center rounded-md border transition-colors hover:bg-muted",
                        position === p ? "border-primary bg-primary/10" : "bg-background",
                      )}
                    >
                      <span
                        className={cn(
                          "block size-2.5 rounded-full",
                          position === p ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  La marca se repetirá en diagonal por toda la imagen.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Formato de salida</Label>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as "keep" | "jpeg" | "png")}
                >
                  <SelectTrigger className="w-full" aria-label="Formato de salida">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Mantener original</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {showQuality && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="wm-quality">Calidad</Label>
                    <span className="text-sm font-medium tabular-nums">{quality}%</span>
                  </div>
                  <Slider
                    id="wm-quality"
                    min={1}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={(values) => setQuality(values[0] ?? quality)}
                    aria-label="Calidad JPEG de la salida"
                  />
                </div>
              )}
            </div>

            {tab === "text" && !text.trim() && (
              <p className="text-sm text-amber-600 dark:text-amber-400" role="status">
                Escribe el texto de la marca de agua para generar la vista previa.
              </p>
            )}
            {tab === "logo" && !logoImg && (
              <p className="text-sm text-amber-600 dark:text-amber-400" role="status">
                Sube un logo para generar la vista previa.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {img && result && resultUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Vista previa
              {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
            </CardTitle>
            <CardDescription>
              La vista previa se actualiza automáticamente al cambiar los ajustes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-2">
              <Switch
                id="wm-compare"
                checked={compare}
                onCheckedChange={(v) => setCompare(v)}
                aria-label="Comparar con el original"
              />
              <Label htmlFor="wm-compare">Comparar con el original</Label>
            </div>

            <div className={cn("grid gap-4", compare && "sm:grid-cols-2")}>
              {compare && (
                <figure className="space-y-2">
                  <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Original
                  </figcaption>
                  <img
                    src={fileUrl ?? undefined}
                    alt="Imagen original sin marca de agua"
                    className="max-h-64 w-full rounded-lg border object-contain"
                  />
                </figure>
              )}
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Con marca de agua · {result.width} × {result.height} px ·{" "}
                  {formatBytes(result.blob.size)}
                </figcaption>
                <img
                  src={resultUrl}
                  alt="Imagen con marca de agua aplicada"
                  className="max-h-64 w-full rounded-lg border object-contain"
                />
              </figure>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result.blob}
                filename={`${baseName(file?.name ?? "imagen")}-marca-agua.${outExt}`}
                label="Descargar imagen"
                size="lg"
              />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <RefreshCw className="size-4" aria-hidden />
                Empezar de nuevo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
