"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileStack, Loader2, RefreshCw } from "lucide-react";

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
import { processFiles } from "@/lib/upload-client";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "application/pdf,.pdf";
const MAX_FILES = 15;

interface MergeResult {
  blob: Blob;
  filename: string;
  totalInputSize: number;
  resultSize: number;
}

export default function MergePdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MergeResult | null>(null);

  const handleFilesChange = (incoming: File[]) => {
    const valid: File[] = [];
    for (const file of incoming) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        toast.error(`"${file.name}" no es un archivo PDF.`);
        continue;
      }
      valid.push(file);
    }
    setFiles(valid);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (files.length < 2 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of files) {
        form.append("files", file);
      }
      const { blob, filename, headers } = await processFiles("/api/tools/merge-pdf", form);
      const totalInputSize = files.reduce((sum, file) => sum + file.size, 0);
      setResult({
        blob,
        filename,
        totalInputSize,
        resultSize: Number(headers.get("X-Result-Size")) || blob.size,
      });
      toast.success("PDF combinados correctamente.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron combinar los PDF.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setResult(null);
    setError(null);
  };

  const totalInputSize = files.reduce((sum, file) => sum + file.size, 0);
  const readyLabel =
    files.length === 0
      ? "Añade al menos 2 archivos PDF para empezar."
      : files.length === 1
        ? "Añade otro PDF para poder combinar."
        : `${files.length} PDF listos para combinar en el orden mostrado.`;

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="size-5 text-primary" aria-hidden />
            1. Sube tus PDF
          </CardTitle>
          <CardDescription>
            Los PDF se combinarán en el orden mostrado. Puedes reordenarlos con las flechas antes de
            procesar. Máximo {MAX_FILES} archivos de 20 MB cada uno.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone
            files={files}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            multiple
            maxFiles={MAX_FILES}
            reorderable
            disabled={loading}
            hint="o haz clic para seleccionar varios PDF"
          />
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary">{files.length} / {MAX_FILES}</Badge>
            <p className="text-sm text-muted-foreground">{readyLabel}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2
              className={loading ? "size-5 animate-spin text-primary" : "size-5 text-primary"}
              aria-hidden
            />
            2. Combinar
          </CardTitle>
          <CardDescription>
            Se generará un único documento con todas las páginas, en el mismo orden de la lista.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={handleProcess}
            disabled={files.length < 2 || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileStack className="size-4" aria-hidden />
            )}
            {loading ? "Combinando..." : "Combinar PDF"}
          </Button>

          {error && !result && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className="size-5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <p className="text-sm font-medium">
                  Documento combinado con {files.length} PDF ({formatBytes(totalInputSize)} de
                  entrada, {formatBytes(result.resultSize)} de resultado).
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <DownloadButton
                  blob={result.blob}
                  filename={result.filename}
                  label="Descargar PDF combinado"
                  size="lg"
                />
                <Button type="button" variant="outline" onClick={handleReset} className="gap-2">
                  <RefreshCw className="size-4" aria-hidden />
                  Combinar otros PDF
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
