"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, FolderOpen, HardDrive, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  type LocalProject,
} from "@/lib/pro/local-projects";
import { PRO_TOOLS, type ProToolType } from "@/lib/pro-tools";
import { cn, formatDate } from "@/lib/utils";

/**
 * Vista "Mis proyectos" de un editor PRO: lista con miniatura, fecha,
 * botones Abrir/Eliminar y creación de proyectos nuevos.
 * Los proyectos se guardan en el dispositivo (IndexedDB), sin cuentas.
 */
export function ProjectsView({ type }: { type: ProToolType }) {
  const tool = PRO_TOOLS[type];
  const Icon = tool.icon;
  const router = useRouter();

  const [projects, setProjects] = useState<LocalProject[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listLocalProjects(type)
      .then((list) => {
        if (active) setProjects(list);
      })
      .catch(() => {
        if (active) {
          toast.error("No pudimos leer los proyectos guardados en este dispositivo.");
          setProjects([]);
        }
      });
    return () => {
      active = false;
    };
  }, [type]);

  async function createProject() {
    if (creating) return;
    setCreating(true);
    try {
      const project = await createLocalProject(type, "Proyecto sin título");
      router.push(`${tool.hrefBase}/${project.id}`);
    } catch {
      toast.error("No pudimos crear el proyecto en este dispositivo.");
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    setPendingDeleteId(id);
    try {
      await deleteLocalProject(id);
      setProjects((ps) => (ps ? ps.filter((p) => p.id !== id) : ps));
      toast.success("Proyecto eliminado");
    } catch {
      toast.error("No pudimos eliminar el proyecto.");
    } finally {
      setPendingDeleteId(null);
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/pro"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Suite Profesional
      </Link>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span
            className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tool.chipClass)}
          >
            <Icon className="size-5.5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{tool.name}</h1>
            <p className="text-sm text-muted-foreground">
              Tus proyectos se guardan automáticamente en este dispositivo.
            </p>
          </div>
        </div>
        <Button onClick={createProject} disabled={creating} className={cn("gap-2", tool.buttonClass)}>
          {creating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Nuevo proyecto
        </Button>
      </div>

      {projects === null ? (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Cargando proyectos…
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-20 text-center">
          <span
            className={cn("flex size-14 items-center justify-center rounded-2xl", tool.chipClass)}
          >
            <Icon className="size-7" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">Aún no tienes proyectos</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Crea tu primer proyecto de {tool.name.toLowerCase()} y retómalo cuando quieras. Se
              guarda en este navegador, sin cuentas ni registros.
            </p>
          </div>
          <Button onClick={createProject} disabled={creating} className={cn("gap-2", tool.buttonClass)}>
            <Plus className="size-4" aria-hidden />
            Crear mi primer proyecto
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Card className="flex items-center gap-4 p-4 transition-colors hover:border-primary/30 sm:gap-5">
                <div
                  className={cn(
                    "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:size-16",
                    tool.chipClass,
                  )}
                >
                  {project.thumbnail ? (
                    <img
                      src={project.thumbnail}
                      alt={`Miniatura de ${project.name}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <Icon className="size-6" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{project.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" aria-hidden />
                    Editado {formatDate(new Date(project.updatedAt))}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link href={`${tool.hrefBase}/${project.id}`}>
                      <FolderOpen className="size-4" aria-hidden />
                      Abrir
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                    onClick={() => setDeletingId(project.id)}
                    aria-label={`Eliminar ${project.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    <span className="hidden sm:inline">Eliminar</span>
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <HardDrive className="size-3.5" aria-hidden />
        Guardado local en este navegador
        {projects && projects.length > 0
          ? ` · ${projects.length} ${projects.length === 1 ? "proyecto" : "proyectos"}`
          : ""}
      </div>

      <AlertDialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &quot;{projects?.find((p) => p.id === deletingId)?.name}&quot; y todo su
              contenido de este dispositivo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteProject(deletingId)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pendingDeleteId && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
