"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Columns2,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Rows2,
  Table,
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
import { cn, formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
      reject(new Error(`No se pudo leer "${file.name}". El archivo puede estar dañado.`));
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

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Template {
  id: string;
  label: string;
  hint: string;
  /** Relativo ancho/alto del lienzo final. */
  aspect: number;
  minImages: number;
  cells: Cell[];
}

const TEMPLATES: Template[] = [
  {
    id: "row2",
    label: "2 en fila",
    hint: "Dos imágenes una al lado de la otra",
    aspect: 2,
    minImages: 2,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: "col2",
    label: "2 en columna",
    hint: "Dos imágenes apiladas verticalmente",
    aspect: 0.5,
    minImages: 2,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: "big3",
    label: "3 (1 grande + 2)",
    hint: "Una imagen grande a la izquierda y dos apiladas a la derecha",
    aspect: 1,
    minImages: 3,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "grid2x2",
    label: "Cuadrícula 2x2",
    hint: "Cuatro imágenes en dos filas y dos columnas",
    aspect: 1,
    minImages: 4,
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: "grid3x2",
    label: "Cuadrícula 3x2",
    hint: "Seis imágenes en tres columnas y dos filas",
    aspect: 1.5,
    minImages: 6,
    cells: Array.from({ length: 6 }, (_, j) => ({
      x: (j % 3) / 3,
      y: Math.floor(j / 3) / 2,
      w: 1 / 3,
      h: 0.5,
    })),
  },
];

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  row2: <Columns2 className="size-4" aria-hidden />,
  col2: <Rows2 className="size-4" aria-hidden />,
  big3: <LayoutDashboard className="size-4" aria-hidden />,
  grid2x2: <LayoutGrid className="size-4" aria-hidden />,
  grid3x2: <Table className="size-4" aria-hidden />,
};

interface CollageResult {
  blob: Blob;
  width: number;
  height: number;
}

