"use client";

import { useEffect } from "react";

import { Catalog } from "@/components/home/catalog";
import { Hero } from "@/components/home/hero";
import { SiteFooter } from "@/components/home/site-footer";
import { SiteHeader } from "@/components/home/site-header";
import { ToolView } from "@/components/home/tool-view";
import { DonateWidget } from "@/components/shared/donate-widget";
import { useAppStore } from "@/lib/store";
import { AVAILABLE_TOOLS, getToolById } from "@/lib/tools-registry";

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
 * OSK APPS — Aplicación de página única (SPA).
 * La navegación entre la landing y cada herramienta se maneja con el hash
 * de la URL (#/tool/<id>), de modo que el botón "atrás" del navegador
 * funciona sin rutas adicionales.
 */
function hashToToolId(): string | null {
  if (typeof window === "undefined") return null;
  const match = /^#\/tool\/([\w-]+)$/.exec(window.location.hash);
  if (!match) return null;
  // Solo aceptamos ids que existan en el catálogo
  return getToolById(match[1]) ? match[1] : null;
}

export default function Home() {
  const activeToolId = useAppStore((s) => s.activeToolId);
  const openTool = useAppStore((s) => s.openTool);
  const goHome = useAppStore((s) => s.goHome);

  // Sincroniza el estado con el hash de la URL (deep-linking + botón atrás)
  useEffect(() => {
    const syncFromHash = () => {
      const id = hashToToolId();
      if (id) {
        if (id !== useAppStore.getState().activeToolId) openTool(id);
      } else if (useAppStore.getState().activeToolId) {
        goHome();
      }
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [openTool, goHome]);

  // Al cambiar de herramienta mediante el store, refleja el hash
  useEffect(() => {
    const expected = activeToolId ? `#/tool/${activeToolId}` : "";
    if (window.location.hash !== expected) {
      history.replaceState(
        null,
        "",
        expected || `${window.location.pathname}${window.location.search}`,
      );
    }
    // Scroll al inicio al abrir/cerrar herramienta
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [activeToolId]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Datos estructurados para buscadores */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_JSON_LD) }}
      />

      <SiteHeader />
      <main className="flex-1">
        {activeToolId ? <ToolView toolId={activeToolId} /> : (
          <>
            <Hero />
            <Catalog />
          </>
        )}
      </main>
      <SiteFooter />
      <DonateWidget />
    </div>
  );
}
