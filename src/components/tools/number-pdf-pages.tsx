"use client";

import { useState } from "react";
import { FileText, ListOrdered, Loader2, TriangleAlert } from "lucide-react";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
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
import { Switch } from "@/components/ui/switch";

const ACCEPT = "application/pdf,.pdf";

type Position = "bottom-center" | "bottom-right" | "bottom-left" | "top-center" | "top-right" | "top-left";
type NumberFormat = "n" | "n-of-n" | "page-n-of-n";

const POSITION_OPTIONS: { value: Position; label: string }[] = [
  { value: "bottom-center", label: "Abajo centrado" },
  { value: "bottom-right", label: "Abajo a la derecha" },
  { value: "bottom-left", label: "Abajo a la izquierda" },
  { value: "top-center", label: "Arriba centrado" },
  { value: "top-right", label: "Arriba a la derecha" },
  { value: "top-left", label: "Arriba a la izquierda" },
];

const FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: "n", label: "1" },
  { value: "n-of-n", label: "1 / N" },
  { value: "page-n-of-n", label: "Página 1 de N" },
];

const NUMBER_COLOR = rgb(0x37 / 255, 0x41 / 255, 0x51 / 255);

function formatNumber(
  format: NumberFormat,
  current: number,
  total: number,
): string {
  if (format === "n") return `${current}`;
  if (format === "n-of-n") return `${current} / ${total}`;
  return `Página ${current} de ${total}`;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function baseName(name: string): string {
  const withoutExt = name.replace(/\.pdf$/i, "");
  return withoutExt.trim() || "documento";
}

/** Calcula la posición (x, y) del número según la esquina elegida. */
function positionFor(
  position: Position,
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  fontSize: number,
  margin: number,
): { x: number; y: number } {
  const [vertical, horizontal] = position.split("-");
  const x =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? pageWidth - textWidth - margin
        : (pageWidth - textWidth) / 2;
  const y = vertical === "top" ? pageHeight - fontSize - margin : margin;
  return { x, y };
}

export default function NumberPdfPagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState<Position>("bottom-center");
  const [format, setFormat] = useState<NumberFormat>("page-n-of-n");
  const [startNumber, setStartNumber] = useState("1");
  const [fontSize, setFontSize] = useState(11);
  const [margin, setMargin] = useState(24);
  const [skipFirst, setSkipFirst] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; filename: string; pages: number } | null>(null);

  const startNumberValue = Number(startNumber);
  const startNumberValid =
    Number.isInteger(startNumberValue) && startNumberValue >= 1 && startNumberValue <= 10000;

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
    if (!startNumberValid) {
      const message = "El número inicial debe ser un entero entre 1 y 10000.";
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
      const font: PDFFont = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      const total = pages.length;
      const startIndex = skipFirst ? 1 : 0;

      if (startIndex >= total) {
        const message =
          "El documento solo tiene una página, así que no hay páginas que numerar al saltar la primera.";
        setError(message);
        toast.error(message);
        return;
      }

      let current = startNumberValue;
      for (let index = startIndex; index < total; index++) {
        const page = pages[index];
        const { width, height } = page.getSize();
        const text = formatNumber(format, current, total);
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const { x, y } = positionFor(position, width, height, textWidth, fontSize, margin);
        page.drawText(text, { x, y, size: fontSize, font, color: NUMBER_COLOR });
        current += 1;
      }

      const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      setResult({
        blob,
        filename: `${baseName(file.name)}-numerado.pdf`,
        pages: total - startIndex,
      });
      toast.success("Números de página añadidos correctamente.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo numerar el PDF. Inténtalo de nuevo.";
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
    setPosition("bottom-center");
    setFormat("page-n-of-n");
    setStartNumber("1");
    setFontSize(11);
    setMargin(24);
    setSkipFirst(false);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="size-5 text-primary" aria-hidden />
            1. Sube tu PDF
          </CardTitle>
          <CardDescription>
            Se añaden los números directamente en el PDF, dentro de tu navegador.
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
          <CardTitle>2. Estilo de numeración</CardTitle>
          <CardDescription>
            Elige posición, formato y aspecto de los números de página.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="number-position">Posición</Label>
              <Select
                value={position}
                onValueChange={(value) => setPosition(value as Position)}
                disabled={processing}
              >
                <SelectTrigger id="number-position" className="w-full">
                  <SelectValue placeholder="Elige la posición" />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="number-format">Formato</Label>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as NumberFormat)}
                disabled={processing}
              >
                <SelectTrigger id="number-format" className="w-full">
                  <SelectValue placeholder="Elige el formato" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="number-start">Número inicial</Label>
              <Input
                id="number-start"
                type="number"
                min={1}
                max={10000}
                step={1}
                value={startNumber}
                onChange={(event) => setStartNumber(event.target.value)}
                disabled={processing}
                aria-invalid={!startNumberValid}
              />
              {!startNumberValid && (
                <p className="text-xs text-destructive">
                  Debe ser un entero entre 1 y 10000.
                </p>
              )}
            </div>

            <div className="flex items-end pb-1">
              <div className="flex items-center gap-3">
                <Switch
                  id="number-skip-first"
                  checked={skipFirst}
                  onCheckedChange={(checked) => setSkipFirst(checked)}
                  disabled={processing}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="number-skip-first" className="cursor-pointer font-normal">
                    Saltar la primera página
                  </Label>
                  <p className="text-xs text-muted-foreground">Útil si tu PDF tiene portada.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="number-size">Tamaño de fuente</Label>
              <span className="text-sm font-medium tabular-nums">{fontSize} pt</span>
            </div>
            <Slider
              id="number-size"
              min={8}
              max={24}
              step={1}
              value={[fontSize]}
              onValueChange={(values) => setFontSize(values[0] ?? 11)}
              disabled={processing}
              aria-label="Tamaño de la fuente de los números"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="number-margin">Margen desde el borde</Label>
              <span className="text-sm font-medium tabular-nums">{margin} pt</span>
            </div>
            <Slider
              id="number-margin"
              min={0}
              max={100}
              step={1}
              value={[margin]}
              onValueChange={(values) => setMargin(values[0] ?? 24)}
              disabled={processing}
              aria-label="Margen desde el borde de la página"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Numerar y descargar</CardTitle>
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
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-4" aria-hidden />
                {result.pages} {result.pages === 1 ? "página numerada" : "páginas numeradas"}.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <DownloadButton blob={result.blob} filename={result.filename} label="Descargar PDF" />
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Numerar otro archivo
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleProcess}
              disabled={!file || processing || !startNumberValid}
              className="w-full gap-2 sm:w-auto"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ListOrdered className="size-4" aria-hidden />
              )}
              {processing ? "Numerando…" : "Numerar páginas"}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
