import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComingSoonView } from "@/components/home/coming-soon-view";
import { ToolView } from "@/components/home/tool-view";
import { ToolSeoContent } from "@/components/shared/tool-seo-content";
import { TOOLS, getCategoryById, getToolBySlug, type ToolMeta } from "@/lib/tools-registry";

interface ToolPageProps {
  params: Promise<{ category: string; tool: string }>;
}

/** Solo las rutas generadas estáticamente son válidas (categoría + slug exactos). */
export const dynamicParams = false;

/** Pre-genera la página de TODAS las herramientas registradas (disponibles y "pronto"). */
export function generateStaticParams() {
  return TOOLS.map((tool) => ({ category: tool.category, tool: tool.slug }));
}

/** Description SEO (~150 caracteres) construida desde la ficha de la herramienta. */
function buildDescription(tool: ToolMeta): string {
  const full = `${tool.description} 100% gratis, online y sin registro.`;
  return full.length <= 160 ? full : `${tool.description} Gratis y sin registro.`;
}

/** Metadata por página: "[Nombre] gratis online | OSK APPS" + Open Graph + canonical. */
export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { category, tool: slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool || tool.category !== category) return {};

  const title = `${tool.name} gratis online`;
  const description = buildDescription(tool);
  const url = `/tools/${category}/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | OSK APPS`,
      description,
      url,
      siteName: "OSK APPS",
      type: "website",
      locale: "es",
    },
    twitter: {
      card: "summary",
      title: `${title} | OSK APPS`,
      description,
    },
  };
}

/** Breadcrumb visible (mejora UX y enlazado interno para SEO). */
function ToolBreadcrumb({ tool }: { tool: ToolMeta }) {
  const category = getCategoryById(tool.category);

  return (
    <nav
      aria-label="Ruta de navegación"
      className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground"
    >
      <Link href="/" className="rounded hover:text-foreground">
        Inicio
      </Link>
      <span aria-hidden>/</span>
      <Link href={`/#cat-${category.id}`} className="rounded hover:text-foreground">
        {category.label}
      </Link>
      <span aria-hidden>/</span>
      <span aria-current="page" className="truncate font-medium text-foreground">
        {tool.name}
      </span>
    </nav>
  );
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { category, tool: slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool || tool.category !== category) notFound();

  // Datos estructurados de aplicación para las herramientas ya disponibles
  const appSchema =
    tool.status === "available"
      ? {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: `${tool.name} — OSK APPS`,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "Web",
          inLanguage: "es",
          description: tool.description,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {appSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }}
        />
      )}

      <ToolBreadcrumb tool={tool} />

      {tool.status === "available" ? (
        <ToolView toolId={tool.id} />
      ) : (
        <ComingSoonView tool={tool} />
      )}

      {/* Bloque SEO: párrafo + mini FAQ con JSON-LD, bajo la UI de la herramienta */}
      <ToolSeoContent toolId={tool.id} />
    </div>
  );
}
