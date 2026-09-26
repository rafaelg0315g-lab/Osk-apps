"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileOutput, Loader2, RefreshCw, Scissors } from "lucide-react";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { processFiles } from "@/lib/upload-client";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "application/pdf,.pdf";

type SplitMode = "ranges" | "all";

interface SplitResult {
  blob: Blob;
  filename: string;
  pageCount: number | null;
  originalSize: number;
  resultSize: number;
}

export default function SplitPdfTool() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<SplitMode>("ranges");
  const [ranges, setRanges] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SplitResult | null>(null);

  const handleFilesChange = (files: File[]) => {
    const next = files[0] ?? null;
    if (next) {
      const isPdf = next.type === "application/pdf" || next.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        toast.error(`"${next.name}" no es un archivo PDF.`);
        return;
      }
    }
    setFile(next);
    setResult(null);
    setError(null);
  };

  const handleModeChange = (value: string) => {
    setMode(value as SplitMode);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file || loading) return;
    if (mode === "ranges" && ranges.trim() === "") {
      const message = "Indica las páginas que quieres extraer. Ejemplo: 1-3, 5, 8-";
      setError(message);
      toast.error(message);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      if (mode === "ranges") {
        form.append("ranges", ranges);
      }
      const { blob, filename, headers } = await processFiles("/api/tools/split-pdf", form);
      const pageCount = Number(headers.get("X-Page-Count"));
      setResult({
        blob,
        filename,
        pageCount: Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null,
        originalSize: Number(headers.get("X-Original-Size")) || file.size,
        resultSize: Number(headers.get("X-Result-Size")) || blob.size,
      });
      toast.success(mode === "ranges" ? "Páginas extraídas correctamente." : "PDF separado por páginas.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo dividir el PDF.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setRanges("");
    setMode("ranges");
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="size-5 text-primary" aria-hidden />
            1. Sube tu PDF
          </CardTitle>
          <CardDescription>
            Extrae un rango de páginas o separa el documento completo, página a página. El archivo
            se procesa en el servidor y nunca se guarda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            files={file ? [file] : []}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            maxSizeMB={20}
            disabled={loading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileOutput className="size-5 text-primary" aria-hidden />
            2. Elige cómo dividir
          </CardTitle>
          <CardDescription>Puedes extraer páginas concretas o separarlas todas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="grid w-full grid-cols-2 sm:w-auto">
              <TabsTrigger value="ranges">Extraer rango</TabsTrigger>
              <TabsTrigger value="all">Separar todas las páginas</TabsTrigger>
            </TabsList>

            <TabsContent value="ranges" className="space-y-2 pt-2">
              <Label htmlFor="ranges-input">Páginas a extraer</Label>
              <Input
                id="ranges-input"
                value={ranges}
                onChange={(event) => setRanges(event.target.value)}
                placeholder="Ej: 1-3, 5, 8-"
                disabled={loading}
                inputMode="text"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Separa los valores con comas. Usa un guion para un intervalo (1-3) o un guion
                abierto para llegar hasta el final (8-). Se generará un PDF con esas páginas.
              </p>
            </TabsContent>

            <TabsContent value="all" className="space-y-2 pt-2">
              <p className="text-sm text-muted-foreground">
                Se generará un PDF independiente por cada página del documento, empaquetados en un
                archivo ZIP listo para descargar (pagina-1.pdf, pagina-2.pdf, ...).
              </p>
            </TabsContent>
          </Tabs>

          <Button
            type="button"
            onClick={handleProcess}
            disabled={!file || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Scissors className="size-4" aria-hidden />
            )}
            {loading ? "Dividiendo..." : "Dividir PDF"}
          </Button>

          {error && !result && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <p className="text-sm font-medium">
                  {mode === "ranges"
                    ? `Se extrajeron ${
                        result.pageCount !== null ? `${result.pageCount} ` : ""
                      }páginas en un nuevo PDF.`
                    : `ZIP generado con ${
                        result.pageCount !== null ? `${result.pageCount} ` : ""
                      }páginas separadas.`}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatBytes(result.originalSize)} de entrada &rarr; {formatBytes(result.resultSize)}{" "}
                de resultado.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <DownloadButton
                  blob={result.blob}
                  filename={result.filename}
                  label={mode === "ranges" ? "Descargar PDF" : "Descargar ZIP"}
                  size="lg"
                />
                <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                  <RefreshCw className="size-4" aria-hidden />
                  Dividir otro PDF
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
