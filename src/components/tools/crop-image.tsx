"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Crop,
  FileImage,
  Info,
  Loader2,
  RefreshCw,
  Scissors,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIN_SIZE = 16;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
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

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

const HANDLES: { id: Exclude<HandleId, "move">; cursor: string; label: string }[] = [
  { id: "nw", cursor: "nwse-resize", label: "Manija superior izquierda" },
  { id: "n", cursor: "ns-resize", label: "Manija superior" },
  { id: "ne", cursor: "nesw-resize", label: "Manija superior derecha" },
  { id: "e", cursor: "ew-resize", label: "Manija derecha" },
  { id: "se", cursor: "nwse-resize", label: "Manija inferior derecha" },
  { id: "s", cursor: "ns-resize", label: "Manija inferior" },
  { id: "sw", cursor: "nesw-resize", label: "Manija inferior izquierda" },
  { id: "w", cursor: "ew-resize", label: "Manija izquierda" },
];

const RATIO_OPTIONS = [
  { value: "free", label: "Libre", ratio: null },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "3:2", label: "3:2", ratio: 3 / 2 },
];

function clampRect(r: Rect, maxW: number, maxH: number): Rect {
  const w = Math.min(Math.max(r.w, MIN_SIZE), maxW);
  const h = Math.min(Math.max(r.h, MIN_SIZE), maxH);
  const x = Math.min(Math.max(r.x, 0), maxW - w);
  const y = Math.min(Math.max(r.y, 0), maxH - h);
  return { x, y, w, h };
}

interface DragState {
  handle: HandleId;
  startX: number;
  startY: number;
  rect: Rect;
  scale: number;
}

interface CropResult {
  blob: Blob;
  width: number;
  height: number;
}

