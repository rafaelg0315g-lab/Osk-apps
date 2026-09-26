"use client";

import { SearchX } from "lucide-react";

import { ToolCard } from "@/components/home/tool-card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import {
  getToolsByCategory,
  searchTools,
  TOOL_CATEGORIES,
} from "@/lib/tools-registry";

export function Catalog() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);

  const isSearching = searchQuery.trim().length > 0;
  const results = isSearching ? searchTools(searchQuery) : [];

  // Modo búsqueda: grilla plana con resultados
  if (isSearching) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" aria-live="polite">
        <p className="mb-5 text-sm text-muted-foreground">
          {results.length > 0 ? (
            <>
              <span className="font-semibold text-foreground">{results.length}</span>{" "}
              resultado{results.length !== 1 && "s"} para{" "}
              <span className="font-semibold text-foreground">“{searchQuery.trim()}”</span>
            </>
          ) : (
            <>
              Sin resultados para <span className="font-semibold text-foreground">“{searchQuery.trim()}”</span>
            </>
          )}
        </p>

        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <SearchX className="size-8 text-muted-foreground" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              No encontramos esa herramienta. Prueba con otra palabra o explora el catálogo
              completo.
            </p>
            <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
              Ver catálogo completo
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
      </section>
    );
  }

  // Modo catálogo: secciones por categoría
  return (
    <div id="catalogo" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-10 sm:px-6">
      {TOOL_CATEGORIES.map((category) => {
        const tools = getToolsByCategory(category.id);
        const availableCount = tools.filter((t) => t.status === "available").length;
        const CategoryIcon = category.icon;

        return (
          <section
            key={category.id}
            id={`cat-${category.id}`}
            className="scroll-mt-20 py-6 first:pt-0"
            aria-labelledby={`cat-title-${category.id}`}
          >
            <div className="mb-4 flex items-center gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${category.chipClass}`}
              >
                <CategoryIcon className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`cat-title-${category.id}`} className="text-lg font-bold tracking-tight">
                  {category.label}
                </h2>
                <p className="truncate text-xs text-muted-foreground sm:text-sm">
                  {category.description}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                {availableCount > 0 ? `${availableCount}/${tools.length} listas` : `${tools.length} pronto`}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
