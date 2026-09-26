"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToolSeoContent } from "@/components/shared/tool-seo-content";
import { ToolComponent } from "@/components/tools/tool-components";
import { useAppStore } from "@/lib/store";
import { getCategoryById, getToolById } from "@/lib/tools-registry";
import { TOOL_SEO } from "@/lib/seo-content";
import { cn } from "@/lib/utils";

const HOME_TITLE = "OSK APPS — Todas las herramientas online en un solo lugar";
const HOME_DESCRIPTION =
  "La navaja suiza de herramientas online: PDF, imágenes, facturas, QR, acortador de links, calculadoras y más. Gratis, rápido y sin registro.";

/** Página completa de una herramienta: encabezado + contenido cargado perezosamente. */
export function ToolView({ toolId }: { toolId: string }) {
  const goHome = useAppStore((s) => s.goHome);
  const tool = getToolById(toolId);

  // Metadata dinámica de la "página" de la herramienta (SPA): title + description.
  // Google renderiza JavaScript, por lo que estos valores son los que indexa.
  useEffect(() => {
    if (!tool) return;
    const seo = TOOL_SEO[tool.id];
    const description = seo?.intro.slice(0, 155) ?? tool.description;
    const previousTitle = document.title;
    const metaDescription = document.querySelector('meta[name="description"]');

    document.title = `${tool.name} gratis online | OSK APPS`;
    metaDescription?.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      metaDescription?.setAttribute("content", HOME_DESCRIPTION);
    };
  }, [tool]);

  if (!tool) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4 py-24 text-center">
        <p className="text-lg font-semibold">Herramienta no encontrada</p>
        <p className="text-sm text-muted-foreground">
          El enlace que abriste no corresponde a ninguna herramienta.
        </p>
        <Button variant="outline" onClick={goHome} className="gap-2">
          <ArrowLeft className="size-4" /> Volver al inicio
        </Button>
      </div>
    );
  }

  const category = getCategoryById(tool.category);
  const Icon = tool.icon;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 space-y-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={goHome}
          className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver a las herramientas
        </Button>

        <div className="flex items-center gap-3.5">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              category.chipClass,
            )}
          >
            <Icon className="size-5.5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{tool.name}</h1>
            <p className="text-sm text-muted-foreground">{tool.description}</p>
          </div>
        </div>
      </div>

      <ToolComponent id={tool.id} />

      {/* Bloque SEO: párrafo + FAQ (no interfiere con la UI funcional) */}
      <ToolSeoContent toolId={tool.id} />
    </div>
  );
}
