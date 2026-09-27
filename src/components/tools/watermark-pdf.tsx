"use client";

import { useState } from "react";
import { Droplets, Loader2, TriangleAlert } from "lucide-react";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import { toast } from "sonner";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const ACCEPT = "application/pdf,.pdf";

type Layout = "mosaic" | "center";

const ANGLE = -45;

interface WatermarkResult {
  blob: Blob;
  filename: string;
  pages: number;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function baseName(name: string): string {
  const withoutExt = name.replace(/\.pdf$/i, "");
  return withoutExt.trim() || "documento";
}

/** Convierte un color hexadecimal (#rrggbb o #rgb) a los componentes 0-1 de pdf-lib. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value) || full.length !== 6) {
    return { r: 0x6b / 255, g: 0x72 / 255, b: 0x80 / 255 };
  }
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

/** Comprueba que el texto se pueda codificar con la fuente estándar del PDF. */
function assertEncodable(font: PDFFont, text: string): void {
  try {
    font.encodeText(text);
  } catch {
    throw new Error(
      "El texto contiene caracteres no compatibles con la fuente estándar del PDF (por ejemplo, emojis o alfabetos no latinos). Usa letras, números y signos comunes.",
    );
  }
}

/** Dibuja el texto repetido en mosaico cubriendo toda la página. */
function drawMosaic(
  page: ReturnType<PDFDocument["getPages"]>[number],
  text: string,
  font: PDFFont,
  size: number,
  opacity: number,
  color: { r: number; g: number; b: number },
): void {
  const { width, height } = page.getSize();
  const textWidth = font.widthOfTextAtSize(text, size);
  const textHeight = font.heightAtSize(size);
  const stepX = Math.max(textWidth + size * 2, size);
  const stepY = Math.max(textHeight + size * 2.5, size);
  const columns = Math.ceil((width + 2 * stepX) / stepX);
  const rows = Math.ceil((height + 2 * stepY) / stepY);

  for (let row = -1; row <= rows; row++) {
    const y = row * stepY;
    const offset = row % 2 === 0 ? 0 : stepX / 2;
    for (let column = -1; column <= columns; column++) {
      const x = column * stepX + offset;
      page.drawText(text, {
        x,
        y,
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(ANGLE),
      });
    }
  }
}

export default function WatermarkPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("CONFIDENCIAL");
  const [fontSize, setFontSize] = useState(60);
  const [opacity, setOpacity] = useState(0.15);
  const [color, setColor] = useState("#6b7280");
  const [layout, setLayout] = useState<Layout>("mosaic");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WatermarkResult | null>(null);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (next && !isPdfFile(next)) {
      toast.error(`"${next.name}" no es un archivo PDF.`);
      return;
    }
    setFile(next);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file || processing) return;
    if (!isPdfFile(file)) {
      const message = "El archivo seleccionado no es un PDF válido.";
      setError(message);
      toast.error(message);
      return;
    }
    if (!text.trim()) {
      const message = "Escribe el texto de la marca de agua.";
      setError(message);
      toast.error(message);
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const doc = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const watermarkText = text.trim();
      assertEncodable(font, watermarkText);
      const rgbColor = hexToRgb(color);
      const pages = doc.getPages();

      for (const page of pages) {
        const { width, height } = page.getSize();
        const drawOptions = {
          size: fontSize,
          font,
          color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
          opacity,
          rotate: degrees(ANGLE),
        };

        if (layout === "center") {
          // Coloca el punto medio del texto rotado en el centro de la página.
          const radians = (ANGLE * Math.PI) / 180;
          const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
          const x = width / 2 - (textWidth / 2) * Math.cos(radians);
          const y = height / 2 - (textWidth / 2) * Math.sin(radians);
          page.drawText(watermarkText, { ...drawOptions, x, y });
        } else {
          drawMosaic(page, watermarkText, font, fontSize, opacity, rgbColor);
        }
      }

      const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      setResult({
        blob,
        filename: `${baseName(file.name)}-marca-de-agua.pdf`,
        pages: pages.length,
      });
      toast.success("Marca de agua aplicada correctamente.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo aplicar la marca de agua. Inténtalo de nuevo.";
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setText("CONFIDENCIAL");
    setFontSize(60);
    setOpacity(0.15);
    setColor("#6b7280");
    setLayout("mosaic");
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="size-5 text-primary" aria-hidden />
            1. Sube tu PDF
          </CardTitle>
          <CardDescription>
            La marca de agua se aplica en tu navegador; el documento no se sube a ningún servidor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
            disabled={processing}
            hint="Solo archivos PDF · Máx. 20 MB"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Diseño de la marca</CardTitle>
          <CardDescription>
            Inclinación fija de 45° hacia arriba, en todas las páginas del documento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="watermark-text">Texto de la marca</Label>
            <Input
              id="watermark-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ej: CONFIDENCIAL"
              autoComplete="off"
              maxLength={80}
              disabled={processing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="watermark-layout">Disposición</Label>
            <Select
              value={layout}
              onValueChange={(value) => setLayout(value as Layout)}
              disabled={processing}
            >
              <SelectTrigger id="watermark-layout" className="w-full">
                <SelectValue placeholder="Elige la disposición" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mosaic">Mosaico (repetido en toda la página)</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="watermark-size">Tamaño de fuente</Label>
              <span className="text-sm font-medium tabular-nums">{fontSize} pt</span>
            </div>
            <Slider
              id="watermark-size"
              min={24}
              max={120}
              step={1}
              value={[fontSize]}
              onValueChange={(values) => setFontSize(values[0] ?? 60)}
              disabled={processing}
              aria-label="Tamaño de la fuente de la marca de agua"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="watermark-opacity">Opacidad</Label>
              <span className="text-sm font-medium tabular-nums">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <Slider
              id="watermark-opacity"
              min={0.05}
              max={1}
              step={0.05}
              value={[opacity]}
              onValueChange={(values) => setOpacity(values[0] ?? 0.15)}
              disabled={processing}
              aria-label="Opacidad de la marca de agua"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="watermark-color">Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="watermark-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-10 w-14 cursor-pointer p-1"
                disabled={processing}
              />
              <span className="font-mono text-xs text-muted-foreground uppercase">{color}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Aplicar y descargar</CardTitle>
          <CardDescription>El PDF original no se modifica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result ? (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Marca aplicada en {result.pages}{" "}
                {result.pages === 1 ? "página" : "páginas"}.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <DownloadButton blob={result.blob} filename={result.filename} label="Descargar PDF" />
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Marcar otro archivo
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleProcess}
              disabled={!file || processing || !text.trim()}
              className="w-full gap-2 sm:w-auto"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Droplets className="size-4" aria-hidden />
              )}
              {processing ? "Aplicando…" : "Aplicar marca de agua"}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
