import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { ProjectsView } from "@/components/pro/projects-view";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ProProjectDTO } from "@/lib/pro-client";
import { isProToolType, PRO_TOOLS } from "@/lib/pro-tools";

type PageProps = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params;
  if (!isProToolType(type)) return {};
  const tool = PRO_TOOLS[type];
  return {
    title: `Mis proyectos — ${tool.name}`,
    description: `${tool.description} Guarda y retoma tus proyectos en OSK APPS.`,
    robots: { index: false },
  };
}

/** Vista "Mis proyectos" de un editor PRO. Requiere sesión. */
export default async function ProToolPage({ params }: PageProps) {
  const { type } = await params;
  if (!isProToolType(type)) notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/pro?login=1");

  const projects = await db.project.findMany({
    where: { userId: session.user.id, type },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      type: true,
      name: true,
      thumbnail: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const initialProjects: ProProjectDTO[] = projects.map((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    thumbnail: p.thumbnail,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return <ProjectsView type={type} initialProjects={initialProjects} />;
}
