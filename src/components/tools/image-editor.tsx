"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileImage,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Wand2,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn, formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  hue: number;
  grayscale: number;
  sepia: number;
}

const DEFAULTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  hue: 0,
  grayscale: 0,
  sepia: 0,
};

const PRESETS: { id: string; label: string; values: Adjustments }[] = [
  { id: "original", label: "Original", values: { ...DEFAULTS } },
  {
    id: "vivid",
    label: "Vívido",
    values: { brightness: 105, contrast: 112, saturation: 145, blur: 0, hue: 0, grayscale: 0, sepia: 0 },
  },
  {
    id: "bw",
    label: "B&N",
    values: { brightness: 102, contrast: 112, saturation: 100, blur: 0, hue: 0, grayscale: 100, sepia: 0 },
  },
  {
    id: "sepia",
    label: "Sepia",
    values: { brightness: 103, contrast: 105, saturation: 120, blur: 0, hue: 0, grayscale: 0, sepia: 65 },
  },
  {
    id: "cold",
    label: "Frío",
    values: { brightness: 103, contrast: 102, saturation: 125, blur: 0, hue: 15, grayscale: 0, sepia: 0 },
  },
  {
    id: "warm",
    label: "Cálido",
    values: { brightness: 104, contrast: 102, saturation: 130, blur: 0, hue: -12, grayscale: 0, sepia: 22 },
  },
];

interface EditorResult {
  blob: Blob;
  width: number;
  height: number;
}

