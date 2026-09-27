"use client";

import { useMemo, useState } from "react";
import { FileX, Loader2, TriangleAlert } from "lucide-react";
import { PDFDocument } from "pdf-lib";
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
import { cn } from "@/lib/utils";

const ACCEPT = "application/pdf,.pdf";

interface DeleteResult {
  blob: Blob;
  filename: string;
  remaining: number;
  deleted: number;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function baseName(name: string): string {
  const withoutExt = name.replace(/\.pdf$/i, "");
  return withoutExt.trim() || "documento";
}

/**
 * Interpreta una lista de páginas 1-based como "1-3, 5, 8-"
 * (el rango abierto llega hasta la última página).
 * Devuelve índices 1-based, únicos y ordenados.
 */
function parsePageList(input: string, pageCount: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Indica las páginas a eliminar. Ejemplo: 1-3, 5, 8-");
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
    } else if (/^\d+\s*-\s*$/.test(part)) {
      const start = Number(part.replace(/-$/, "").trim());
      if (start < 1) throw new Error("Las páginas se numeran desde 1.");
      if (start > pageCount) {
        throw new Error(`El documento solo tiene ${pageCount} páginas.`);
      }
      for (let page = start; page <= pageCount; page++) pages.push(page);
    } else {
      throw new Error(`No se entendió "${part}". Usa números o rangos como 1-3, 5, 8-`);
    }
  }

  if (pages.length === 0) {
    throw new Error("Indica al menos una página. Ejemplo: 1-3, 5, 8-");
  }
  return Array.from(new Set(pages)).sort((a, b) => a - b);
}

export default function DeletePdfPagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pagesInput, setPagesInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteResult | null>(null);

  // Validación en vivo de los rangos introducidos.
  const rangeCheck = useMemo<{ pages: number[]; error: string | null }>(() => {
    if (pageCount === null || pagesInput.trim() === "") {
      return { pages: [], error: null };
    }
    try {
      return { pages: parsePageList(pagesInput, pageCount), error: null };
    } catch (err) {
      return {
        pages: [],
        error: err instanceof Error ? err.message : "Entrada no válida.",
      };
    }
  }, [pagesInput, pageCount]);

  const deletesEverything =
    pageCount !== null && rangeCheck.pages.length > 0 && rangeCheck.pages.length >= pageCount;

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

    // Lee el número de páginas en el navegador para validar los rangos.
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
    if (!file || processing || pageCount === null) return;
    if (!isPdfFile(file)) {
      const message = "El archivo seleccionado no es un PDF válido.";
      setError(message);
      toast.error(message);
      return;
    }

    let pagesToDelete: number[];
    try {
      pagesToDelete = parsePageList(pagesInput, pageCount);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Entrada no válida.";
      setError(message);
      toast.error(message);
      return;
    }

    if (pagesToDelete.length >= pageCount) {
      const message = "No puedes eliminar todas las páginas del documento.";
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
      const deleteSet = new Set(pagesToDelete.map((page) => page - 1));
      // Se eliminan de atrás hacia delante para que los índices sigan siendo válidos.
      for (let index = doc.getPageCount() - 1; index >= 0; index--) {
        if (deleteSet.has(index)) {
          doc.removePage(index);
        }
      }

      const bytes = await doc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      setResult({
        blob,
        filename: `${baseName(file.name)}-paginas-eliminadas.pdf`,
        remaining: pageCount - pagesToDelete.length,
        deleted: pagesToDelete.length,
      });
      toast.success(
        `${pagesToDelete.length} ${pagesToDelete.length === 1 ? "página eliminada" : "páginas eliminadas"}.`,
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo eliminar las páginas. Inténtalo de nuevo.";
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPageCount(null);
    setPagesInput("");
    setResult(null);
    setError(null);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileX className="size-5 text-primary" aria-hidden />
            1. Sube tu PDF
          </CardTitle>
          <CardDescription>
            El documento se procesa en tu navegador y nunca se sube a ningún servidor.
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
            <p className="text-sm text-muted-foreground" aria-live="polite">
              El documento tiene{" "}
              <span className="font-medium text-foreground">{pageCount}</span>{" "}
              {pageCount === 1 ? "página" : "páginas"}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Páginas a eliminar</CardTitle>
          <CardDescription>
            Numera las páginas desde 1. Puedes usar números sueltos, rangos cerrados (1-3) o
            abiertos hasta el final (8-).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="delete-pages">Páginas a eliminar</Label>
            <Input
              id="delete-pages"
              value={pagesInput}
              onChange={(event) => setPagesInput(event.target.value)}
              placeholder="Ej: 1-3, 5, 8-"
              autoComplete="off"
              disabled={processing || pageCount === null}
              aria-describedby="delete-pages-help"
              aria-invalid={rangeCheck.error !== null}
            />
            <p id="delete-pages-help" className="text-xs text-muted-foreground">
              Separadas por comas. El resto de páginas se mantiene intacto y en el mismo orden.
            </p>
          </div>

          {rangeCheck.error !== null && (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden />
              <AlertDescription>{rangeCheck.error}</AlertDescription>
            </Alert>
          )}

          {rangeCheck.error === null && rangeCheck.pages.length > 0 && pageCount !== null && (
            <p
              className={cn(
                "text-sm",
                deletesEverything ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {deletesEverything
                ? "Con esta selección el documento quedaría vacío: no puedes eliminar todas las páginas."
                : `Se eliminarán ${rangeCheck.pages.length} ${
                    rangeCheck.pages.length === 1 ? "página" : "páginas"
                  } y quedarán ${pageCount - rangeCheck.pages.length}.`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Eliminar y descargar</CardTitle>
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
                Nuevo PDF con {result.remaining}{" "}
                {result.remaining === 1 ? "página" : "páginas"} ({result.deleted}{" "}
                {result.deleted === 1 ? "eliminada" : "eliminadas"}).
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <DownloadButton blob={result.blob} filename={result.filename} label="Descargar PDF" />
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Editar otro archivo
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleProcess}
              disabled={
                !file || processing || pageCount === null || rangeCheck.pages.length === 0
              }
              className="w-full gap-2 sm:w-auto"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileX className="size-4" aria-hidden />
              )}
              {processing ? "Eliminando…" : "Eliminar páginas"}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
