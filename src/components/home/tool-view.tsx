"use client";

import { ToolComponent } from "@/components/tools/tool-components";
import { getCategoryById, getToolById } from "@/lib/tools-registry";
import { cn } from "@/lib/utils";

/**
 * Interfaz de una herramienta disponible: encabezado + componente cargado
 * perezosamente (code-splitting por herramienta). El breadcrumb, la metadata
 * y el bloque SEO los provee la página (server component).
 */
export function ToolView({ toolId }: { toolId: string }) {
  const tool = getToolById(toolId);
  if (!tool) return null;

  const category = getCategoryById(tool.category);
  const Icon = tool.icon;

  return (
    <div className="space-y-6">
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

      <ToolComponent id={tool.id} />
    </div>
  );
}
