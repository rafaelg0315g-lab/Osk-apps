"use client";

import { Heart, Layers } from "lucide-react";

import { TOOL_CATEGORIES } from "@/lib/tools-registry";
import { useAppStore } from "@/lib/store";

export function SiteFooter() {
  const setDonateOpen = useAppStore((s) => s.setDonateOpen);
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto border-t bg-muted/30 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_2fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="size-4.5" aria-hidden />
            </span>
            <span className="text-[15px] font-bold tracking-tight">
              OSK <span className="font-semibold text-muted-foreground">APPS</span>
            </span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            La navaja suiza de herramientas online. Gratis, rápido y sin registro — todo en un
            solo lugar.
          </p>
        </div>

        <nav aria-label="Categorías del catálogo" className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Catálogo
            </p>
            <ul className="space-y-1.5">
              {TOOL_CATEGORIES.slice(0, 4).map((cat) => (
                <li key={cat.id}>
                  <a
                    href={`#cat-${cat.id}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {cat.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Más categorías
            </p>
            <ul className="space-y-1.5">
              {TOOL_CATEGORIES.slice(4).map((cat) => (
                <li key={cat.id}>
                  <a
                    href={`#cat-${cat.id}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {cat.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Producto
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>100% gratis</li>
              <li>Sin registro</li>
              <li>Archivos borrados al instante</li>
              <li>Dark mode incluido</li>
              <li>
                <button
                  type="button"
                  onClick={() => setDonateOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded text-rose-600 transition-colors hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                  aria-label="Apoya el proyecto con una donación"
                >
                  <Heart className="size-3.5 fill-current" aria-hidden />
                  Apoya con una donación
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {year} OSK APPS. Todos los derechos reservados.</p>
          <p>Tus archivos nunca se almacenan de forma permanente.</p>
        </div>
      </div>
    </footer>
  );
}
