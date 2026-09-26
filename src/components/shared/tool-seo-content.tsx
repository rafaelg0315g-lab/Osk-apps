"use client";

import { HelpCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getToolById } from "@/lib/tools-registry";
import { TOOL_SEO } from "@/lib/seo-content";

/**
 * Bloque de contenido SEO que se muestra debajo de la UI funcional
 * de cada herramienta: párrafo introductorio + mini FAQ + datos
 * estructurados FAQPage (JSON-LD) para resultados enriquecidos.
 */
export function ToolSeoContent({ toolId }: { toolId: string }) {
  const tool = getToolById(toolId);
  const seo = TOOL_SEO[toolId];
  if (!tool || !seo) return null;

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: seo.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <section aria-label={`Información sobre ${tool.name}`} className="mx-auto mt-10 w-full max-w-4xl">
      {/* Datos estructurados FAQPage */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Card className="bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <HelpCircle className="size-4.5 text-muted-foreground" aria-hidden />
            Sobre {tool.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm leading-relaxed text-muted-foreground">{seo.intro}</p>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Preguntas frecuentes</h3>
            {seo.faq.map((item) => (
              <div key={item.q} className="rounded-lg border bg-background p-3.5">
                <p className="text-sm font-medium">{item.q}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
