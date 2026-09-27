"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CloudUpload, Construction, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiJson } from "@/lib/pro-client";
import { PRO_TOOLS, type ProToolType } from "@/lib/pro-tools";
import { cn, formatDate } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Guardando…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" aria-hidden />
        Guardado
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
        <CloudUpload className="size-3.5" aria-hidden />
        Error al guardar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <CloudUpload className="size-3.5" aria-hidden />
      Autoguardado activo
    </span>
  );
}

/**
 * Esqueleto del editor PRO: barra superior con nombre editable,
 * autoguardado (debounce + blur) y área de trabajo reservada para el
 * lienzo/timeline de la siguiente fase.
 */
export function EditorShell({
  type,
  project,
}: {
  type: ProToolType;
  project: { id: string; name: string; createdAt: string; updatedAt: string };
}) {
  const tool = PRO_TOOLS[type];
  const Icon = tool.icon;

  const [name, setName] = useState(project.name);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedNameRef = useRef(project.name);

  async function saveName(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === savedNameRef.current) return;
    savedNameRef.current = trimmed;
    setSaveState("saving");
    const res = await apiJson(`/api/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      setSaveState("saved");
    } else {
      setSaveState("error");
      toast.error(res.error ?? "No pudimos guardar el proyecto.");
    }
  }

  function onNameChange(value: string) {
    setName(value);
    setSaveState("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveName(value), 700);
  }

  // Limpia el temporizador pendiente al desmontar (salir del editor)
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href={tool.hrefBase}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Mis proyectos
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tool.chipClass)}
          >
            <Icon className="size-5.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={() => void saveName(name)}
              aria-label="Nombre del proyecto"
              className="h-9 max-w-sm border-transparent bg-transparent px-2 text-xl font-bold tracking-tight shadow-none hover:border-border sm:text-2xl"
            />
            <p className="ml-2 text-xs text-muted-foreground">
              {tool.name} · Creado {formatDate(project.createdAt)}
            </p>
          </div>
        </div>
        <SaveBadge state={saveState} />
      </div>

      {/* Lienzo / timeline — se implementa en la siguiente fase */}
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-muted/20 p-10 text-center">
        <span
          className={cn("flex size-16 items-center justify-center rounded-2xl", tool.chipClass)}
        >
          <Icon className="size-8" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <p className="flex items-center justify-center gap-2 font-semibold">
            <Construction
              className="size-4.5 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            Editor en construcción
          </p>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            El lienzo del {tool.name.toLowerCase()} llega en la siguiente fase. Este esqueleto ya
            incluye el sistema de proyectos: este proyecto está guardado en tu cuenta y podrás
            retomarlo cuando el editor esté listo.
          </p>
        </div>
        <Badge
          variant="outline"
          className="gap-1 rounded-full border-amber-500/40 text-[10px] font-bold text-amber-700 dark:border-amber-400/30 dark:text-amber-400"
        >
          PRO
        </Badge>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        ID del proyecto:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">{project.id}</code>
      </p>
    </div>
  );
}
