import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { ProCards } from "@/components/pro/pro-cards";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Suite Profesional — Editores de imagen, video y audio",
  description:
    "Editores profesionales con proyectos guardados en tu cuenta: imagen por capas, video con timeline y audio con waveform. Incluido gratis en OSK APPS.",
  alternates: { canonical: "/pro" },
  openGraph: {
    title: "OSK PROFESIONAL — Editores con proyectos guardados",
    description:
      "Imagen por capas, video con timeline y audio con waveform. Crea tu cuenta gratis y retoma tus proyectos cuando quieras.",
    url: "/pro",
    siteName: "OSK APPS",
    type: "website",
    locale: "es",
  },
};

const STEPS = [
  {
    n: "1",
    title: "Crea tu cuenta gratis",
    desc: "Solo correo y contraseña. Sin tarjetas ni trámites.",
  },
  {
    n: "2",
    title: "Elige tu editor",
    desc: "Imagen, video o audio — cada uno con proyectos ilimitados.",
  },
  {
    n: "3",
    title: "Retoma cuando quieras",
    desc: "Autoguardado continuo: tus proyectos te esperan en “Mis proyectos”.",
  },
];

/** Landing de la sección PROFESIONAL (/pro). */
export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ login?: string }>;
}) {
  const { login } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-10 text-center">
        <Badge className="mb-4 gap-1.5 rounded-full border-transparent bg-amber-500/15 px-3 py-1 text-xs font-bold tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-400">
          <Sparkles className="size-3.5" aria-hidden />
          OSK PROFESIONAL
        </Badge>
        <h1 className="mx-auto max-w-2xl text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
          La suite de edición{" "}
          <span className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 bg-clip-text text-transparent">
            profesional
          </span>{" "}
          de OSK APPS
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
          Tres editores avanzados con sistema de proyectos guardables: crea, cierra y retoma tu
          trabajo desde cualquier dispositivo. Incluido gratis durante el lanzamiento.
        </p>
      </div>

      <ProCards openLogin={login === "1"} />

      <section className="mt-14" aria-labelledby="pro-how">
        <h2 id="pro-how" className="mb-6 text-center text-lg font-bold tracking-tight">
          Cómo funciona
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-xl border bg-card p-5">
              <span className="mb-3 inline-flex size-8 items-center justify-center rounded-lg bg-amber-500/15 text-sm font-bold text-amber-700 dark:bg-amber-400/15 dark:text-amber-400">
                {step.n}
              </span>
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
