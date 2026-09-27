"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib-plus-encrypt";
import { Eye, EyeOff, Loader2, ShieldX, Unlock } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const MAX_FILE_MB = 20;
const MAX_RENDER_DIMENSION = 2000; // píxeles máximo por lado al reconstruir
const JPEG_QUALITY = 0.92;

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/** Comprueba si el PDF está cifrado (lanza error si el archivo no es válido). */
async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes.slice());
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/encrypted/i.test(message)) return true;
    throw new Error("El archivo podría estar dañado o no ser un PDF válido.");
  }
}

/** Reconstruye el PDF sin cifrado renderizando cada página a imagen. */
async function rebuildWithoutEncryption(
  data: Uint8Array,
  password: string,
  onProgress: (percent: number, label: string) => void,
): Promise<Uint8Array> {
  let task: pdfjsLib.PDFDocumentLoadingTask;
  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    task = pdfjsLib.getDocument({
      data,
      password: password || undefined,
    });
    doc = await task.promise;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") {
      throw new Error("Contraseña incorrecta o PDF no soportado.");
    }
    throw new Error("No se pudo abrir el PDF cifrado.");
  }

  try {
    const newDoc = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.max(
        1,
        Math.min(
          2,
          MAX_RENDER_DIMENSION / Math.max(baseViewport.width, baseViewport.height),
        ),
      );
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar el lienzo de renderizado.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, viewport }).promise;
      const jpegBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
      if (!jpegBlob) throw new Error("No se pudo generar la imagen de la página.");

      const image = await newDoc.embedJpg(await jpegBlob.arrayBuffer());
      const newPage = newDoc.addPage([baseViewport.width, baseViewport.height]);
      newPage.drawImage(image, {
        x: 0,
        y: 0,
        width: baseViewport.width,
        height: baseViewport.height,
      });

      page.cleanup();
      onProgress(
        Math.round((pageNumber / doc.numPages) * 95),
        `Reconstruyendo página ${pageNumber} de ${doc.numPages}`,
      );
    }
    return await newDoc.save();
  } finally {
    await task.destroy();
  }
}

export default function UnlockPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");
  const [wasUnprotected, setWasUnprotected] = useState(false);

  const canSubmit = files.length > 0 && !processing;

  const handleFilesChange = (next: File[]) => {
    const valid = next.filter((file) => {
      if (file.name.toLowerCase().endsWith(".pdf")) return true;
      toast.error(`"${file.name}" no es un archivo PDF`);
      return false;
    });
    setFiles(valid);
    setResult(null);
    setWasUnprotected(false);
    setProgress(0);
    setProgressLabel("");
  };

  const handleUnlock = async () => {
    const file = files[0];
    if (!file || processing) return;

    setProcessing(true);
    setResult(null);
    setWasUnprotected(false);
    setProgress(0);
    setProgressLabel("Analizando el PDF…");

    try {
      const original = new Uint8Array(await file.arrayBuffer());
      const encrypted = await isEncrypted(original);

      if (!encrypted) {
        setWasUnprotected(true);
        setResult(
          new Blob([original.slice().buffer as ArrayBuffer], {
            type: "application/pdf",
          }),
        );
        setResultName(`${baseName(file.name)}-desbloqueado.pdf`);
        setProgress(100);
        setProgressLabel("");
        toast.info("Este PDF no tiene contraseña", {
          description: "El archivo se entrega sin cambios.",
        });
        return;
      }

      setProgress(5);
      setProgressLabel("Descifrando el documento…");
      const output = await rebuildWithoutEncryption(original.slice(), password, (
        percent,
        label,
      ) => {
        setProgress(percent);
        setProgressLabel(label);
      });

      setResult(
        new Blob([output.slice().buffer as ArrayBuffer], {
          type: "application/pdf",
        }),
      );
      setResultName(`${baseName(file.name)}-desbloqueado.pdf`);
      setProgress(100);
      setProgressLabel("");
      toast.success("PDF desbloqueado correctamente");
    } catch (error) {
      toast.error("No se pudo desbloquear el PDF", {
        description:
          error instanceof Error
            ? error.message
            : "Comprueba la contraseña e inténtalo de nuevo.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setPassword("");
    setResult(null);
    setWasUnprotected(false);
    setProgress(0);
    setProgressLabel("");
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>Desbloquear PDF</CardTitle>
          <CardDescription>
            Quita la contraseña de un PDF que conozcas. Máx. {MAX_FILE_MB} MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FileDropzone
            files={files}
            onFilesChange={handleFilesChange}
            accept=".pdf,application/pdf"
            multiple={false}
            maxFiles={1}
            maxSizeMB={MAX_FILE_MB}
            disabled={processing}
            hint="PDF protegido del que eres propietario"
          />

          <div className="space-y-2">
            <Label htmlFor="unlock-password">
              Contraseña del PDF (déjala vacía si solo tiene restricciones)
            </Label>
            <div className="relative">
              <Input
                id="unlock-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-1 top-1 size-8 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Si el PDF se abre sin pedir contraseña pero tiene acciones
              restringidas, no necesitas escribir nada.
            </p>
          </div>

          <Alert className="border-rose-500/40 bg-rose-500/5 text-rose-900 dark:text-rose-200">
            <ShieldX aria-hidden />
            <AlertDescription>
              Debes ser el propietario del archivo o contar con autorización de
              su dueño. No uses esta herramienta con documentos de terceros.
            </AlertDescription>
          </Alert>

          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200">
            <Unlock aria-hidden />
            <AlertDescription>
              Para eliminar el cifrado, el PDF se reconstruye página a página en
              tu navegador: el resultado mantiene la apariencia original, pero el
              texto deja de ser seleccionable. Todo el proceso ocurre en tu
              dispositivo.
            </AlertDescription>
          </Alert>

          {processing && (
            <div className="space-y-2">
              <Progress value={progress} aria-label="Progreso del desbloqueo" />
              <p className="text-xs text-muted-foreground">{progressLabel}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleUnlock}
              disabled={!canSubmit}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Unlock aria-hidden />
              )}
              Desbloquear PDF
            </Button>
            {result && (
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={processing}
              >
                Desbloquear otro archivo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>PDF desbloqueado</CardTitle>
            <CardDescription>
              {wasUnprotected
                ? "El archivo original no tenía contraseña y se entrega sin cambios."
                : "El PDF ya se abre sin contraseña en cualquier lector."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DownloadButton
              blob={result}
              filename={resultName}
              label="Descargar PDF desbloqueado"
              size="lg"
            />
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
