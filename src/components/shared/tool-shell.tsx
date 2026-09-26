"use client";

import { cn } from "@/lib/utils";

/**
 * Contenedor estándar para el contenido de una herramienta.
 * Mantiene el ancho máximo y el espaciado consistentes entre todas las tools.
 */
export function ToolShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-4xl space-y-6", className)}>
      {children}
    </div>
  );
}
