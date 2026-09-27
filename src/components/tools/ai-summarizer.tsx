"use client";

import { useCallback, useMemo, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { History, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const HISTORY_KEY = "osk-ai-summary-history";
const MAX_PDF_PAGES = 100;
const MAX_CHARS = 24000;

type SummaryLength = "breve" | "medio" | "detallado";
type SummaryFormat = "parrafo" | "puntos" | "ambos";

const LENGTH_OPTIONS: { value: SummaryLength; label: string; instruction: string }[] = [
  { value: "breve", label: "Breve (~3 frases)", instruction: "Breve (unas 3 frases)" },
  { value: "medio", label: "Medio (~1 párrafo)", instruction: "Medio (1 párrafo)" },
  { value: "detallado", label: "Detallado (~3 párrafos)", instruction: "Detallado (3 párrafos)" },
];

const FORMAT_OPTIONS: { value: SummaryFormat; label: string; instruction: string }[] = [
  { value: "parrafo", label: "Párrafo", instruction: "Párrafo continuo" },
  { value: "puntos", label: "Puntos clave", instruction: "Lista de puntos clave" },
  { value: "ambos", label: "Ambos", instruction: "Párrafo y lista de puntos clave" },
];

interface SummaryResult {
  summary: string;
  keyPoints: string[];
  wordCount: number;
}

interface HistoryEntry extends SummaryResult {
  id: string;
  createdAt: string;
  lengthLabel: string;
  formatLabel: string;
  sourcePreview: string;
}

/** Helper local: llama al endpoint de IA y lanza Error con el mensaje del servidor si falla. */
async function callAi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok || !payload || typeof payload !== "object") {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "El servicio de IA no está disponible en este momento. Intenta de nuevo en unos segundos.";
    throw new Error(message);
  }
  return payload as Record<string, unknown>;
}

function parseSummaryResult(data: unknown): SummaryResult {
  if (!data || typeof data !== "object") {
    throw new Error("La IA devolvió una respuesta inesperada. Intenta de nuevo.");
  }
  const obj = data as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (!summary) {
    throw new Error("La IA no devolvió un resumen válido. Intenta de nuevo.");
  }
  const keyPoints = Array.isArray(obj.keyPoints)
    ? obj.keyPoints
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => p.trim())
    : [];
  const rawCount = typeof obj.wordCount === "number" ? obj.wordCount : Number(obj.wordCount);
  const wordCount =
    Number.isFinite(rawCount) && rawCount > 0
      ? Math.round(rawCount)
      : summary.split(/\s+/).filter(Boolean).length;
  return { summary, keyPoints, wordCount };
}

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is HistoryEntry =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as HistoryEntry).summary === "string" &&
          typeof (entry as HistoryEntry).createdAt === "string" &&
          typeof (entry as HistoryEntry).wordCount === "number" &&
          Array.isArray((entry as HistoryEntry).keyPoints),
      )
      .map((entry, i) => ({
        ...entry,
        keyPoints: entry.keyPoints.filter((p) => typeof p === "string"),
        id: typeof entry.id === "string" ? entry.id : `restaurado-${i}-${entry.createdAt}`,
      }))
      .slice(0, 3);
  } catch {
    return [];
  }
}

/** Extrae el texto de un PDF con pdfjs-dist, página por página. */
async function extractPdfText(
  file: File,
): Promise<{ text: string; pages: number; truncated: boolean }> {
  const buffer = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const doc = await task.promise;
  const totalPages = doc.numPages;
  const limit = Math.min(totalPages, MAX_PDF_PAGES);
  const parts: string[] = [];
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    parts.push(pageText);
    page.cleanup();
  }
  await task.destroy();
  return { text: parts.join("\n\n").trim(), pages: totalPages, truncated: totalPages > MAX_PDF_PAGES };
}

