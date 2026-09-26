"use client";

import { useMemo, useState } from "react";
import { Eraser, Hash } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

/** Palabras vacías comunes en español, excluidas del ranking de frecuencia. */
const STOPWORDS = new Set([
  "de", "la", "el", "que", "y", "a", "en", "los", "se", "del", "las", "un",
  "por", "con", "no", "una", "su", "para", "es", "al", "lo", "como", "más",
  "pero", "sus", "le", "ya", "o", "este", "sí", "porque", "esta", "entre",
  "cuando", "muy", "sin", "sobre", "también", "me", "hasta", "hay", "donde",
  "quien", "desde", "todo", "nos", "durante", "todos", "uno", "les", "ni",
  "contra", "otros", "ese", "eso", "ante", "ellos", "e", "esto", "mí",
  "antes", "algunos", "qué", "unos", "yo", "otro", "otras", "otra", "él",
  "tanto", "esa", "estos", "mucho", "quienes", "nada", "muchos", "cual",
  "poco", "ella", "estar", "estas", "algunas", "algo", "nosotros",
]);

const WORDS_PER_MINUTE = 200;

function formatReadingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} min ${rest} s`;
}

export default function WordCounter() {
  const [text, setText] = useState("");

  const stats = useMemo(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, "").length;
    const sentences = text
      .split(/[.!?…]+/)
      .map((s) => s.trim())
      .filter(Boolean).length;
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean).length;
    const readingSeconds = Math.round((words.length / WORDS_PER_MINUTE) * 60);

    return {
      words: words.length,
      characters,
      charactersNoSpaces,
      sentences,
      paragraphs,
      readingTime: formatReadingTime(readingSeconds),
    };
  }, [text]);

  const frequentWords = useMemo(() => {
    const matches = text.toLowerCase().match(/[a-záéíóúüñ0-9]+/g);
    if (!matches) return [];
    const counts = new Map<string, number>();
    for (const raw of matches) {
      if (STOPWORDS.has(raw) || raw.length < 2) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);
  }, [text]);

  const statCards: { label: string; value: string | number }[] = [
    { label: "Palabras", value: stats.words },
    { label: "Caracteres", value: stats.characters },
    { label: "Sin espacios", value: stats.charactersNoSpaces },
    { label: "Oraciones", value: stats.sentences },
    { label: "Párrafos", value: stats.paragraphs },
    { label: "Tiempo de lectura", value: stats.readingTime },
  ];

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>Texto</CardTitle>
          <CardDescription>
            Escribe o pega tu texto: las estadísticas se actualizan en vivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe o pega aquí el texto que quieres analizar…"
            aria-label="Texto a analizar"
            className="min-h-48 text-base"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setText("")}
              disabled={!text}
              className="gap-2"
            >
              <Eraser className="size-4" aria-hidden />
              Limpiar texto
            </Button>
          </div>
        </CardContent>
      </Card>

      <section
        aria-label="Estadísticas del texto"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 truncate text-2xl font-semibold tracking-tight">
              {stat.value}
            </p>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="size-4 text-muted-foreground" aria-hidden />
            Palabras más frecuentes
          </CardTitle>
          <CardDescription>
            Top 5 ignorando palabras vacías comunes del español.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {frequentWords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay palabras suficientes para mostrar el ranking.
            </p>
          ) : (
            <ol className="space-y-2">
              {frequentWords.map(([word, count], index) => (
                <li
                  key={word}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Badge
                      variant="secondary"
                      aria-label={`Posición ${index + 1}`}
                    >
                      {index + 1}
                    </Badge>
                    <span className="truncate font-mono text-sm">{word}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {count}{" "}
                    {count === 1 ? "aparición" : "apariciones"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
