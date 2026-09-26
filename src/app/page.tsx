import { Catalog } from "@/components/home/catalog";
import { Hero } from "@/components/home/hero";
import { LegacyHashRedirect } from "@/components/home/legacy-hash-redirect";
import { AVAILABLE_TOOLS } from "@/lib/tools-registry";

/** Datos estructurados de la landing para resultados enriquecidos en Google. */
const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "OSK APPS",
  alternateName: "OSK APPS — Herramientas online gratis",
  description:
    "La navaja suiza de herramientas online: PDF, imágenes, facturas, QR, acortador de links, calculadoras y más. Gratis, rápido y sin registro.",
  inLanguage: "es",
};

const APP_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "OSK APPS",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: AVAILABLE_TOOLS.map((t) => t.name),
};

/**
 * Landing de OSK APPS: héroe + catálogo completo.
 * Cada herramienta vive en su propia ruta real (/tools/<categoría>/<slug>)
 * con metadata, Open Graph y contenido SEO propios.
 */
export default function Home() {
  return (
    <>
      {/* Datos estructurados para buscadores */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }}
      />

      {/* Compatibilidad: redirige enlaces antiguos #/tool/<id> a la ruta real */}
      <LegacyHashRedirect />

      <Hero />
      <Catalog />
    </>
  );
}
