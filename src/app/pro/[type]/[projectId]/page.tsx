import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EditorWorkspace } from "@/components/pro/editor-workspace";
import { isProToolType, PRO_TOOLS } from "@/lib/pro-tools";

type PageProps = { params: Promise<{ type: string; projectId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params;
  if (!isProToolType(type)) return {};
  const tool = PRO_TOOLS[type];
  return {
    title: `Editor — ${tool.name}`,
    description: `${tool.description} Proyecto guardado en tu dispositivo.`,
    robots: { index: false },
  };
}

/**
 * Workspace de un proyecto PRO (editor completo).
 * El proyecto se carga desde el almacenamiento local del dispositivo;
 * un ID inexistente muestra un aviso con enlace a "Mis proyectos".
 */
export default async function ProProjectPage({ params }: PageProps) {
  const { type, projectId } = await params;
  if (!isProToolType(type)) notFound();

  return <EditorWorkspace type={type} projectId={projectId} />;
}
