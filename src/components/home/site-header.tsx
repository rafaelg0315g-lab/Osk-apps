"use client";

import Link from "next/link";
import { Heart, Layers, Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";

export function SiteHeader() {
  const setDonateOpen = useAppStore((s) => s.setDonateOpen);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="OSK APPS — Inicio"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Layers className="size-4.5" aria-hidden />
          </span>
          <span className="text-[15px] font-bold tracking-tight">
            OSK <span className="text-muted-foreground font-semibold">APPS</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Navegación principal">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="relative gap-1.5 border-amber-500/40 bg-amber-500/10 font-bold tracking-wide text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400 dark:hover:bg-amber-400/20"
          >
            <Link href="/pro" aria-label="Suite Profesional (en desarrollo)">
              <Sparkles className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">PROFESIONAL</span>
              <span className="sm:hidden">PRO</span>
              <span
                aria-hidden
                title="En desarrollo"
                className="absolute -right-1 -top-1 size-2 rounded-full border-2 border-background bg-amber-500"
              />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/#catalogo">Herramientas</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDonateOpen(true)}
            className="gap-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
            aria-label="Abrir ventana de donación"
          >
            <Heart className="size-4 fill-current" aria-hidden />
            <span className="hidden sm:inline">Donar</span>
          </Button>
          <ThemeToggle />
          <Button size="sm" asChild>
            <Link href="/#catalogo">Explorar</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
