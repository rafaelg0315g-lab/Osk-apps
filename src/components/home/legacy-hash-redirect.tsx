"use client";

import { useEffect } from "react";

import { getToolById } from "@/lib/tools-registry";

/**
 * Compatibilidad con enlaces antiguos con hash (#/tool/<id>):
 * redirige a la ruta real de la herramienta (/tools/<categoría>/<slug>).
 */
export function LegacyHashRedirect() {
  useEffect(() => {
    const match = /^#\/tool\/([\w-]+)$/.exec(window.location.hash);
    if (!match) return;
    const tool = getToolById(match[1]);
    if (tool) {
      window.location.replace(`/tools/${tool.category}/${tool.slug}`);
    }
  }, []);

  return null;
}
