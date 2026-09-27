"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib-plus-encrypt";
import {
  Eraser,
  FileSignature,
  Loader2,
  PenLine,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Point {
  x: number;
  y: number;
}

const MAX_FILE_MB = 20;
const PAD_WIDTH = 400;
const PAD_HEIGHT = 160;
const SIGNATURE_MARGIN = 24; // margen en puntos PDF
const MIN_SIZE_PERCENT = 10;
const MAX_SIZE_PERCENT = 40;

const POSITION_LABELS = [
  "Esquina superior izquierda",
  "Centro superior",
  "Esquina superior derecha",
  "Centro izquierdo",
  "Centro de la página",
  "Centro derecho",
  "Esquina inferior izquierda",
  "Centro inferior",
  "Esquina inferior derecha",
];

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

export default function SignPdf() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const isDrawingRef = useRef(false);

  const [hasInk, setHasInk] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loadingPages, setLoadingPages] = useState(false);
  const [selectedPage, setSelectedPage] = useState("1");
  const [sizePct, setSizePct] = useState(20);
  const [positionIndex, setPositionIndex] = useState(8);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");

  // Fondo blanco inicial del pad (solo dibujo en canvas, sin estado).
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#111827";
    context.fillStyle = "#111827";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokesRef.current) {
      if (stroke.length === 1) {
        context.beginPath();
        context.arc(stroke[0].x, stroke[0].y, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      context.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        context.lineTo(stroke[i].x, stroke[i].y);
      }
      context.stroke();
    }
  }, []);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const drawSegment = (from: Point, to: Point) => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#111827";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    const point = getPoint(event);
    strokesRef.current.push([point]);
    setHasInk(true);
    // Punto visible al pulsar sin arrastrar.
    drawSegment(point, { x: point.x + 0.01, y: point.y });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    const strokes = strokesRef.current;
    const current = strokes[strokes.length - 1];
    if (!current) return;
    const point = getPoint(event);
    const previous = current[current.length - 1];
    current.push(point);
    if (previous) drawSegment(previous, point);
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    event.preventDefault();
    isDrawingRef.current = false;
  };

  const handleClear = () => {
    strokesRef.current = [];
    redrawAll();
    setHasInk(false);
  };

  const handleUndo = () => {
    strokesRef.current.pop();
    redrawAll();
    setHasInk(strokesRef.current.length > 0);
  };

  const loadPageCount = async (file: File) => {
    setLoadingPages(true);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjsLib.getDocument({ data });
      const doc = await task.promise;
      setPageCount(doc.numPages);
      setSelectedPage("1");
      await task.destroy();
    } catch {
      toast.error("No se pudo leer el PDF", {
        description: "El archivo podría estar dañado o protegido con contraseña.",
      });
      setFiles([]);
      setPageCount(null);
    } finally {
      setLoadingPages(false);
    }
  };

  const handleFilesChange = (next: File[]) => {
    const valid = next.filter((file) => {
      if (file.name.toLowerCase().endsWith(".pdf")) return true;
      toast.error(`"${file.name}" no es un archivo PDF`);
      return false;
    });
    setFiles(valid);
    setPageCount(null);
    setResult(null);
    if (valid.length > 0) {
      void loadPageCount(valid[0]);
    }
  };

  const handleApply = async () => {
    const file = files[0];
    const canvas = canvasRef.current;
    if (!file || !canvas || !hasInk || !pageCount || processing) return;

    setProcessing(true);
    setResult(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes);
      const page = doc.getPage(Number(selectedPage) - 1);

      const dataUrl = canvas.toDataURL("image/png");
      const image = await doc.embedPng(dataUrl);

      const pageWidth = page.getWidth();
      const pageHeight = page.getHeight();
      const width = Math.max(40, (pageWidth * sizePct) / 100);
      const height = width * (PAD_HEIGHT / PAD_WIDTH);
      const column = positionIndex % 3;
      const row = Math.floor(positionIndex / 3);
      const x =
        column === 0
          ? SIGNATURE_MARGIN
          : column === 1
            ? (pageWidth - width) / 2
            : pageWidth - width - SIGNATURE_MARGIN;
      const y =
        row === 0
          ? pageHeight - height - SIGNATURE_MARGIN
          : row === 1
            ? (pageHeight - height) / 2
            : SIGNATURE_MARGIN;

      page.drawImage(image, { x, y, width, height });

      const output = await doc.save();
      setResult(
        new Blob([output.slice().buffer as ArrayBuffer], {
          type: "application/pdf",
        }),
      );
      setResultName(`${baseName(file.name)}-firmado.pdf`);
      toast.success(`Firma aplicada en la página ${selectedPage}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isEncrypted = /encrypted/i.test(message);
      toast.error(
        isEncrypted
          ? "El PDF está protegido con contraseña"
          : "No se pudo firmar el PDF",
        {
          description: isEncrypted
            ? "Desbloquéalo primero con la herramienta Desbloquear PDF."
            : "El archivo podría estar dañado. Prueba con otro PDF.",
        },
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ToolShell>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tu firma</CardTitle>
            <CardDescription>
              Dibuja tu firma con el ratón o con el dedo sobre el recuadro
              blanco.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                width={PAD_WIDTH}
                height={PAD_HEIGHT}
                className="h-auto w-full max-w-[400px] touch-none rounded-lg border-2 border-dashed border-zinc-300 bg-white shadow-sm"
                role="img"
                aria-label="Lienzo para dibujar tu firma"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleUndo}
                disabled={!hasInk}
                className="gap-2"
              >
                <Undo2 aria-hidden />
                Deshacer último trazo
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClear}
                disabled={!hasInk}
                className="gap-2"
              >
                <Eraser aria-hidden />
                Limpiar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documento PDF</CardTitle>
            <CardDescription>
              Elige dónde y a qué tamaño se colocará la firma. Máx. {MAX_FILE_MB}{" "}
              MB.
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
              disabled={processing || loadingPages}
              hint="PDF sin contraseña"
            />

            <div className="space-y-2">
              <Label htmlFor="sign-page">Página donde firmar</Label>
              <Select
                value={selectedPage}
                onValueChange={setSelectedPage}
                disabled={pageCount === null || processing || loadingPages}
              >
                <SelectTrigger id="sign-page" className="w-full">
                  <SelectValue
                    placeholder={loadingPages ? "Leyendo páginas…" : "Selecciona una página"}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {Array.from({ length: pageCount ?? 0 }, (_, index) => (
                    <SelectItem key={index + 1} value={String(index + 1)}>
                      Página {index + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sign-size">Tamaño de la firma</Label>
                <span className="text-sm font-medium tabular-nums">
                  {sizePct}% del ancho
                </span>
              </div>
              <Slider
                id="sign-size"
                min={MIN_SIZE_PERCENT}
                max={MAX_SIZE_PERCENT}
                step={1}
                value={[sizePct]}
                onValueChange={(values) => setSizePct(values[0] ?? 20)}
                disabled={processing}
                aria-label="Tamaño de la firma como porcentaje del ancho de la página"
              />
            </div>

            <div className="space-y-2">
              <Label>Posición en la página</Label>
              <div className="grid w-fit grid-cols-3 gap-2" role="group" aria-label="Posición de la firma">
                {POSITION_LABELS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    aria-label={label}
                    aria-pressed={positionIndex === index}
                    disabled={processing}
                    onClick={() => setPositionIndex(index)}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-md border bg-muted/40 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/5",
                      positionIndex === index &&
                        "border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600",
                    )}
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full bg-zinc-400",
                        positionIndex === index && "bg-emerald-600",
                      )}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Posición seleccionada: {POSITION_LABELS[positionIndex].toLowerCase()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <Button
            type="button"
            onClick={handleApply}
            disabled={!hasInk || files.length === 0 || !pageCount || processing}
            className="gap-2 bg-teal-600 text-white hover:bg-teal-700"
          >
            {processing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileSignature aria-hidden />
            )}
            Aplicar firma
          </Button>
          {result && (
            <>
              <DownloadButton
                blob={result}
                filename={resultName}
                label="Descargar PDF firmado"
                size="lg"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFiles([]);
                  setPageCount(null);
                  setResult(null);
                }}
                disabled={processing}
              >
                Firmar otro archivo
              </Button>
            </>
          )}
          {!result && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <PenLine className="size-4" aria-hidden />
              {hasInk
                ? "Añade un PDF y elige la posición para aplicar la firma."
                : "Dibuja tu firma para empezar."}
            </p>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
