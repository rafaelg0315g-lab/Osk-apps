import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { EditorShell } from "@/components/pro/editor-shell";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isProToolType } from "@/lib/pro-tools";

type PageProps = { params: Promise<{ type: string; projectId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type, projectId } = await params;
  if (!isProToolType(type)) return {};

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return {};

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) return {};

  return {
    title: project.name,
    robots: { index: false },
  };
}

/**
 * Workspace de un proyecto PRO (esqueleto del editor).
 * Verifica sesión + ownership: un proyecto ajeno responde 404.
 */
export default async function ProProjectPage({ params }: PageProps) {
  const { type, projectId } = await params;
  if (!isProToolType(type)) notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/pro?login=1");

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id || project.type !== type) notFound();

  return (
    <EditorShell
      type={type}
      project={{
        id: project.id,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      }}
    />
  );
}
