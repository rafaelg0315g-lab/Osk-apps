"use client";

import Link from "next/link";
import { Heart, Layers } from "lucide-react";

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
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <a href="#catalogo">Herramientas</a>
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
            <a href="#catalogo">Explorar</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
