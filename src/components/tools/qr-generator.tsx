"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { DownloadButton } from "@/components/shared/download-button";
import { ToolShell } from "@/components/shared/tool-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

const ERROR_LEVELS: { value: ErrorCorrectionLevel; label: string }[] = [
  { value: "L", label: "Bajo (L) - recupera el 7%" },
  { value: "M", label: "Medio (M) - recupera el 15%" },
  { value: "Q", label: "Alto (Q) - recupera el 25%" },
  { value: "H", label: "Máximo (H) - recupera el 30%" },
];

/** Convierte un data URL de imagen en un Blob descargable. */
function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  const mimeMatch = /data:([^;]+)/.exec(meta);
  const mime = mimeMatch?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export default function QrGenerator() {
  const [text, setText] = useState("");
  const [size, setSize] = useState(512);
  const [dark, setDark] = useState("#09090b");
  const [light, setLight] = useState("#ffffff");
  const [level, setLevel] = useState<ErrorCorrectionLevel>("M");
  const [margin, setMargin] = useState(2);

  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    const currentId = ++generationRef.current;
    setGenerating(true);

    const timer = setTimeout(async () => {
      const isCurrent = () => generationRef.current === currentId;

      if (!text.trim()) {
        if (isCurrent()) {
          setDataUrl(null);
          setBlob(null);
          setError(null);
          setGenerating(false);
        }
        return;
      }

      try {
        const url = await QRCode.toDataURL(text, {
          width: size,
          margin,
          errorCorrectionLevel: level,
          color: { dark, light },
        });
        if (!isCurrent()) return;
        setDataUrl(url);
        setBlob(dataUrlToBlob(url));
        setError(null);
      } catch {
        if (!isCurrent()) return;
        setDataUrl(null);
        setBlob(null);
        setError(
          "No se pudo generar el código QR. El texto es probablemente demasiado largo; prueba con un texto más corto."
        );
        toast.error("No se pudo generar el código QR", {
          description: "El texto es demasiado largo para un solo código QR.",
        });
      } finally {
        if (isCurrent()) setGenerating(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [text, size, margin, level, dark, light]);

  return (
    <ToolShell>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contenido</CardTitle>
            <CardDescription>
              Texto o URL que se codificará en el QR. Se genera en vivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="qr-text">Texto o URL</Label>
              <Input
                id="qr-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://ejemplo.com"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {text.length} caracteres
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="qr-size">Tamaño</Label>
                <span className="text-sm font-medium tabular-nums">
                  {size} px
                </span>
              </div>
              <Slider
                id="qr-size"
                min={128}
                max={1024}
                step={16}
                value={[size]}
                onValueChange={(values) => setSize(values[0] ?? 512)}
                aria-label="Tamaño del código QR en píxeles"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="qr-margin">Margen</Label>
                <span className="text-sm font-medium tabular-nums">
                  {margin}
                </span>
              </div>
              <Slider
                id="qr-margin"
                min={0}
                max={10}
                step={1}
                value={[margin]}
                onValueChange={(values) => setMargin(values[0] ?? 2)}
                aria-label="Margen alrededor del código QR"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-level">Corrección de errores</Label>
              <Select
                value={level}
                onValueChange={(value) => setLevel(value as ErrorCorrectionLevel)}
              >
                <SelectTrigger id="qr-level" className="w-full">
                  <SelectValue placeholder="Nivel de corrección" />
                </SelectTrigger>
                <SelectContent>
                  {ERROR_LEVELS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="qr-dark">Color del código</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="qr-dark"
                    type="color"
                    value={dark}
                    onChange={(e) => setDark(e.target.value)}
                    className="h-10 w-14 cursor-pointer p-1"
                  />
                  <span className="font-mono text-xs text-muted-foreground uppercase">
                    {dark}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-light">Color de fondo</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="qr-light"
                    type="color"
                    value={light}
                    onChange={(e) => setLight(e.target.value)}
                    className="h-10 w-14 cursor-pointer p-1"
                  />
                  <span className="font-mono text-xs text-muted-foreground uppercase">
                    {light}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              Escanea el código con la cámara de tu móvil para comprobarlo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col items-center gap-4">
            <div className="flex w-full flex-1 items-center justify-center rounded-lg border border-dashed bg-muted/40 p-6">
              {error ? (
                <p className="max-w-xs text-center text-sm text-destructive">
                  {error}
                </p>
              ) : dataUrl ? (
                <img
                  src={dataUrl}
                  alt="Código QR generado"
                  width={size}
                  height={size}
                  className="h-auto max-h-64 w-auto max-w-full rounded-md"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <QrCode className="size-10 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Introduce un texto para generar el código QR
                  </p>
                </div>
              )}
            </div>

            <div className="flex w-full items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                {generating && (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Generando…
                  </>
                )}
              </span>
              <DownloadButton
                blob={blob}
                filename="codigo-qr.png"
                label="Descargar PNG"
                disabled={!blob}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
