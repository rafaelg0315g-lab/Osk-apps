"use client";

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getCategoryById, getToolUrl, type ToolMeta } from "@/lib/tools-registry";
import { cn } from "@/lib/utils";

/**
 * Tarjeta del catálogo: enlace real a la página de la herramienta
 * (/tools/<categoría>/<slug>), disponible o "próximamente".
 */
export function ToolCard({ tool, className }: { tool: ToolMeta; className?: string }) {
  const category = getCategoryById(tool.category);
  const Icon = tool.icon;
  const available = tool.status === "available";

  return (
    <Link
      href={getToolUrl(tool)}
      aria-label={available ? `Abrir ${tool.name}` : `${tool.name} — próximamente`}
      className={cn(
        "group relative flex h-full flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all sm:p-5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        available
          ? "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          : "opacity-75 hover:opacity-100",
        className,
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
            category.chipClass,
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {available ? (
          <ArrowRight
            className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
            aria-hidden
          />
        ) : (
          <Badge variant="outline" className="gap-1 rounded-full text-[10px] font-medium text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            Próximamente
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-semibold leading-tight sm:text-[15px]">{tool.name}</h3>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
          {tool.description}
        </p>
      </div>
    </Link>
  );
}