export default function ImageEditorTool() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [adjust, setAdjust] = useState<Adjustments>({ ...DEFAULTS });
  const [preset, setPreset] = useState("original");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(90);
  const [compare, setCompare] = useState(false);
  const [result, setResult] = useState<EditorResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const draw = useCallback(() => {
    const image = img;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    if (canvas.width !== image.naturalWidth) canvas.width = image.naturalWidth;
    if (canvas.height !== image.naturalHeight) canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) saturate(${adjust.saturation}%) grayscale(${adjust.grayscale}%) sepia(${adjust.sepia}%) hue-rotate(${adjust.hue}deg) blur(${adjust.blur}px)`;
    ctx.drawImage(image, 0, 0);
    ctx.filter = "none";
  }, [img, adjust]);

  // Vista previa en vivo con debounce de 150 ms + regeneración del archivo de descarga.
  useEffect(() => {
    if (!img) return;
    const timer = setTimeout(() => {
      draw();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const gen = ++genRef.current;
      void (async () => {
        try {
          const mime = format === "png" ? "image/png" : "image/jpeg";
          const target = mime === "image/jpeg" ? flattenForJpeg(canvas) : canvas;
          const blob = await canvasToBlob(target, mime, quality / 100);
          if (genRef.current !== gen) return;
          setResult({ blob, width: canvas.width, height: canvas.height });
          setResultUrl(URL.createObjectURL(blob));
        } catch (err) {
          if (genRef.current === gen) {
            toast.error(errMessage(err, "No se pudo generar la imagen editada."));
          }
        }
      })();
    }, 150);
    return () => clearTimeout(timer);
  }, [draw, img, format, quality]);

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

  const applyPreset = (id: string) => {
    const found = PRESETS.find((p) => p.id === id);
    if (!found) return;
    setPreset(id);
    setAdjust({ ...found.values });
  };

  const setField = (field: keyof Adjustments, value: number) => {
    setPreset("");
    setAdjust((prev) => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    applyPreset("original");
    setFormat("png");
    setQuality(90);
    toast.success("Ajustes restablecidos.");
  };

  const handleClearAll = () => {
    setFile(null);
    setImg(null);
    setFileUrl(null);
    setResult(null);
    setResultUrl(null);
    setPreset("original");
    setAdjust({ ...DEFAULTS });
    setFormat("png");
    setQuality(90);
  };

  const sliders: { field: keyof Adjustments; label: string; min: number; max: number; step: number; unit: string; id: string }[] = [
    { field: "brightness", label: "Brillo", min: 0, max: 200, step: 1, unit: "%", id: "ed-brightness" },
    { field: "contrast", label: "Contraste", min: 0, max: 200, step: 1, unit: "%", id: "ed-contrast" },
    { field: "saturation", label: "Saturación", min: 0, max: 200, step: 1, unit: "%", id: "ed-saturation" },
    { field: "blur", label: "Desenfoque", min: 0, max: 10, step: 0.1, unit: " px", id: "ed-blur" },
    { field: "hue", label: "Tono", min: -180, max: 180, step: 1, unit: "°", id: "ed-hue" },
  ];

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="size-5 text-primary" aria-hidden />
            1. Sube tu imagen
          </CardTitle>
          <CardDescription>
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB. La edición ocurre por completo en tu
            navegador: la imagen nunca sale de tu dispositivo.
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
              <SlidersHorizontal className="size-5 text-primary" aria-hidden />
              2. Ajustes y filtros
            </CardTitle>
            <CardDescription>
              Mueve los controles para ver el resultado al instante, o aplica un preset rápido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Presets rápidos</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                className="w-full flex-wrap"
                value={preset}
                onValueChange={(v) => {
                  if (v) applyPreset(v);
                }}
                aria-label="Presets de edición"
              >
                {PRESETS.map((p) => (
                  <ToggleGroupItem key={p.id} value={p.id} className="flex-1 min-w-16">
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {sliders.map((s) => (
                <div key={s.field} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={s.id}>{s.label}</Label>
                    <span className="text-sm font-medium tabular-nums">
                      {adjust[s.field]}
                      {s.unit}
                    </span>
                  </div>
                  <Slider
                    id={s.id}
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={[adjust[s.field]]}
                    onValueChange={(values) => setField(s.field, values[0] ?? adjust[s.field])}
                    aria-label={s.label}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <RefreshCw className="size-4" aria-hidden />
                Restablecer
              </Button>
              <div className="flex items-center gap-2">
                <Switch
                  id="ed-compare"
                  checked={compare}
                  onCheckedChange={(v) => setCompare(v)}
                  aria-label="Comparar con el original"
                />
                <Label htmlFor="ed-compare">Comparar con el original</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {img && file && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result ? (
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              )}
              3. Resultado y descarga
            </CardTitle>
            <CardDescription>La vista previa refleja tus ajustes en tiempo real.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className={cn("grid gap-4", compare && "sm:grid-cols-2")}>
              {compare && (
                <figure className="space-y-2">
                  <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Original
                  </figcaption>
                  <img
                    src={fileUrl ?? undefined}
                    alt="Imagen original sin editar"
                    className="max-h-64 w-full rounded-lg border object-contain"
                  />
                </figure>
              )}
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {compare ? "Editada" : "Vista previa"}
                </figcaption>
                <canvas
                  ref={canvasRef}
                  aria-label="Vista previa de la imagen editada"
                  className="max-h-64 w-full rounded-lg border object-contain"
                />
              </figure>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Formato de salida</Label>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as "png" | "jpeg")}
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
                    <Label htmlFor="ed-quality">Calidad</Label>
                    <span className="text-sm font-medium tabular-nums">{quality}%</span>
                  </div>
                  <Slider
                    id="ed-quality"
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

            <div className="flex flex-wrap items-center gap-2">
              {result && (
                <Badge variant="secondary">
                  {result.width} × {result.height} px · {formatBytes(result.blob.size)}
                </Badge>
              )}
              <Wand2 className="size-4 text-muted-foreground" aria-hidden />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result?.blob ?? null}
                filename={`${baseName(file.name)}-editada.${format === "png" ? "png" : "jpg"}`}
                label="Descargar imagen editada"
                size="lg"
                disabled={!result}
              />
              <Button type="button" variant="outline" onClick={handleClearAll} className="gap-2">
                <RefreshCw className="size-4" aria-hidden />
                Editar otra imagen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
