"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
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
import { apiJson, type ProProjectDTO } from "@/lib/pro-client";
import { PRO_TOOLS, type ProToolType } from "@/lib/pro-tools";
import { cn, formatDate } from "@/lib/utils";

/**
 * Vista "Mis proyectos" de un editor PRO: lista con miniatura, fecha,
 * botones Abrir/Eliminar y creación de proyectos nuevos.
 */
export function ProjectsView({
  type,
  initialProjects,
}: {
  type: ProToolType;
  initialProjects: ProProjectDTO[];
}) {
  const tool = PRO_TOOLS[type];
  const Icon = tool.icon;
  const router = useRouter();

  const [projects, setProjects] = useState(initialProjects);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function createProject() {
    if (creating) return;
    setCreating(true);
    const res = await apiJson<{ project: ProProjectDTO }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ type, name: "Proyecto sin título" }),
    });
    if (res.ok && res.data?.project) {
      router.push(`${tool.hrefBase}/${res.data.project.id}`);
    } else {
      toast.error(res.error ?? "No pudimos crear el proyecto.");
      setCreating(false);
    }
  }

  async function deleteProject(id: string) {
    setPendingDeleteId(id);
    const res = await apiJson(`/api/projects/${id}`, { method: "DELETE" });
    setPendingDeleteId(null);
    setDeletingId(null);
    if (res.ok) {
      setProjects((ps) => ps.filter((p) => p.id !== id));
      toast.success("Proyecto eliminado");
    } else {
      toast.error(res.error ?? "No pudimos eliminar el proyecto.");
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
              Tus proyectos se guardan automáticamente en tu cuenta.
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

      {projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-20 text-center">
          <span
            className={cn("flex size-14 items-center justify-center rounded-2xl", tool.chipClass)}
          >
            <Icon className="size-7" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">Aún no tienes proyectos</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Crea tu primer proyecto de {tool.name.toLowerCase()} y retómalo cuando quieras.
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
                    Editado {formatDate(project.updatedAt)}
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

      <AlertDialog open={deletingId !== null} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &quot;{projects.find((p) => p.id === deletingId)?.name}&quot; y todo su
              contenido. Esta acción no se puede deshacer.
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
