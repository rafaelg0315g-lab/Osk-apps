"use client";

import { useState } from "react";
import { FileText, Images, Loader2, TriangleAlert } from "lucide-react";
import { PDFDocument, rgb } from "pdf-lib";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { formatBytes } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";
const MAX_FILES = 20;

type PageSizeChoice = "fit" | "a4" | "carta";
type OrientationChoice = "auto" | "retrato" | "paisaje";

const A4_SIZE: [number, number] = [595.28, 841.89];
const LETTER_SIZE: [number, number] = [612, 792];

interface ImageToPdfResult {
  blob: Blob;
  filename: string;
  pageCount: number;
}

function isAllowedImage(file: File): boolean {
  const byType = file.type === "image/jpeg" || file.type === "image/png";
  const byName = /\.(jpe?g|png)$/i.test(file.name);
  return byType || byName;
}

function imageBaseName(name: string): string {
  const withoutExt = name.replace(/\.(jpe?g|png)$/i, "");
  return withoutExt.trim() || "imagenes";
}

/** Detecta si un archivo es PNG (si no, se asume JPEG). */
function fileIsPng(file: File): boolean {
  return file.type === "image/png" || /\.png$/i.test(file.name);
}

export default function JpgToPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeChoice>("fit");
  const [orientation, setOrientation] = useState<OrientationChoice>("auto");
  const [margin, setMargin] = useState(24);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageToPdfResult | null>(null);

  const handleFilesChange = (incoming: File[]) => {
    const invalid = incoming.filter((file) => !isAllowedImage(file));
    if (invalid.length > 0) {
      invalid.forEach((file) => toast.error(`"${file.name}" no es una imagen JPG o PNG.`));
      const valid = incoming.filter((file) => isAllowedImage(file));
      setFiles(valid);
      return;
    }
    setFiles(incoming);
    setResult(null);
    setError(null);
  };

  const handleProcess = async () => {
    if (files.length === 0 || processing) return;
    if (!files.every(isAllowedImage)) {
      const message = "Solo se admiten imágenes JPG, JPEG o PNG.";
      setError(message);
      toast.error(message);
      return;
    }

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const imageFile of files) {
        const bytes = new Uint8Array(await imageFile.arrayBuffer());
        const isPng = fileIsPng(imageFile);
        const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        const imageWidth = image.width;
        const imageHeight = image.height;

        let pageWidth: number;
        let pageHeight: number;
        if (pageSize === "fit") {
          pageWidth = imageWidth + margin * 2;
          pageHeight = imageHeight + margin * 2;
        } else {
          const [baseWidth, baseHeight] = pageSize === "a4" ? A4_SIZE : LETTER_SIZE;
          const landscape =
            orientation === "paisaje" || (orientation === "auto" && imageWidth > imageHeight);
          pageWidth = landscape ? baseHeight : baseWidth;
          pageHeight = landscape ? baseWidth : baseHeight;
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        // Fondo blanco para que las PNG con transparencia no se vean sobre fondo oscuro.
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: rgb(1, 1, 1),
        });

        const maxInnerWidth = Math.max(1, pageWidth - margin * 2);
        const maxInnerHeight = Math.max(1, pageHeight - margin * 2);
        const ratio = Math.min(maxInnerWidth / imageWidth, maxInnerHeight / imageHeight);
        const drawWidth = imageWidth * ratio;
        const drawHeight = imageHeight * ratio;

        page.drawImage(image, {
          x: (pageWidth - drawWidth) / 2,
          y: (pageHeight - drawHeight) / 2,
          width: drawWidth,
          height: drawHeight,
        });
      }

      const bytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const filename =
        files.length === 1
          ? `${imageBaseName(files[0].name)}-imagenes.pdf`
          : "imagenes.pdf";

      setResult({ blob, filename, pageCount: files.length });
      toast.success(`PDF creado con ${files.length} ${files.length === 1 ? "página" : "páginas"}.`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo crear el PDF. Comprueba que las imágenes no estén dañadas.";
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setResult(null);
    setError(null);
    setPageSize("fit");
    setOrientation("auto");
    setMargin(24);
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Images className="size-5 text-primary" aria-hidden />
            1. Sube tus imágenes
          </CardTitle>
          <CardDescription>
            Cada imagen se convierte en una página del PDF, en el orden en que las veas aquí. Todo
            se procesa en tu navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FileDropzone
            files={files}
            onFilesChange={handleFilesChange}
            accept={ACCEPT}
            multiple
            maxFiles={MAX_FILES}
            maxSizeMB={20}
            reorderable
            disabled={processing}
            hint="JPG, JPEG o PNG · Máx. 20 imágenes de 20 MB"
          />
          <p className="text-sm text-muted-foreground">
            {files.length} de {MAX_FILES} imágenes
            {files.length > 0 && " · usa las flechas para cambiar el orden"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Opciones de página</CardTitle>
          <CardDescription>
            Define el tamaño del papel y el margen alrededor de cada imagen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="jpg2pdf-size">Tamaño de página</Label>
              <Select
                value={pageSize}
                onValueChange={(value) => setPageSize(value as PageSizeChoice)}
                disabled={processing}
              >
                <SelectTrigger id="jpg2pdf-size" className="w-full">
                  <SelectValue placeholder="Elige el tamaño" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fit">Ajustar a la imagen</SelectItem>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="carta">Carta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jpg2pdf-orientation">Orientación</Label>
              <Select
                value={orientation}
                onValueChange={(value) => setOrientation(value as OrientationChoice)}
                disabled={processing || pageSize === "fit"}
              >
                <SelectTrigger id="jpg2pdf-orientation" className="w-full">
                  <SelectValue placeholder="Elige la orientación" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automática</SelectItem>
                  <SelectItem value="retrato">Retrato</SelectItem>
                  <SelectItem value="paisaje">Paisaje</SelectItem>
                </SelectContent>
              </Select>
              {pageSize === "fit" && (
                <p className="text-xs text-muted-foreground">
                  La orientación solo aplica a los tamaños A4 y Carta.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="jpg2pdf-margin">Margen</Label>
              <span className="text-sm font-medium tabular-nums">{margin} px</span>
            </div>
            <Slider
              id="jpg2pdf-margin"
              min={0}
              max={60}
              step={1}
              value={[margin]}
              onValueChange={(values) => setMargin(values[0] ?? 24)}
              disabled={processing}
              aria-label="Margen alrededor de cada imagen"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Crear el PDF</CardTitle>
          <CardDescription>
            {files.length > 0
              ? `Se generará un PDF con ${files.length} ${files.length === 1 ? "página" : "páginas"}.`
              : "Sube al menos una imagen para comenzar."}
          </CardDescription>
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
                PDF con {result.pageCount} {result.pageCount === 1 ? "página" : "páginas"} ·{" "}
                {formatBytes(result.blob.size)}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <DownloadButton blob={result.blob} filename={result.filename} label="Descargar PDF" />
                <Button variant="outline" onClick={handleReset} disabled={processing}>
                  Crear otro PDF
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              onClick={handleProcess}
              disabled={files.length === 0 || processing}
              className="w-full gap-2 sm:w-auto"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="size-4" aria-hidden />
              )}
              {processing ? "Creando PDF…" : "Crear PDF"}
            </Button>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
