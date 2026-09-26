"use client";

import Link from "next/link";
import { Search, Sparkles, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import {
  AVAILABLE_TOOLS,
  COMING_SOON_COUNT,
  TOOLS,
  getToolUrl,
} from "@/lib/tools-registry";

const QUICK_PICKS = ["merge-pdf", "compress-image", "qr-generator", "invoice-generator", "link-shortener"];

export function Hero() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  const quickTools = QUICK_PICKS.map((id) => TOOLS.find((t) => t.id === id)!).filter(Boolean);

  return (
    <section className="relative overflow-hidden border-b">
      {/* Fondo decorativo sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,--theme(--color-primary/6%),transparent)]"
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-14 text-center sm:px-6 sm:py-20">
        <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          {AVAILABLE_TOOLS.length} herramientas disponibles · +{COMING_SOON_COUNT} en camino
        </Badge>

        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          Todas las herramientas que necesitas,{" "}
          <span className="bg-gradient-to-r from-primary via-primary/70 to-primary bg-clip-text text-transparent">
            en un solo lugar
          </span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Convierte, comprime, genera y calcula — PDF, imágenes, facturas, enlaces y mucho más.
          Gratis, sin registro y sin instalar nada.
        </p>

        {/* Buscador */}
        <div className="relative mx-auto mt-8 max-w-xl">
          <Search
            className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar herramientas… ej. “PDF”, “comprimir”, “QR”"
            aria-label="Buscar herramientas"
            className="h-12 rounded-xl border-border bg-background pl-10 text-base shadow-sm focus-visible:ring-2"
          />
        </div>

        {/* Accesos rápidos */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="size-3.5" aria-hidden /> Populares:
          </span>
          {quickTools.map((tool) => (
            <Link
              key={tool.id}
              href={getToolUrl(tool)}
              className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-foreground"
            >
              {tool.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
