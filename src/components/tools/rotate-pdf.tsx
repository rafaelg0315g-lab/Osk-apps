"use client";

import { useState } from "react";
import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { PDFDocument, degrees } from "pdf-lib";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,.pdf";

type Angle = 90 | 180 | 270;
type Target = "all" | "range";

interface RotateResult {
  blob: Blob;
  filename: string;
  rotatedPages: number;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function baseName(name: string): string {
  const withoutExt = name.replace(/\.pdf$/i, "");
  return withoutExt.trim() || "documento";
}

/**
 * Interpreta una lista de páginas 1-based como "1-3, 5".
 * Devuelve índices 1-based, únicos y ordenados.
 */
function parsePageList(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Indica las páginas. Ejemplo: 1-3, 5");
  }

  const pages: number[] = [];
  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page < 1) throw new Error("Las páginas se numeran desde 1.");
      if (page > pageCount) {
        throw new Error(`El documento solo tiene ${pageCount} páginas.`);
      }
      pages.push(page);
    } else if (/^\d+\s*-\s*\d+$/.test(part)) {
      const [startRaw, endRaw] = part.split("-");
      const start = Number(startRaw.trim());
      const end = Number(endRaw.trim());
      if (start < 1 || end < 1) throw new Error("Las páginas se numeran desde 1.");
      if (start > pageCount || end > pageCount) {
        throw new Error(`El documento solo tiene ${pageCount} páginas.`);
      }
      const from = Math.min(start, end);
      const to = Math.max(start, end);
      for (let page = from; page <= to; page++) pages.push(page);
    } else {
      throw new Error(`No se entendió "${part}". Usa números o rangos como 1-3, 5.`);
    }
  }

  if (pages.length === 0) {
    throw new Error("Indica al menos una página. Ejemplo: 1-3, 5");
  }
  return Array.from(new Set(pages)).sort((a, b) => a - b);
}

const ANGLES: Angle[] = [90, 180, 270];

export default function RotatePdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [angle, setAngle] = useState<Angle>(90);
  const [target, setTarget] = useState<Target>("all");
  const [rangeInput, setRangeInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RotateResult | null>(null);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    setResult(null);
    setError(null);
    setPageCount(null);
    if (next) {
      if (!isPdfFile(next)) {
        toast.error(`"${next.name}" no es un archivo PDF.`);
        return;
      }
    }
    setFile(next);
    if (!next) return;

    // Lee el número de páginas en el navegador para mostrar la vista previa.
    void (async () => {
      try {
        const buffer = await next.arrayBuffer();
        const doc = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
        setPageCount(doc.getPageCount());
      } catch {
        toast.error(
          "No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.",
        );
        setFile(null);
      }
    })();
  };

  const handleProcess = async () => {
    if (!file || processing) return;
    if (!isPdfFile(file)) {
      const message = "El archivo seleccionado no es un PDF válido.";
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
      const total = doc.getPageCount();

      let targetPages: number[];
      if (target === "all") {
        targetPages = Array.from({ length: total }, (_, index) => index + 1);
      } else {
        targetPages = parsePageList(rangeInput, total);
      }

      for (const pageNumber of targetPages) {
        const page = doc.getPage(pageNumber - 1);
        const current = page.getRotation().angle;
        // Suma el ángulo elegido a la rotación existente, en módulo 360.
        const nextRotation = (((current + angle) % 360) + 360) % 360;
        page.setRotation(degrees(nextRotation));
      }

      const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      setResult({
        blob,
        filename: `${baseName(file.name)}-rotado.pdf`,
        rotatedPages: targetPages.length,
      });
      toast.success(
        `${targetPages.length} ${targetPages.length === 1 ? "página rotada" : "páginas rotadas"} ${angle}°.`,
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo rotar el PDF. Inténtalo de nuevo.";
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPageCount(null);
    setResult(null);
    setError(null);
    setRangeInput("");
    setTarget("all");
    setAngle(90);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCw className="size-5 text-primary" aria-hidden />
            1. Sube tu PDF
          </CardTitle>
          <CardDescription>
            Rotación 100% local: tu documento nunca sale del navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
            disabled={processing}
            hint="Solo archivos PDF · Máx. 20 MB"
          />
          {pageCount !== null && (
            <p className="text-sm text-muted-foreground">
              El documento tiene <span className="font-medium text-foreground">{pageCount}</span>{" "}
              {pageCount === 1 ? "página" : "páginas"}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Elige el giro</CardTitle>
          <CardDescription>
            El giro se suma a la rotación que ya tengan las páginas del documento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Ángulo de rotación (sentido horario)</Label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Ángulo de rotación">
              {ANGLES.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  aria-pressed={angle === option}
                  disabled={processing}
                  onClick={() => setAngle(option)}
                  className={cn(
                    "gap-1.5",
                    angle === option && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  <RotateCw className="size-4" aria-hidden />
                  {option}°
                </Button>
              ))}
            </div>
          </div>

          <RadioGroup
            value={target}
            onValueChange={(value) => setTarget(value as Target)}
            className="gap-3"
            disabled={processing}
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="all" id="rotate-all" className="mt-0.5" />
              <div className="space-y-1">
                <Label htmlFor="rotate-all" className="cursor-pointer font-normal">
                  Todas las páginas
                </Label>
                {pageCount !== null && (
                  <p className="text-xs text-muted-foreground">
                    Se rotarán las {pageCount} {pageCount === 1 ? "página" : "páginas"} del
                    documento.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="range" id="rotate-range" className="mt-0.5" />
              <div className="flex-1 space-y-2">
                <Label htmlFor="rotate-range" className="cursor-pointer font-normal">
                  Solo un rango de páginas
                </Label>
                {target === "range" && (
                  <Input
                    id="rotate-range-input"
                    value={rangeInput}
                    onChange={(event) => setRangeInput(event.target.value)}
                    placeholder="Ej: 1-3, 5"
                    inputMode="text"
                    autoComplete="off"
                    disabled={processing}
                    aria-describedby="rotate-range-help"
                  />
                )}
                <p id="rotate-range-help" className="text-xs text-muted-foreground">
                  {target === "range"
                    ? "Numera las páginas desde 1. Puedes combinar números y rangos separados por comas."
                    : "Ejemplo: páginas 1-3 y 5."}
                </p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Rotar y descargar</CardTitle>
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
                {result.rotatedPages}{" "}
                {result.rotatedPages === 1 ? "página rotada" : "páginas rotadas"} al PDF nuevo.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <DownloadButton blob={result.blob} filename={result.filename} label="Descargar PDF" />
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Rotar otro archivo
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleProcess}
              disabled={!file || processing}
              className="w-full gap-2 sm:w-auto"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="size-4" aria-hidden />
              )}
              {processing ? "Rotando…" : "Rotar PDF"}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
