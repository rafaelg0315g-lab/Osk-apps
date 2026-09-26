"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Binary } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/utils";

const CHUNK_SIZE = 0x8000;

const DEFAULT_ENCODE_TEXT = "Hola, mundo. Texto con acentos: café, ñandú y ¡señales!";
const DEFAULT_DECODE_TEXT = "SG9sYSwgTXVuZG8h";

/** Codifica texto UTF-8 a Base64 por bloques para no desbordar la pila. */
function encodeBase64(text: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  const base64 = btoa(binary);
  if (!urlSafe) return base64;
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Normaliza Base64 URL-safe (+/ y relleno) antes de decodificar. */
function normalizeBase64(value: string): string {
  const cleaned = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const trimmedPadding = cleaned.replace(/=+$/, "");
  const remainder = trimmedPadding.length % 4;
  const padding = remainder === 0 ? 0 : 4 - remainder;
  return trimmedPadding + "=".repeat(padding);
}

function decodeBase64(value: string): string {
  const normalized = normalizeBase64(value);
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default function Base64Converter() {
  const [tab, setTab] = useState("encode");
  const [plainText, setPlainText] = useState(DEFAULT_ENCODE_TEXT);
  const [base64Text, setBase64Text] = useState(DEFAULT_DECODE_TEXT);
  const [urlSafe, setUrlSafe] = useState(false);

  const encoded = useMemo(
    () => (plainText ? encodeBase64(plainText, urlSafe) : ""),
    [plainText, urlSafe]
  );

  const decoded = useMemo(() => {
    if (!base64Text.trim()) {
      return { value: "", error: null as string | null };
    }
    try {
      return { value: decodeBase64(base64Text), error: null as string | null };
    } catch {
      return {
        value: "",
        error: "El texto introducido no es Base64 válido. Revisa que no falten caracteres o que no haya símbolos extraños.",
      };
    }
  }, [base64Text]);

  const encodeBytes = useMemo(
    () => new TextEncoder().encode(plainText).length,
    [plainText]
  );

  const textFileBlob = (content: string) =>
    content ? new Blob([content], { type: "text/plain;charset=utf-8" }) : null;

  const swapValues = () => {
    if (tab === "encode") {
      setTab("decode");
      setBase64Text(encoded || base64Text);
    } else {
      setTab("encode");
      setPlainText(decoded.value || plainText);
    }
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Binary className="size-4 text-muted-foreground" aria-hidden />
            Convertidor Base64
          </CardTitle>
          <CardDescription>
            Codifica y decodifica texto con soporte completo UTF-8. La
            conversión es en vivo y local.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
              <TabsList>
                <TabsTrigger value="encode">Codificar</TabsTrigger>
                <TabsTrigger value="decode">Decodificar</TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                <Switch
                  id="b64-urlsafe"
                  checked={urlSafe}
                  onCheckedChange={setUrlSafe}
                />
                <Label htmlFor="b64-urlsafe" className="flex flex-col gap-0.5">
                  <span>URL-safe</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Usa - y _ en lugar de + y /
                  </span>
                </Label>
              </div>
            </div>

            <TabsContent value="encode" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="b64-plain">Texto</Label>
                  <CopyButton value={plainText} size="sm" label="Copiar" />
                </div>
                <Textarea
                  id="b64-plain"
                  value={plainText}
                  onChange={(e) => setPlainText(e.target.value)}
                  placeholder="Escribe el texto que quieres codificar en Base64…"
                  aria-label="Texto de entrada para codificar"
                  className="min-h-32 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {plainText.length} caracteres · {formatBytes(encodeBytes)}
                </p>
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={swapValues}
                  className="gap-2 text-muted-foreground"
                >
                  <ArrowLeftRight className="size-4" aria-hidden />
                  Usar resultado como entrada de decodificación
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="b64-encoded">Base64</Label>
                  <div className="flex items-center gap-2">
                    <CopyButton value={encoded} size="sm" label="Copiar" />
                    <DownloadButton
                      blob={textFileBlob(encoded)}
                      filename="codificado-base64.txt"
                      label="Descargar"
                      size="sm"
                    />
                  </div>
                </div>
                <Textarea
                  id="b64-encoded"
                  readOnly
                  value={encoded}
                  placeholder="El resultado en Base64 aparecerá aquí…"
                  aria-label="Resultado codificado en Base64"
                  className="min-h-32 break-all font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="decode" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="b64-input">Base64</Label>
                  <CopyButton value={base64Text} size="sm" label="Copiar" />
                </div>
                <Textarea
                  id="b64-input"
                  value={base64Text}
                  onChange={(e) => setBase64Text(e.target.value)}
                  placeholder="Pega aquí el texto en Base64 (acepta formato URL-safe)…"
                  aria-label="Texto en Base64 para decodificar"
                  className="min-h-32 break-all font-mono text-sm"
                />
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={swapValues}
                  className="gap-2 text-muted-foreground"
                >
                  <ArrowLeftRight className="size-4" aria-hidden />
                  Usar resultado como entrada de codificación
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="b64-decoded">Texto decodificado</Label>
                  <div className="flex items-center gap-2">
                    <CopyButton value={decoded.value} size="sm" label="Copiar" />
                    <DownloadButton
                      blob={textFileBlob(decoded.value)}
                      filename="texto-descodificado.txt"
                      label="Descargar"
                      size="sm"
                    />
                  </div>
                </div>
                {decoded.error ? (
                  <Alert variant="destructive">
                    <AlertTitle>Base64 no válido</AlertTitle>
                    <AlertDescription>{decoded.error}</AlertDescription>
                  </Alert>
                ) : (
                  <Textarea
                    id="b64-decoded"
                    readOnly
                    value={decoded.value}
                    placeholder="El texto decodificado aparecerá aquí…"
                    aria-label="Texto decodificado"
                    className="min-h-32 font-mono text-sm"
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </ToolShell>
  );
}
