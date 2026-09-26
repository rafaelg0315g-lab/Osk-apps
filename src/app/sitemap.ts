import type { MetadataRoute } from "next";

import { TOOLS, getToolUrl } from "@/lib/tools-registry";

/**
 * Sitemap dinámico generado desde el registro de herramientas.
 * No hay URLs hardcodeadas: incluye la landing + TODAS las herramientas
 * del catálogo (disponibles y "próximamente") con sus rutas reales.
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
    ...TOOLS.map((tool) => ({
      url: `${SITE_URL}${getToolUrl(tool)}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: tool.status === "available" ? 0.9 : 0.6,
    })),
  ];
}
