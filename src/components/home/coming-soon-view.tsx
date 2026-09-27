import Link from "next/link";
import { Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCategoryById,
  getToolUrl,
  getToolsByCategory,
  type ToolMeta,
} from "@/lib/tools-registry";
import { cn } from "@/lib/utils";

/**
 * Vista para herramientas del catálogo aún no implementadas ("Próximamente").
 * Incluye contenido textual real para SEO y enlaces internos a herramientas
 * disponibles de la misma categoría.
 */
export function ComingSoonView({ tool }: { tool: ToolMeta }) {
  const category = getCategoryById(tool.category);
  const Icon = tool.icon;
  const related = getToolsByCategory(tool.category)
    .filter((t) => t.status === "available" && t.id !== tool.id)
    .slice(0, 4);

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
          <Badge
            variant="outline"
            className="mb-1.5 gap-1 rounded-full text-[10px] font-medium text-muted-foreground"
          >
            <Clock className="size-3" aria-hidden />
            Próximamente
          </Badge>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{tool.name}</h1>
          <p className="text-sm text-muted-foreground">{tool.description}</p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center sm:p-8">
        <p className="text-base font-semibold">Estamos construyendo esta herramienta</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Forma parte del catálogo de {category.label} de OSK APPS y estará disponible muy
          pronto, siempre gratis y sin registro. Mientras tanto, puedes usar cualquiera de
          las herramientas que ya están listas.
        </p>
        <Button asChild size="sm" className="mt-4">
          <Link href="/#catalogo">Explorar herramientas disponibles</Link>
        </Button>
      </div>

      {related.length > 0 && (
        <section aria-label="Herramientas relacionadas disponibles">
          <h2 className="mb-2.5 text-sm font-semibold">
            Herramientas de {category.label} disponibles ahora
          </h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((t) => (
              <li key={t.id}>
                <Link
                  href={getToolUrl(t)}
                  className="inline-block rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-foreground"
                >
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