export default function CollageTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [imgs, setImgs] = useState<HTMLImageElement[]>([]);
  const [imgsLoading, setImgsLoading] = useState(false);
  const [templateId, setTemplateId] = useState("row2");
  const [gap, setGap] = useState(24);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [radius, setRadius] = useState(0);
  const [size, setSize] = useState<"1000" | "1500" | "2000">("1500");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(90);
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<CollageResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const genRef = useRef(0);
  const loadTokenRef = useRef(0);

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  const handleFilesChange = (next: File[]) => {
    for (const f of next) {
      if (f.type && !ALLOWED_TYPES.has(f.type)) {
        toast.error(`"${f.name}" no es una imagen compatible. Usa JPEG, PNG o WebP.`);
        return;
      }
    }
    setFiles(next);
    setResult(null);
    const token = ++loadTokenRef.current;
    if (next.length === 0) {
      setImgs([]);
      setImgsLoading(false);
      return;
    }
    setImgsLoading(true);
    void (async () => {
      try {
        const loaded = await Promise.all(next.map(loadImageFromFile));
        if (loadTokenRef.current !== token) return;
        setImgs(loaded);
      } catch (err) {
        if (loadTokenRef.current === token) {
          toast.error(errMessage(err, "No se pudo leer una de las imágenes."));
          setImgs([]);
        }
      } finally {
        if (loadTokenRef.current === token) setImgsLoading(false);
      }
    })();
  };

  const buildCollage = useCallback(
    async (gen: number) => {
      const canvas = canvasRef.current;
      if (!canvas || imgs.length === 0 || imgs.length < template.minImages) return;
      setBuilding(true);
      try {
        const outSize = Number.parseInt(size, 10);
        const W = template.aspect >= 1 ? outSize : Math.round(outSize * template.aspect);
        const H = template.aspect >= 1 ? Math.round(outSize / template.aspect) : outSize;
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No se pudo preparar el lienzo del collage.");
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, W, H);

        template.cells.forEach((cell, i) => {
          const image = imgs[i];
          if (!image) return;
          const cx = cell.x * W + gap / 2;
          const cy = cell.y * H + gap / 2;
          const cw = Math.max(1, cell.w * W - gap);
          const ch = Math.max(1, cell.h * H - gap);
          const iw = image.naturalWidth;
          const ih = image.naturalHeight;
          const scale = Math.max(cw / iw, ch / ih);
          const dw = iw * scale;
          const dh = ih * scale;
          const dx = cx + (cw - dw) / 2;
          const dy = cy + (ch - dh) / 2;
          ctx.save();
          if (radius > 0) {
            roundedRectPath(ctx, cx, cy, cw, ch, radius);
            ctx.clip();
          }
          ctx.drawImage(image, dx, dy, dw, dh);
          ctx.restore();
        });

        const mime = format === "png" ? "image/png" : "image/jpeg";
        const blob = await canvasToBlob(canvas, mime, quality / 100);
        if (genRef.current !== gen) return;
        setResult({ blob, width: W, height: H });
      } catch (err) {
        if (genRef.current === gen) {
          toast.error(errMessage(err, "No se pudo generar el collage."));
        }
      } finally {
        if (genRef.current === gen) setBuilding(false);
      }
    },
    [imgs, template, size, bgColor, gap, radius, format, quality],
  );

  // Reconstruye el collage (con debounce) al cambiar cualquier parámetro.
  useEffect(() => {
    if (imgs.length === 0 || imgs.length < template.minImages) return;
    const gen = ++genRef.current;
    const timer = setTimeout(() => {
      void buildCollage(gen);
    }, 250);
    return () => clearTimeout(timer);
  }, [imgs, template, size, bgColor, gap, radius, format, quality, buildCollage]);

  const handleReset = () => {
    setFiles([]);
    setImgs([]);
    setResult(null);
    setTemplateId("row2");
    setGap(24);
    setBgColor("#ffffff");
    setRadius(0);
    setSize("1500");
    setFormat("png");
    setQuality(90);
  };

  const enoughImages = imgs.length >= template.minImages;
  const outExt = MIME_EXT[format === "png" ? "image/png" : "image/jpeg"];

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-5 text-primary" aria-hidden />
            1. Sube tus imágenes (2 a 6)
          </CardTitle>
          <CardDescription>
            Acepta imágenes JPEG, PNG y WebP de hasta 20 MB cada una. Reordénalas con las flechas:
            el orden define cómo se colocan en el collage. Todo se genera en tu navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            files={files}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            multiple
            maxFiles={6}
            maxSizeMB={20}
            reorderable
            hint="o haz clic para seleccionar varias imágenes"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="size-5 text-primary" aria-hidden />
            2. Plantilla y estilo
          </CardTitle>
          <CardDescription>
            Elige cómo se distribuyen las imágenes y ajusta la separación, el fondo y las esquinas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Plantilla</Label>
              <Select value={templateId} onValueChange={(value) => {
                setTemplateId(value);
                setResult(null);
              }}>
                <SelectTrigger className="w-full" aria-label="Plantilla del collage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        {TEMPLATE_ICONS[t.id]}
                        <span>
                          {t.label}
                          <span className="block text-xs text-muted-foreground">{t.hint}</span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Esta plantilla necesita al menos {template.minImages} imágenes.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tamaño de salida</Label>
              <Select value={size} onValueChange={(value) => setSize(value as "1000" | "1500" | "2000")}>
                <SelectTrigger className="w-full" aria-label="Tamaño de salida">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1000">1000 px (lado mayor)</SelectItem>
                  <SelectItem value="1500">1500 px (lado mayor)</SelectItem>
                  <SelectItem value="2000">2000 px (lado mayor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="collage-gap">Separación</Label>
                <span className="text-sm font-medium tabular-nums">{gap} px</span>
              </div>
              <Slider
                id="collage-gap"
                min={0}
                max={60}
                step={1}
                value={[gap]}
                onValueChange={(values) => setGap(values[0] ?? gap)}
                aria-label="Separación entre imágenes"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="collage-radius">Radio de esquinas</Label>
                <span className="text-sm font-medium tabular-nums">{radius} px</span>
              </div>
              <Slider
                id="collage-radius"
                min={0}
                max={40}
                step={1}
                value={[radius]}
                onValueChange={(values) => setRadius(values[0] ?? radius)}
                aria-label="Radio de las esquinas de cada celda"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="collage-bg">Color de fondo</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="collage-bg"
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                aria-label="Color de fondo del collage"
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBgColor("#ffffff")}
                className="gap-1.5"
              >
                <span className="block size-3 rounded-sm border bg-white" aria-hidden />
                Blanco
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBgColor("#000000")}
                className="gap-1.5"
              >
                <span className="block size-3 rounded-sm bg-black" aria-hidden />
                Negro
              </Button>
              <span className="font-mono text-xs text-muted-foreground">{bgColor}</span>
            </div>
          </div>

          {files.length > 0 && imgsLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Cargando imágenes...
            </p>
          )}
          {files.length > 0 && !imgsLoading && !enoughImages && (
            <p className="text-sm text-amber-600 dark:text-amber-400" role="status">
              La plantilla {template.label} necesita al menos {template.minImages} imágenes y tienes{" "}
              {imgs.length}. Añade más o cambia de plantilla.
            </p>
          )}
          {building && enoughImages && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Generando collage...
            </p>
          )}
        </CardContent>
      </Card>

      {imgs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result && !building ? (
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <Layers className="size-5 text-primary" aria-hidden />
              )}
              3. Vista previa
            </CardTitle>
            <CardDescription>
              Cada imagen se recorta al centro (tipo cubrir) para llenar su celda sin deformarse.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                aria-label="Vista previa del collage"
                className={cn(
                  "block h-auto max-h-[60vh] w-auto max-w-full rounded-lg border bg-muted",
                  !enoughImages && "hidden",
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Formato de descarga</Label>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as "png" | "jpeg")}
                >
                  <SelectTrigger className="w-full" aria-label="Formato de descarga">
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
                    <Label htmlFor="collage-quality">Calidad</Label>
                    <span className="text-sm font-medium tabular-nums">{quality}%</span>
                  </div>
                  <Slider
                    id="collage-quality"
                    min={1}
                    max={100}
                    step={1}
                    value={[quality]}
                    onValueChange={(values) => setQuality(values[0] ?? quality)}
                    aria-label="Calidad JPEG del collage"
                  />
                </div>
              )}
            </div>

            {result && !building && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {result.width} × {result.height} px · {formatBytes(result.blob.size)}
                </Badge>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <DownloadButton
                blob={result && !building ? result.blob : null}
                filename={`collage.${outExt}`}
                label="Descargar collage"
                size="lg"
                disabled={!enoughImages || building}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                className="gap-2"
                disabled={building}
              >
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
