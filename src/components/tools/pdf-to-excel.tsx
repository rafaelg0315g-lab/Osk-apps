"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { FileSpreadsheet, Loader2, Table2 } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Item de texto de pdf.js con la información necesaria para reconstruir filas. */
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

/** Chunk de texto con su posición en coordenadas PDF (puntos). */
interface TextChunk {
  x: number;
  endX: number;
  y: number;
  text: string;
}

/** Celda detectada en una línea, con su coordenada X de inicio. */
interface RowCell {
  x: number;
  text: string;
}

const MAX_FILE_MB = 20;
const LINE_TOLERANCE = 2.5; // puntos: diferencia de Y máxima para la misma fila
const CELL_GAP = 7; // puntos: separación horizontal mínima para iniciar otra celda
const COLUMN_TOLERANCE = 8; // puntos: agrupación de X para alinear columnas
const PREVIEW_ROWS = 15;

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/** Agrupa los chunks de una página en líneas ordenadas (Y desc, X asc). */
function groupIntoLines(items: PdfTextItem[]): TextChunk[][] {
  const chunks: TextChunk[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    chunks.push({ x, y, endX: x + (item.width ?? 0), text: item.str });
  }

  chunks.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextChunk[][] = [];
  let current: TextChunk[] = [];
  let anchorY: number | null = null;

  const flush = () => {
    if (current.length === 0) return;
    current.sort((a, b) => a.x - b.x);
    lines.push(current);
    current = [];
    anchorY = null;
  };

  for (const chunk of chunks) {
    if (anchorY === null || Math.abs(chunk.y - anchorY) <= LINE_TOLERANCE) {
      if (anchorY === null) anchorY = chunk.y;
      current.push(chunk);
    } else {
      flush();
      current.push(chunk);
      anchorY = chunk.y;
    }
  }
  flush();

  return lines;
}

/** Divide una línea en celdas según la separación horizontal entre chunks. */
function lineToCells(line: TextChunk[]): RowCell[] {
  const cells: RowCell[] = [];
  let cellText = "";
  let cellX: number | null = null;
  let prevEnd: number | null = null;

  const pushCell = () => {
    const clean = cellText.replace(/\s+/g, " ").trim();
    if (clean && cellX !== null) cells.push({ x: cellX, text: clean });
    cellText = "";
    cellX = null;
  };

  for (const chunk of line) {
    const gap = prevEnd === null ? 0 : chunk.x - prevEnd;
    if (prevEnd !== null && gap > CELL_GAP && cellText) {
      pushCell();
    }
    if (!cellText) {
      cellX = chunk.x;
    } else if (gap > 1.2 && !/\s$/.test(cellText) && !/^\s/.test(chunk.text)) {
      cellText += " ";
    }
    cellText += chunk.text;
    prevEnd = chunk.endX;
  }
  pushCell();

  return cells;
}

/** Clusters de posiciones X (promedio) para definir las columnas de la página. */
function clusterColumns(xPositions: number[], tolerance: number): number[] {
  if (xPositions.length === 0) return [];
  const sorted = [...xPositions].sort((a, b) => a - b);
  const clusters: number[] = [];
  let sum = sorted[0];
  let count = 1;
  let start = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - start <= tolerance) {
      sum += sorted[i];
      count += 1;
    } else {
      clusters.push(sum / count);
      sum = sorted[i];
      count = 1;
      start = sorted[i];
    }
  }
  clusters.push(sum / count);
  return clusters;
}

function nearestAnchorIndex(anchors: number[], x: number): number {
  let best = 0;
  for (let i = 1; i < anchors.length; i++) {
    if (Math.abs(anchors[i] - x) < Math.abs(anchors[best] - x)) best = i;
  }
  return best;
}

/** Reconstruye la rejilla de la página: una lista de filas con celdas de texto. */
function extractPageGrid(items: PdfTextItem[]): string[][] {
  const lines = groupIntoLines(items);
  const lineCells = lines
    .map(lineToCells)
    .filter((cells) => cells.length > 0);

  const allX: number[] = [];
  for (const cells of lineCells) {
    for (const cell of cells) allX.push(cell.x);
  }
  const anchors = clusterColumns(allX, COLUMN_TOLERANCE);
  if (anchors.length === 0) return [];

  return lineCells.map((cells) => {
    const row: string[] = new Array(anchors.length).fill("");
    for (const cell of cells) {
      const index = nearestAnchorIndex(anchors, cell.x);
      row[index] = row[index] ? `${row[index]} ${cell.text}` : cell.text;
    }
    return row;
  });
}