export default function AiSummarizer() {
  const [text, setText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [scannedWarning, setScannedWarning] = useState<string | null>(null);
  const [length, setLength] = useState<SummaryLength>("medio");
  const [format, setFormat] = useState<SummaryFormat>("ambos");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(readHistory);

  const lengthCfg = LENGTH_OPTIONS.find((o) => o.value === length) ?? LENGTH_OPTIONS[1];
  const formatCfg = FORMAT_OPTIONS.find((o) => o.value === format) ?? FORMAT_OPTIONS[2];

  const summaryBlob = useMemo(
    () => (result ? new Blob([result.summary], { type: "text/plain;charset=utf-8" }) : null),
    [result],
  );

  const handleFilesChange = useCallback(
    async (files: File[]) => {
      const file = files[0] ?? null;
      setSourceFile(file);
      if (!file) return; // El archivo se quitó: se conserva el texto ya extraído.
      setExtracting(true);
      setScannedWarning(null);
      try {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".pdf")) {
          const { text: extracted, pages, truncated } = await extractPdfText(file);
          if (!extracted || extracted.length < 60) {
            setScannedWarning(
              `El PDF "${file.name}" parece escaneado: no contiene texto seleccionable. Sube un PDF generado digitalmente (con texto, no imágenes) para poder resumirlo.`,
            );
            setText("");
          } else {
            setText(extracted);
            if (truncated) {
              toast.info(`PDF extenso: se extrajeron las primeras ${MAX_PDF_PAGES} páginas de ${pages}.`);
            } else {
              toast.success(`Texto extraído de ${pages} ${pages === 1 ? "página" : "páginas"}.`);
            }
          }
        } else {
          const content = await file.text();
          setText(content);
          toast.success("Texto cargado desde el archivo.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo leer el archivo.");
      } finally {
        setExtracting(false);
      }
    },
    [],
  );

  const generate = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Escribe o sube un texto para resumir.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = await callAi({
        json: true,
        system: `Eres un asistente que resume documentos en español, fiel al contenido, sin inventar. Devuelve JSON: {"summary": "resumen según formato pedido", "keyPoints": ["3-7 puntos clave breves"], "wordCount": número_aproximado_de_palabras_del_resumen}`,
        messages: [
          {
            role: "user",
            content: `Resume el siguiente texto en español.\nLongitud: ${lengthCfg.instruction}\nFormato: ${formatCfg.instruction}\n\nTEXTO:\n${trimmed.slice(0, MAX_CHARS)}`,
          },
        ],
      });
      const summary = parseSummaryResult(payload.data);
      setResult(summary);
      const entry: HistoryEntry = {
        id: `${Date.now()}`,
        createdAt: new Date().toISOString(),
        lengthLabel: lengthCfg.label,
        formatLabel: formatCfg.label,
        sourcePreview: trimmed.slice(0, 140),
        ...summary,
      };
      const next = [entry, ...history].slice(0, 3);
      setHistory(next);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Almacenamiento no disponible: el historial solo vive en memoria.
      }
      toast.success("Resumen generado.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "El servicio de IA no está disponible en este momento. Intenta de nuevo en unos segundos.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const restore = (entry: HistoryEntry) => {
    setResult({
      summary: entry.summary,
      keyPoints: entry.keyPoints,
      wordCount: entry.wordCount,
    });
    setError(null);
    toast.success("Resumen restaurado desde el historial.");
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
            Texto de origen
          </CardTitle>
          <CardDescription>
            Escribe o pega el texto que quieres resumir, o sube un archivo .txt, .md o .pdf
            (se extrae el texto automáticamente).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Pega aquí el artículo, informe o documento que quieres resumir…"
              aria-label="Texto a resumir"
              className="min-h-48 text-base"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {text.trim().length.toLocaleString("es")} caracteres
                {sourceFile ? ` · origen: ${sourceFile.name}` : ""}
              </span>
              {text.length > MAX_CHARS && (
                <span className="text-amber-600 dark:text-amber-400">
                  Solo se enviarán los primeros {MAX_CHARS.toLocaleString("es")} caracteres.
                </span>
              )}
            </div>
          </div>

          <FileDropzone
            files={sourceFile ? [sourceFile] : []}
            onFilesChange={handleFilesChange}
            accept=".txt,.md,.pdf"
            maxFiles={1}
            maxSizeMB={20}
            disabled={extracting}
            hint="o selecciona un archivo .txt, .md o .pdf (máx. 20 MB)"
          />

          {extracting && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Extrayendo texto del archivo…
            </p>
          )}

          {scannedWarning && (
            <Alert>
              <AlertTitle>PDF sin texto</AlertTitle>
              <AlertDescription>{scannedWarning}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="summary-length">Longitud del resumen</Label>
              <Select value={length} onValueChange={(v) => setLength(v as SummaryLength)}>
                <SelectTrigger id="summary-length" className="w-full">
                  <SelectValue placeholder="Elige la longitud" />
                </SelectTrigger>
                <SelectContent>
                  {LENGTH_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="summary-format">Formato</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as SummaryFormat)}>
                <SelectTrigger id="summary-format" className="w-full">
                  <SelectValue placeholder="Elige el formato" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            onClick={generate}
            disabled={loading || extracting || !text.trim()}
            className="w-full gap-2 sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {loading ? "Generando…" : "Generar resumen"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>No se pudo generar el resumen</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card className="border-violet-200 dark:border-violet-900/60">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
                Resumen generado
              </CardTitle>
              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                ≈ {result.wordCount.toLocaleString("es")} palabras
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.summary}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={result.summary} label="Copiar resumen" size="sm" />
              <DownloadButton blob={summaryBlob} filename="resumen.txt" label="Descargar resumen.txt" size="sm" />
            </div>

            {result.keyPoints.length > 0 && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Puntos clave</p>
                <ul className="space-y-1.5">
                  {result.keyPoints.map((point, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-500" aria-hidden />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" aria-hidden />
            Resúmenes recientes
          </CardTitle>
          <CardDescription>
            Se guardan automáticamente tus últimos 3 resúmenes en este dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no has generado resúmenes. Cuando lo hagas, aparecerán aquí para que puedas
              recuperarlos.
            </p>
          ) : (
            <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {history.map((entry) => (
                <li key={entry.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px]">
                        {entry.lengthLabel}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        {entry.formatLabel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => restore(entry)}
                      className="gap-1.5"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      Restaurar
                    </Button>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{entry.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Función con IA · límite diario de uso · tu texto se envía a nuestro servicio de IA
      </p>
    </ToolShell>
  );
}
