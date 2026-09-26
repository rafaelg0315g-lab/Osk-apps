import type { MetadataRoute } from "next";

import { AVAILABLE_TOOLS } from "@/lib/tools-registry";

/**
 * Sitemap dinámico generado desde el registro de herramientas.
 * No hay URLs hardcodeadas: cualquier herramienta con status "available"
 * se incluye automáticamente al agregarse al catálogo.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://osk-apps.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...AVAILABLE_TOOLS.map((tool) => ({
      url: `${SITE_URL}/#/tool/${tool.id}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