/** Escapa una celda para CSV: comillas si contiene separador, coma o salto de línea. */
function csvCell(value: string): string {
  if (/[",;\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function gridToCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n");
}

export default function PdfToExcel() {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [result, setResult] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");

  const handleFilesChange = (next: File[]) => {
    const valid = next.filter((file) => {
      if (file.name.toLowerCase().endsWith(".pdf")) return true;
      toast.error(`"${file.name}" no es un archivo PDF`);
      return false;
    });
    setFiles(valid);
    setRows([]);
    setResult(null);
    setProgress(0);
    setProgressLabel("");
  };

  const handleConvert = async () => {
    const file = files[0];
    if (!file || processing) return;

    setProcessing(true);
    setRows([]);
    setResult(null);
    setProgress(0);
    setProgressLabel("Abriendo el PDF…");

    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const task = pdfjsLib.getDocument({ data });
      const doc = await task.promise;

      const allRows: string[][] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        const items: PdfTextItem[] = [];
        for (const item of content.items) {
          if ("str" in item) {
            items.push({ str: item.str, transform: item.transform, width: item.width });
          }
        }
        allRows.push(...extractPageGrid(items));
        page.cleanup();
        setProgress(Math.round((pageNumber / doc.numPages) * 90));
        setProgressLabel(`Analizando tabla: página ${pageNumber} de ${doc.numPages}`);
      }
      await task.destroy();

      if (allRows.length === 0) {
        toast.error("No se encontró texto tabulable en el PDF", {
          description:
            "Si el PDF es escaneado (solo imágenes), prueba la herramienta OCR.",
        });
        setProcessing(false);
        return;
      }

      setProgress(95);
      setProgressLabel("Generando el CSV…");
      const csv = gridToCsv(allRows);
      const blob = new Blob([`\uFEFF${csv}`], {
        type: "text/csv;charset=utf-8",
      });

      setRows(allRows);
      setResult(blob);
      setResultName(`${baseName(file.name)}.csv`);
      setProgress(100);
      setProgressLabel("");
      toast.success(`CSV generado con ${allRows.length} filas`);
    } catch (error) {
      toast.error("No se pudo convertir el PDF", {
        description:
          error instanceof Error
            ? error.message
            : "El archivo podría estar dañado o protegido con contraseña.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setRows([]);
    setResult(null);
    setProgress(0);
    setProgressLabel("");
  };

  const previewRows = rows.slice(0, PREVIEW_ROWS);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>Archivo PDF</CardTitle>
          <CardDescription>
            Extrae las tablas del PDF y descárgalas como CSV para Excel. Máx.{" "}
            {MAX_FILE_MB} MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileDropzone
            files={files}
            onFilesChange={handleFilesChange}
            accept=".pdf,application/pdf"
            multiple={false}
            maxFiles={1}
            maxSizeMB={MAX_FILE_MB}
            disabled={processing}
            hint="PDF con tablas de texto (no escaneado)"
          />

          <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200">
            <Table2 aria-hidden />
            <AlertDescription>
              El resultado es mejor con PDFs de tablas alineadas (una fila por
              línea). El CSV usa separador punto y coma (;) e incluye BOM UTF-8
              para que Excel lo abra correctamente.
            </AlertDescription>
          </Alert>

          {processing && (
            <div className="space-y-2">
              <Progress value={progress} aria-label="Progreso de la conversión" />
              <p className="text-xs text-muted-foreground">{progressLabel}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleConvert}
              disabled={files.length === 0 || processing}
              className="gap-2 bg-teal-600 text-white hover:bg-teal-700"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileSpreadsheet aria-hidden />
              )}
              Convertir a CSV
            </Button>
            {result && (
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={processing}
              >
                Convertir otro archivo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              Primeras {previewRows.length} de {rows.length} filas extraídas,{" "}
              {columnCount} columnas detectadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 w-12 bg-muted text-right">#</TableHead>
                    {Array.from({ length: columnCount }, (_, index) => (
                      <TableHead key={index} className="sticky top-0 bg-muted whitespace-nowrap">
                        Col {index + 1}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {rowIndex + 1}
                      </TableCell>
                      {Array.from({ length: columnCount }, (_, colIndex) => (
                        <TableCell
                          key={colIndex}
                          className="max-w-52 truncate whitespace-nowrap"
                        >
                          {row[colIndex] ?? ""}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>CSV listo</CardTitle>
            <CardDescription>
              {rows.length} filas · {columnCount} columnas. Ábrelo en Excel con
              importación de texto si los acentos se ven mal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DownloadButton
              blob={result}
              filename={resultName}
              label="Descargar .csv"
              size="lg"
            />
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
