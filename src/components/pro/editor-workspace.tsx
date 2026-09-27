"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Check,
  CloudUpload,
  FolderSearch,
  Loader2,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getLocalProject,
  updateLocalProject,
  type LocalProjectPatch,
} from "@/lib/pro/local-projects";
import { PRO_TOOLS, type ProToolType } from "@/lib/pro-tools";
import { cn, formatDate } from "@/lib/utils";

/**
 * Contrato de todos los editores PRO (imagen / audio / video).
 * - El editor recibe el proyecto cargado y notifica cambios de estado.
 * - El workspace se encarga del autoguardado en el dispositivo (debounce),
 *   del nombre del proyecto y del badge "Guardado".
 */
export interface ProEditorProps {
  projectId: string;
  initialData: unknown;
  /** El editor avisa que hay cambios (estado serializable + miniatura opcional). */
  onChange: (patch: LocalProjectPatch) => void;
}

const ImageEditor = dynamic<ProEditorProps>(
  () => import("@/components/pro/editors/image-editor"),
  {
    ssr: false,
    loading: () => <EditorLoading />,
  },
);
const AudioEditor = dynamic<ProEditorProps>(
  () => import("@/components/pro/editors/audio-editor"),
  {
    ssr: false,
    loading: () => <EditorLoading />,
  },
);
const VideoEditor = dynamic<ProEditorProps>(
  () => import("@/components/pro/editors/video-editor"),
  {
    ssr: false,
    loading: () => <EditorLoading />,
  },
);

function EditorLoading() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border bg-muted/20 text-sm text-muted-foreground">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      Cargando editor…
    </div>
  );
}

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
        Guardado en este dispositivo
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
 * Workspace del editor PRO: barra superior con nombre editable,
 * autoguardado (debounce + al salir de la página) y el editor por tipo.
 */
export function EditorWorkspace({ type, projectId }: { type: ProToolType; projectId: string }) {
  const tool = PRO_TOOLS[type];
  const Icon = tool.icon;

  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [name, setName] = useState("");
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [initialData, setInitialData] = useState<unknown>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<LocalProjectPatch | null>(null);
  const savedNameRef = useRef("");
  const dataRef = useRef<unknown>(null);

  // Carga inicial del proyecto desde el dispositivo
  useEffect(() => {
    let active = true;
    getLocalProject(projectId)
      .then((project) => {
        if (!active) return;
        if (!project || project.type !== type) {
          setStatus("missing");
          return;
        }
        setName(project.name);
        savedNameRef.current = project.name;
        setCreatedAt(project.createdAt);
        setInitialData(project.data);
        dataRef.current = project.data;
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("missing");
      });
    return () => {
      active = false;
    };
  }, [projectId, type]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    if (!patch) return;
    pendingRef.current = null;
    setSaveState("saving");
    try {
      await updateLocalProject(projectId, patch);
      setSaveState("saved");
    } catch {
      // Re-encola para reintentar en el próximo cambio
      pendingRef.current = patch;
      setSaveState("error");
    }
  }, [projectId]);

  const scheduleSave = useCallback(
    (patch: LocalProjectPatch) => {
      pendingRef.current = { ...(pendingRef.current ?? {}), ...patch };
      if (patch.data !== undefined) dataRef.current = patch.data;
      setSaveState("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), 1200);
    },
    [flush],
  );

  const onEditorChange = useCallback(
    (patch: LocalProjectPatch) => scheduleSave(patch),
    [scheduleSave],
  );

  function onNameChange(value: string) {
    setName(value);
    scheduleSave({ name: value });
  }

  function onNameBlur() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== savedNameRef.current) {
      savedNameRef.current = trimmed;
      scheduleSave({ name: trimmed });
    }
    void flush();
  }

  // Guarda al salir del editor (pestaña oculta / cierre)
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") void flush();
    }
    function onBeforeUnload() {
      void flush();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Último guardado al desmontar
      void flush();
    };
  }, [flush]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
        Cargando proyecto…
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <FolderSearch className="size-7" aria-hidden />
        </span>
        <div>
          <p className="flex items-center justify-center gap-1.5 font-semibold">
            <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
            Proyecto no encontrado
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Este proyecto no existe en este dispositivo (los proyectos se guardan localmente por
            navegador). Puede que hayas cambiado de dispositivo o limpiado los datos del sitio.
          </p>
        </div>
        <Button asChild className={cn("gap-2", tool.buttonClass)}>
          <Link href={tool.hrefBase}>Ir a Mis proyectos</Link>
        </Button>
      </div>
    );
  }

  const Editor =
    type === "image" ? ImageEditor : type === "audio" ? AudioEditor : VideoEditor;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={tool.hrefBase}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Mis proyectos
        </Link>
        <SaveBadge state={saveState} />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
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
              onBlur={onNameBlur}
              aria-label="Nombre del proyecto"
              className="h-9 max-w-sm border-transparent bg-transparent px-2 text-xl font-bold tracking-tight shadow-none hover:border-border sm:text-2xl"
            />
            <p className="ml-2 text-xs text-muted-foreground">
              {tool.name}
              {createdAt !== null ? ` · Creado ${formatDate(new Date(createdAt))}` : ""}
            </p>
          </div>
        </div>
      </div>

      <Editor projectId={projectId} initialData={initialData} onChange={onEditorChange} />
    </div>
  );
}
