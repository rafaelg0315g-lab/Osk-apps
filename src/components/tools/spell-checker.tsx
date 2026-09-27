"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  FileText,
  Info,
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { DownloadButton } from "@/components/shared/download-button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const SYSTEM_PROMPT =
  'Eres un corrector ortográfico y gramatical del español. Devuelve JSON con esta forma exacta: {"corrected": "texto corregido completo", "changes": [{"original": "palabra o fragmento mal escrito", "suggestion": "corrección", "reason": "motivo breve en español"}]}. No cambies el estilo ni el significado; corrige ortografía, tildes, puntuación y gramática clara.';

interface SpellChange {
  original: string;
  suggestion: string;
  reason: string;
}

interface SpellResult {
  corrected: string;
  changes: SpellChange[];
}

/** Normaliza la respuesta de la IA de forma defensiva. */
function normalizeResult(raw: unknown): SpellResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.corrected !== "string") return null;
  const changes: SpellChange[] = Array.isArray(obj.changes)
    ? obj.changes
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object",
        )
        .map((item) => ({
          original: typeof item.original === "string" ? item.original : "",
          suggestion: typeof item.suggestion === "string" ? item.suggestion : "",
          reason: typeof item.reason === "string" ? item.reason : "",
        }))
        .filter((item) => item.original.length > 0 || item.suggestion.length > 0)
    : [];
  return { corrected: obj.corrected, changes };
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

export default function SpellChecker() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpellResult | null>(null);

  const wordCount = useMemo(() => {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  }, [text]);

  const txtBlob = useMemo(
    () =>
      result
        ? new Blob([result.corrected], { type: "text/plain;charset=utf-8" })
        : null,
    [result],
  );

  const correctText = async () => {
    const value = text.trim();
    if (!value) {
      toast.error("Escribe o pega un texto para corregir");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: value }],
          system: SYSTEM_PROMPT,
          json: true,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          extractErrorMessage(
            data,
            "No se pudo corregir el texto. Inténtalo de nuevo.",
          ),
        );
      }
      const payload =
        data && typeof data === "object" && "data" in data
          ? (data as { data: unknown }).data
          : null;
      const normalized = normalizeResult(payload);
      if (!normalized) {
        throw new Error(
          "La IA devolvió una respuesta inesperada. Inténtalo de nuevo.",
        );
      }
      setResult(normalized);
      toast.success("Texto corregido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  const useCorrectedText = () => {
    if (!result) return;
    setText(result.corrected);
    setResult(null);
    toast.success("Texto aplicado en el editor");
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-600" aria-hidden />
            Corrector ortográfico (IA)
          </CardTitle>
          <CardDescription>
            Corrige ortografía, tildes, puntuación y gramática de tus textos en
            español sin cambiar tu estilo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "Escribe o pega aquí tu texto…\n\nEjemplo: «El proximo lunes vamos a hazer una reunion para revisar los avances del proyecto, seria bueno que estés alli»."
              }
              aria-label="Texto a corregir"
              className="min-h-56 text-base"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="secondary" aria-live="polite">
                {wordCount} {wordCount === 1 ? "palabra" : "palabras"}
              </Badge>
              <Button
                type="button"
                onClick={correctText}
                disabled={loading || !text.trim()}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {loading ? "Corrigiendo…" : "Corregir con IA"}
              </Button>
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            El texto se envía a nuestro servicio de IA para procesarlo y no se
            almacena. Para textos muy largos el proceso puede tardar unos
            segundos.
          </p>
        </CardContent>
      </Card>

      {result && (
        <Card aria-busy={loading}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" aria-hidden />
              Resultado
            </CardTitle>
            <CardDescription>
              Revisa las correcciones antes de usar el texto final.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="corrected">
              <TabsList>
                <TabsTrigger value="corrected" className="gap-1.5">
                  <FileText className="size-3.5" aria-hidden />
                  Texto corregido
                </TabsTrigger>
                <TabsTrigger value="changes" className="gap-1.5">
                  <ListChecks className="size-3.5" aria-hidden />
                  Cambios ({result.changes.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="corrected" className="space-y-4">
                <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">
                  {result.corrected}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton
                    value={result.corrected}
                    label="Copiar texto"
                    size="sm"
                  />
                  <DownloadButton
                    blob={txtBlob}
                    filename="texto-corregido.txt"
                    label="Descargar .txt"
                    size="sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={useCorrectedText}
                    className="ml-auto gap-2"
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    Usar texto corregido
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="changes">
                {result.changes.length === 0 ? (
                  <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                    No se detectaron cambios: tu texto está bien escrito.
                  </p>
                ) : (
                  <ul
                    aria-label="Lista de cambios realizados"
                    className="max-h-96 space-y-2 overflow-y-auto pr-1"
                  >
                    {result.changes.map((change, index) => (
                      <li
                        key={`${change.original}-${index}`}
                        className="rounded-lg border bg-card px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-red-600 line-through decoration-red-400">
                            {change.original || "—"}
                          </span>
                          <ArrowRight
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="font-medium text-emerald-600">
                            {change.suggestion || "—"}
                          </span>
                        </div>
                        {change.reason && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {change.reason}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
