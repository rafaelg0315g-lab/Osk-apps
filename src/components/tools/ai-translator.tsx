"use client";

import { useMemo, useState } from "react";
import { Languages, Loader2, ScanSearch } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";

const CHUNK_MAX = 3500;
const SPLIT_AT = 4000;

const LANGUAGES: { value: string; label: string }[] = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "pt", label: "Portugués" },
  { value: "fr", label: "Francés" },
  { value: "de", label: "Alemán" },
  { value: "it", label: "Italiano" },
];

const SOURCE_LANGUAGES: { value: string; label: string }[] = [
  { value: "auto", label: "Detección automática" },
  ...LANGUAGES,
];

const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.value, l.label]),
);

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

function parseTranslation(data: unknown): { translation: string; detectedLanguage: string } {
  if (!data || typeof data !== "object") {
    throw new Error("La IA devolvió una respuesta inesperada. Intenta de nuevo.");
  }
  const obj = data as Record<string, unknown>;
  const translation = typeof obj.translation === "string" ? obj.translation : "";
  if (!translation.trim()) {
    throw new Error("La IA no devolvió una traducción válida. Intenta de nuevo.");
  }
  const detected =
    typeof obj.detectedLanguage === "string" ? obj.detectedLanguage.trim() : "";
  return { translation, detectedLanguage: detected };
}

/**
 * Divide el texto en chunks de ~3500 caracteres por párrafos, conservando
 * los saltos de línea dentro de cada chunk para poder reconstruir el texto.
 */
function splitIntoChunks(text: string, maxLen = CHUNK_MAX): string[] {
  const units = text.match(/[^\n]+\n*|\n+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) chunks.push(current);
    current = "";
  };

  for (const unit of units) {
    if (unit.length > maxLen) {
      flush();
      // Párrafo enorme: se divide por oraciones (o espacios) sin perder contenido.
      let rest = unit;
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(". ", maxLen);
        if (cut < maxLen * 0.5) cut = rest.lastIndexOf(" ", maxLen);
        if (cut < maxLen * 0.5) cut = maxLen;
        chunks.push(rest.slice(0, cut + 1));
        rest = rest.slice(cut + 1);
      }
      current = rest;
    } else if (current.length + unit.length > maxLen && current.trim().length > 0) {
      flush();
      current = unit;
    } else {
      current += unit;
    }
  }
  flush();
  return chunks;
}