export default function CropImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ratioValue, setRatioValue] = useState("free");
  const [displayScale, setDisplayScale] = useState(1);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(90);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CropResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const imgElRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Revoca los object URLs cuando cambian o al desmontar.
  useEffect(() => {
    if (!fileUrl) return;
    return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  useEffect(() => {
    if (!resultUrl) return;
    return () => URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  // Escala de visualización (px en pantalla / px naturales) para posicionar el rectángulo.
  useEffect(() => {
    if (!img) return;
    const update = () => {
      const el = imgElRef.current;
      if (el && img.naturalWidth > 0) {
        setDisplayScale(el.getBoundingClientRect().width / img.naturalWidth);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [img, fileUrl]);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (!next) {
      setFile(null);
      setImg(null);
      setFileUrl(null);
      setRect(null);
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
        setRect({ x: 0, y: 0, w: loaded.naturalWidth, h: loaded.naturalHeight });
      } catch (err) {
        toast.error(errMessage(err, "No se pudo leer la imagen."));
      }
    })();
  };

  const applyRatio = (value: string) => {
    setRatioValue(value);
    const option = RATIO_OPTIONS.find((o) => o.value === value);
    if (!img || !option || option.ratio === null) return;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    let w = W;
    let h = w / option.ratio;
    if (h > H) {
      h = H;
      w = h * option.ratio;
    }
    setRect(clampRect({ x: (W - w) / 2, y: (H - h) / 2, w, h }, W, H));
  };

  const startDrag = (handle: HandleId) => (e: React.PointerEvent) => {
    if (!img || !rect) return;
    e.preventDefault();
    const el = imgElRef.current;
    const scale =
      el && img.naturalWidth > 0 ? el.getBoundingClientRect().width / img.naturalWidth : displayScale;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // algunos navegadores antiguos no soportan captura de puntero
    }
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      rect: { ...rect },
      scale: scale > 0 ? scale : 1,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !img) return;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const dx = (e.clientX - drag.startX) / drag.scale;
    const dy = (e.clientY - drag.startY) / drag.scale;
    const r0 = drag.rect;
    const h = drag.handle;
    let next: Rect;

    if (h === "move") {
      next = { ...r0, x: r0.x + dx, y: r0.y + dy };
      setRect(clampRect(next, W, H));
      return;
    }

    let x1 = r0.x;
    let y1 = r0.y;
    let x2 = r0.x + r0.w;
    let y2 = r0.y + r0.h;
    if (h.includes("w")) x1 = Math.min(x1 + dx, x2 - MIN_SIZE);
    if (h.includes("e")) x2 = Math.max(x2 + dx, x1 + MIN_SIZE);
    if (h.includes("n")) y1 = Math.min(y1 + dy, y2 - MIN_SIZE);
    if (h.includes("s")) y2 = Math.max(y2 + dy, y1 + MIN_SIZE);
    next = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };

    const option = RATIO_OPTIONS.find((o) => o.value === ratioValue);
    const ratio = option?.ratio ?? null;
    if (ratio !== null) {
      if (h === "n" || h === "s") {
        const cx = next.x + next.w / 2;
        let nh = next.h;
        let nw = nh * ratio;
        if (nw > W) {
          nw = W;
          nh = nw / ratio;
        }
        const y = h === "n" ? r0.y + r0.h - nh : r0.y;
        next = clampRect({ x: cx - nw / 2, y, w: nw, h: nh }, W, H);
      } else if (h === "e" || h === "w") {
        const cy = next.y + next.h / 2;
        let nw = next.w;
        let nh = nw / ratio;
        if (nh > H) {
          nh = H;
          nw = nh * ratio;
        }
        const x = h === "w" ? r0.x + r0.w - nw : r0.x;
        next = clampRect({ x, y: cy - nh / 2, w: nw, h: nh }, W, H);
      } else {
        const dirX = h.includes("e") ? 1 : -1;
        const dirY = h.includes("s") ? 1 : -1;
        const ax = dirX === 1 ? r0.x : r0.x + r0.w;
        const ay = dirY === 1 ? r0.y : r0.y + r0.h;
        let nw = Math.max(MIN_SIZE, dirX === 1 ? r0.w + dx : r0.w - dx);
        let nh = nw / ratio;
        const availW = dirX === 1 ? W - ax : ax;
        const availH = dirY === 1 ? H - ay : ay;
        if (nh > availH) {
          nh = Math.max(MIN_SIZE, availH);
          nw = nh * ratio;
        }
        if (nw > availW) {
          nw = Math.max(MIN_SIZE, availW);
          nh = nw / ratio;
          if (nh > availH) {
            nh = Math.max(MIN_SIZE, availH);
            nw = nh * ratio;
          }
        }
        next = clampRect({ x: dirX === 1 ? ax : ax - nw, y: dirY === 1 ? ay : ay - nh, w: nw, h: nh }, W, H);
      }
    }

    setRect(clampRect(next, W, H));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleCrop = async () => {
    if (!img || !rect || busy) return;
    setBusy(true);
    try {
      const sx = Math.round(Math.max(0, Math.min(rect.x, img.naturalWidth - 1)));
      const sy = Math.round(Math.max(0, Math.min(rect.y, img.naturalHeight - 1)));
      const w = Math.max(1, Math.round(rect.w));
      const h = Math.max(1, Math.round(rect.h));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar el lienzo de salida.");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
      const mime = format === "png" ? "image/png" : "image/jpeg";
      const blob = await canvasToBlob(canvas, mime, quality / 100);
      setResult({ blob, width: w, height: h });
      setResultUrl(URL.createObjectURL(blob));
      toast.success("Imagen recortada correctamente.");
    } catch (err) {
      toast.error(errMessage(err, "No se pudo recortar la imagen."));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setImg(null);
    setFileUrl(null);
    setRect(null);
    setResult(null);
    setResultUrl(null);
    setRatioValue("free");
    setFormat("png");
    setQuality(90);
  };

  const scale = displayScale > 0 ? displayScale : 1;
  const rectStyle = rect
    ? {
        left: `${rect.x * scale}px`,
        top: `${rect.y * scale}px`,
        width: `${rect.w * scale}px`,
        height: `${rect.h * scale}px`,
      }
    : undefined;

  const handlePos = (hid: Exclude<HandleId, "move">) => {
    if (!rect) return { left: 0, top: 0 };
    const cx =
      hid === "nw" || hid === "w" || hid === "sw"
        ? rect.x
        : hid === "ne" || hid === "e" || hid === "se"
          ? rect.x + rect.w
          : rect.x + rect.w / 2;
    const cy =
      hid === "nw" || hid === "n" || hid === "ne"
        ? rect.y
        : hid === "sw" || hid === "s" || hid === "se"
          ? rect.y + rect.h
          : rect.y + rect.h / 2;
    return { left: `${cx * scale}px`, top: `${cy * scale}px` };
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="size-5 text-primary" aria-hidden />
            1. Sube tu imagen
          </CardTitle>
          <CardDescription>
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB. El recorte se hace en tu navegador,
            sin subir la imagen a ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
          />
        </CardContent>
      </Card>

      {img && fileUrl && rect && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crop className="size-5 text-primary" aria-hidden />
              2. Ajusta el área de recorte
            </CardTitle>
            <CardDescription>
              Arrastra dentro del rectángulo para moverlo y usa las manijas para redimensionarlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <ToggleGroup
                type="single"
                variant="outline"
                className="w-full sm:w-fit"
                value={ratioValue}
                onValueChange={(v) => {
                  if (v) applyRatio(v);
                }}
                aria-label="Proporción del recorte"
              >
                {RATIO_OPTIONS.map((o) => (
                  <ToggleGroupItem key={o.value} value={o.value} className="flex-1 sm:flex-none">
                    {o.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Al elegir una proporción, el rectángulo se ajusta automáticamente al máximo posible
                dentro de la imagen.
              </p>
            </div>

            <div className="flex justify-center">
              <div
                className="relative w-fit max-w-full overflow-hidden rounded-lg border bg-muted"
              >
                <img
                  ref={imgElRef}
                  src={fileUrl}
                  alt="Imagen cargada para recortar"
                  className="block max-h-[60vh] w-auto max-w-full select-none"
                  draggable={false}
                />
                <div
                  className="absolute inset-0 touch-none"
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <div
                    className="absolute cursor-move border border-dashed border-white/90"
                    style={{ ...rectStyle, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}
                    onPointerDown={startDrag("move")}
                  >
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                      {Math.round(rect.w)} × {Math.round(rect.h)} px
                    </span>
                  </div>
                  {HANDLES.map((h) => (
                    <div
                      key={h.id}
                      role="presentation"
                      onPointerDown={startDrag(h.id)}
                      className={cn(
                        "absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-zinc-700 bg-white/95 shadow-md",
                        h.cursor,
                      )}
                      style={handlePos(h.id)}
                      aria-label={h.label}
                    >
                      <span className="block size-2 rounded-full bg-zinc-700" aria-hidden />
                    </div>
                  ))}
                </div>
              </div>
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
                    <Label htmlFor="crop-quality">Calidad JPEG</Label>
                    <span className="text-sm font-medium tabular-nums">{quality}%</span>
                  </div>
                  <Slider
                    id="crop-quality"
                    min={1}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={(values) => setQuality(values[0] ?? quality)}
                    aria-label="Calidad JPEG del recorte"
                  />
                </div>
              )}
            </div>

            <Button type="button" onClick={handleCrop} disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Scissors className="size-4" aria-hidden />}
              {busy ? "Recortando..." : "Recortar imagen"}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && resultUrl && file && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              Recorte listo
            </CardTitle>
            <CardDescription>Puedes volver a ajustar el área y recortar de nuevo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <img
                src={resultUrl}
                alt="Vista previa del recorte"
                className="mx-auto block max-h-[50vh] w-auto max-w-full rounded-lg border object-contain"
              />
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">
                  {result.width} × {result.height} px · {formatBytes(result.blob.size)}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result.blob}
                filename={`${baseName(file.name)}-recorte.${format === "png" ? "png" : "jpg"}`}
                label="Descargar recorte"
                size="lg"
              />
              <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                <RefreshCw className="size-4" aria-hidden />
                Recortar otra imagen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
