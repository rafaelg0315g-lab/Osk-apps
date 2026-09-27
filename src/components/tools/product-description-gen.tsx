"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Package, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_SUGGESTIONS = [
  "Ropa y accesorios",
  "Electrónica",
  "Hogar y cocina",
  "Belleza y cuidado personal",
  "Deportes y aire libre",
  "Juguetes y juegos",
  "Salud y bienestar",
  "Mascotas",
  "Papelería y oficina",
  "Alimentos y bebidas",
  "Jardinería",
  "Herramientas",
  "Muebles",
  "Joyas y relojes",
  "Libros y papelería",
];

const TONES: { value: string; label: string }[] = [
  { value: "profesional", label: "Profesional" },
  { value: "cercano", label: "Cercano" },
  { value: "lujoso", label: "Lujoso" },
  { value: "divertido", label: "Divertido" },
  { value: "tecnico", label: "Técnico" },
];

const LENGTHS: { value: string; label: string; instruction: string }[] = [
  { value: "corta", label: "Corta (~50 palabras)", instruction: "Corta (unas 50 palabras)" },
  { value: "media", label: "Media (~100 palabras)", instruction: "Media (unas 100 palabras)" },
  { value: "larga", label: "Larga (~200 palabras)", instruction: "Larga (unas 200 palabras)" },
];

interface Variant {
  title: string;
  description: string;
  bullets: string[];
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

function parseVariants(data: unknown): Variant[] {
  if (!data || typeof data !== "object") {
    throw new Error("La IA devolvió una respuesta inesperada. Intenta de nuevo.");
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.variants)) {
    throw new Error("La IA no devolvió variantes válidas. Intenta de nuevo.");
  }
  const variants = obj.variants
    .filter(
      (v): v is Record<string, unknown> =>
        !!v &&
        typeof v === "object" &&
        typeof (v as Record<string, unknown>).title === "string" &&
        typeof (v as Record<string, unknown>).description === "string",
    )
    .map((v) => ({
      title: (v.title as string).trim(),
      description: (v.description as string).trim(),
      bullets: Array.isArray(v.bullets)
        ? v.bullets
            .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
            .map((b) => b.trim())
        : [],
    }))
    .filter((v) => v.title && v.description)
    .slice(0, 3);
  if (variants.length === 0) {
    throw new Error("La IA no devolvió variantes válidas. Intenta de nuevo.");
  }
  return variants;
}

/** Título + descripción + bullets en texto plano, listo para pegar en la tienda. */
function formatVariant(variant: Variant): string {
  const bullets = variant.bullets.length
    ? `\n${variant.bullets.map((b) => `• ${b}`).join("\n")}`
    : "";
  return `${variant.title}\n\n${variant.description}${bullets}`;
}

export default function ProductDescriptionGen() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [features, setFeatures] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("profesional");
  const [keywords, setKeywords] = useState("");
  const [length, setLength] = useState("media");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[] | null>(null);

  const toneLabel = TONES.find((t) => t.value === tone)?.label ?? tone;
  const lengthCfg = LENGTHS.find((l) => l.value === length) ?? LENGTHS[1];

  const featureLines = useMemo(
    () =>
      features
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    [features],
  );

  const generate = async () => {
    if (!name.trim()) {
      toast.error("Escribe el nombre del producto.");
      return;
    }
    setLoading(true);
    setError(null);
    setVariants(null);
    try {
      const parts = [
        `Producto: ${name.trim()}`,
        category.trim() ? `Categoría: ${category.trim()}` : null,
        featureLines.length
          ? `Características y ventajas (una por línea):\n${featureLines.map((f) => `- ${f}`).join("\n")}`
          : null,
        audience.trim() ? `Público objetivo: ${audience.trim()}` : null,
        `Tono: ${toneLabel}`,
        keywords.trim() ? `Palabras clave SEO: ${keywords.trim()}` : null,
        `Longitud de cada descripción: ${lengthCfg.instruction}`,
      ].filter((p): p is string => p !== null);
      const payload = await callAi({
        json: true,
        system: `Eres un copywriter de ecommerce. Devuelve JSON: {"variants": [{"title": "título atractivo", "description": "descripción persuasiva que integra naturalmente las palabras clave", "bullets": ["3-5 beneficios breves"]}]}. Exactamente 3 variantes con enfoques distintos. Español, sin emojis.`,
        messages: [{ role: "user", content: parts.join("\n\n") }],
      });
      const parsed = parseVariants(payload.data);
      setVariants(parsed);
      toast.success("3 variantes generadas.");
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

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
            Datos del producto
          </CardTitle>
          <CardDescription>
            Cuanta más información des, más persuasivas serán las descripciones. Solo el nombre
            es obligatorio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-name">Nombre del producto</Label>
              <Input
                id="product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Mochila antirrobo Urban 25L"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">Categoría</Label>
              <Input
                id="product-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="product-category-suggestions"
                placeholder="Ej: Bolsos y maletas"
              />
              <datalist id="product-category-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-features">Características y ventajas (una por línea)</Label>
            <Textarea
              id="product-features"
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              placeholder={
                "Impermeable con cremalleras ocultas\nCompartimento acolchado para laptop de 15\"\nPuerto USB de carga externa\nTela reciclada resistente"
              }
              className="min-h-28"
            />
            <p className="text-xs text-muted-foreground">
              {featureLines.length} característica{featureLines.length === 1 ? "" : "s"} añadida
              {featureLines.length === 1 ? "" : "s"}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-audience">Público objetivo</Label>
              <Input
                id="product-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Ej: Profesionales jóvenes que viajan"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-keywords">Palabras clave SEO (separadas por coma)</Label>
              <Input
                id="product-keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="mochila antirrobo, mochila para laptop, mochila urbana"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-tone">Tono</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger id="product-tone" className="w-full">
                  <SelectValue placeholder="Elige el tono" />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-length">Longitud</Label>
              <Select value={length} onValueChange={setLength}>
                <SelectTrigger id="product-length" className="w-full">
                  <SelectValue placeholder="Elige la longitud" />
                </SelectTrigger>
                <SelectContent>
                  {LENGTHS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="button"
            onClick={generate}
            disabled={loading || !name.trim()}
            className="w-full gap-2 sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            {loading ? "Generando…" : "Generar 3 variantes"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>No se pudieron generar las descripciones</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {variants && (
        <section aria-label="Variantes generadas" className="space-y-4">
          {variants.map((variant, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <Badge variant="secondary" className="text-[11px]">
                      Variante {index + 1}
                    </Badge>
                    <CardTitle className="text-base leading-snug">{variant.title}</CardTitle>
                  </div>
                  <CopyButton
                    value={formatVariant(variant)}
                    label="Copiar"
                    size="sm"
                    className="shrink-0"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {variant.description}
                </p>
                {variant.bullets.length > 0 && (
                  <ul className="space-y-1.5">
                    {variant.bullets.map((bullet, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-hidden
                        />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Función con IA · límite diario de uso · tu texto se envía a nuestro servicio de IA
      </p>
    </ToolShell>
  );
}