export default function AiTranslator() {
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [formal, setFormal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetName = LANGUAGES.find((l) => l.value === targetLang)?.label ?? targetLang;

  const estimatedParts = useMemo(() => {
    if (sourceText.length <= SPLIT_AT) return 1;
    return Math.max(2, Math.ceil(sourceText.length / CHUNK_MAX));
  }, [sourceText]);

  const resultBlob = useMemo(
    () => (result ? new Blob([result], { type: "text/plain;charset=utf-8" }) : null),
    [result],
  );

  const detectedLabel =
    detected && sourceLang === "auto"
      ? (LANGUAGE_NAMES[detected.toLowerCase()] ?? detected)
      : null;

  const handleFilesChange = async (files: File[]) => {
    const file = files[0] ?? null;
    setSourceFile(file);
    if (!file) return; // El archivo se quitó: se conserva el texto ya cargado.
    try {
      const content = await file.text();
      setSourceText(content);
      toast.success("Texto cargado desde el archivo.");
    } catch {
      toast.error("No se pudo leer el archivo.");
    }
  };

  const translate = async () => {
    const trimmed = sourceText.trim();
    if (!trimmed) {
      toast.error("Escribe o sube el texto que quieres traducir.");
      return;
    }
    if (sourceLang !== "auto" && sourceLang === targetLang) {
      setError("El idioma de origen y el de destino no pueden ser el mismo.");
      return;
    }
    setTranslating(true);
    setError(null);
    setResult(null);
    setDetected(null);

    const chunks = splitIntoChunks(trimmed);
    setProgress({ done: 0, total: chunks.length });

    const parts: string[] = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress({ done: i, total: chunks.length });
        if (!chunks[i].trim()) {
          parts.push(chunks[i]); // Solo saltos de línea: no gastamos una llamada.
          continue;
        }
        const payload = await callAi({
          json: true,
          system: `Eres un traductor profesional. Devuelve JSON: {"translation": "traducción completa", "detectedLanguage": "código ISO del idioma detectado"}. Conserva formato de párrafos, saltos de línea y listas. No agregues notas ni comentarios.`,
          messages: [
            {
              role: "user",
              content: `Traduce al ${targetName.toLowerCase()}${formal ? " usando registro formal" : ""}:\n\n${chunks[i]}`,
            },
          ],
        });
        const { translation, detectedLanguage } = parseTranslation(payload.data);
        parts.push(translation);
        if (i === 0) setDetected(detectedLanguage);
        setProgress({ done: i + 1, total: chunks.length });
        if (chunks.length > 1) setResult(parts.join(""));
      }
      setResult(parts.join(""));
      toast.success("Traducción completada.");
    } catch (err) {
      const raw =
        err instanceof Error
          ? err.message
          : "El servicio de IA no está disponible en este momento. Intenta de nuevo en unos segundos.";
      if (parts.length > 0) {
        setResult(parts.join(""));
        setError(
          `Se tradujo ${parts.length} de ${chunks.length} partes antes del error: ${raw}`,
        );
      } else {
        setError(raw);
      }
      toast.error(raw);
    } finally {
      setTranslating(false);
      setProgress(null);
    }
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
            Texto de origen
          </CardTitle>
          <CardDescription>
            Pega el texto o sube un archivo .txt / .md. Los documentos largos se traducen por
            partes manteniendo los párrafos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Escribe o pega aquí el texto que quieres traducir…"
              aria-label="Texto de origen"
              className="min-h-40 text-base"
            />
            <p className="text-xs text-muted-foreground">
              {sourceText.length.toLocaleString("es")} caracteres
              {sourceText.length > SPLIT_AT &&
                ` · se traducirá en ~${estimatedParts} partes de forma secuencial`}
            </p>
          </div>

          <FileDropzone
            files={sourceFile ? [sourceFile] : []}
            onFilesChange={handleFilesChange}
            accept=".txt,.md"
            maxFiles={1}
            maxSizeMB={20}
            disabled={translating}
            hint="o sube un archivo .txt / .md para rellenar el texto (máx. 20 MB)"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source-lang">Idioma de origen</Label>
              <Select value={sourceLang} onValueChange={setSourceLang}>
                <SelectTrigger id="source-lang" className="w-full">
                  <SelectValue placeholder="Idioma de origen" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-lang">Idioma de destino</Label>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger id="target-lang" className="w-full">
                  <SelectValue placeholder="Idioma de destino" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem
                      key={lang.value}
                      value={lang.value}
                      disabled={lang.value === sourceLang}
                    >
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="formal-switch">Traducción formal (usted)</Label>
              <p className="text-xs text-muted-foreground">
                Usa un registro formal y de respeto en la traducción.
              </p>
            </div>
            <Switch
              id="formal-switch"
              checked={formal}
              onCheckedChange={setFormal}
              disabled={translating}
            />
          </div>

          <Button
            type="button"
            onClick={translate}
            disabled={translating || !sourceText.trim()}
            className="w-full gap-2 sm:w-auto"
          >
            {translating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Languages className="size-4" aria-hidden />
            )}
            {translating ? "Traduciendo…" : `Traducir al ${targetName.toLowerCase()}`}
          </Button>

          {translating && progress && progress.total > 1 && (
            <div className="space-y-2" role="status">
              <Progress
                value={Math.round((progress.done / progress.total) * 100)}
                aria-label={`Progreso de traducción: ${progress.done} de ${progress.total} partes`}
              />
              <p className="text-xs text-muted-foreground">
                Traduciendo parte {Math.min(progress.done + 1, progress.total)} de{" "}
                {progress.total}…
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Error en la traducción</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result !== null && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Traducción</CardTitle>
              {detectedLabel && (
                <Badge variant="secondary" className="gap-1">
                  <ScanSearch className="size-3" aria-hidden />
                  Idioma detectado: {detectedLabel}
                </Badge>
              )}
            </div>
            <CardDescription>Revisa el resultado antes de usarlo; puedes editarlo aquí.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              readOnly
              value={result}
              aria-label="Traducción resultado"
              className="min-h-48 bg-muted/40 text-base"
            />
            <div className="flex flex-wrap gap-2">
              <CopyButton value={result} label="Copiar traducción" size="sm" />
              <DownloadButton
                blob={resultBlob}
                filename="traduccion.txt"
                label="Descargar traduccion.txt"
                size="sm"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Función con IA · límite diario de uso · tu texto se envía a nuestro servicio de IA
      </p>
    </ToolShell>
  );
}
