"use client";

import { useMemo, useState } from "react";
import { Braces, FileJson } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { DownloadButton } from "@/components/shared/download-button";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { formatBytes } from "@/lib/utils";

type IndentMode = "2" | "4" | "tab";

const INDENT_LABELS: Record<IndentMode, string> = {
  "2": "2 espacios",
  "4": "4 espacios",
  tab: "Tab",
};

const DEMO_JSON = `{
  "aplicacion": "OSK APPS",
  "version": 1,
  "activa": true,
  "categorias": ["texto", "imagenes", "desarrolladores"],
  "autor": {
    "nombre": "Equipo OSK",
    "herramientas": 53
  }
}`;

function getIndent(mode: IndentMode): string | number {
  if (mode === "tab") return "\t";
  return Number(mode);
}

/** Ordena recursivamente las claves de objetos y arrays. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    return Object.fromEntries(
      entries.map(([key, inner]) => [key, sortKeysDeep(inner)])
    );
  }
  return value;
}

/** Convierte una posición (índice de carácter) en línea y columna (1-based). */
function positionToLineColumn(
  source: string,
  position: number
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(position, source.length));
  const before = source.slice(0, clamped);
  const line = (before.match(/\n/g)?.length ?? 0) + 1;
  const lastNewline = before.lastIndexOf("\n");
  const column = clamped - lastNewline;
  return { line, column };
}

export default function JsonFormatter() {
  const [input, setInput] = useState(DEMO_JSON);
  const [indentMode, setIndentMode] = useState<IndentMode>("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const process = (mode: "format" | "minify") => {
    const source = input.trim();
    if (!source) {
      setError("Introduce algún JSON para procesar.");
      setOutput("");
      return;
    }
    try {
      let parsed: unknown = JSON.parse(source);
      if (sortKeys) {
        parsed = sortKeysDeep(parsed);
      }
      const indent = mode === "minify" ? 0 : getIndent(indentMode);
      setOutput(JSON.stringify(parsed, null, indent));
      setError(null);
    } catch (parseError) {
      setOutput("");
      const message =
        parseError instanceof Error
          ? parseError.message
          : "Error desconocido al analizar el JSON.";
      const positionMatch = /position\s+(\d+)/i.exec(message);
      if (positionMatch) {
        const { line, column } = positionToLineColumn(
          source,
          Number(positionMatch[1])
        );
        setError(
          `JSON no válido en la línea ${line}, columna ${column}: ${message}`
        );
      } else {
        setError(`El JSON no es válido: ${message}`);
      }
    }
  };

  const outputStats = useMemo(() => {
    if (!output) return null;
    const lines = output.split("\n").length;
    return `${output.length} caracteres · ${lines} ${
      lines === 1 ? "línea" : "líneas"
    } · ${formatBytes(new Blob([output]).size)}`;
  }, [output]);

  const outputBlob = useMemo(
    () => (output ? new Blob([output], { type: "application/json" }) : null),
    [output]
  );

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Braces className="size-4 text-muted-foreground" aria-hidden />
            JSON de entrada
          </CardTitle>
          <CardDescription>
            Pega tu JSON y elige cómo formatearlo. Todo se procesa en tu
            navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{ "clave": "valor" }'
            aria-label="JSON de entrada"
            spellCheck={false}
            className="min-h-40 font-mono text-sm"
          />
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="json-indent">Indentación</Label>
              <Select
                value={indentMode}
                onValueChange={(value) => setIndentMode(value as IndentMode)}
              >
                <SelectTrigger id="json-indent" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INDENT_LABELS) as IndentMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {INDENT_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="json-sort-keys"
                checked={sortKeys}
                onCheckedChange={setSortKeys}
              />
              <Label htmlFor="json-sort-keys">Ordenar claves</Label>
            </div>
            <div className="ml-auto flex items-center gap-2 pb-2">
              <Button type="button" onClick={() => process("format")}>
                Formatear
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => process("minify")}
              >
                Minificar
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {input.length} caracteres
          </p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <FileJson className="size-4" aria-hidden />
          <AlertTitle>Error al analizar el JSON</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {output && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>Resultado</CardTitle>
              <CardDescription>{outputStats}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton value={output} label="Copiar" size="sm" />
              <DownloadButton
                blob={outputBlob}
                filename="formateado.json"
                label="Descargar"
                size="sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <pre
              className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed"
              aria-label="JSON formateado"
            >
              {output}
            </pre>
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
