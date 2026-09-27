import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectsView } from "@/components/pro/projects-view";
import { isProToolType, PRO_TOOLS } from "@/lib/pro-tools";

type PageProps = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params;
  if (!isProToolType(type)) return {};
  const tool = PRO_TOOLS[type];
  return {
    title: `Mis proyectos — ${tool.name}`,
    description: `${tool.description} Guarda y retoma tus proyectos en este dispositivo con OSK APPS.`,
    robots: { index: false },
  };
}

/** Vista "Mis proyectos" de un editor PRO. Los proyectos viven en el dispositivo. */
export default async function ProToolPage({ params }: PageProps) {
  const { type } = await params;
  if (!isProToolType(type)) notFound();

  return <ProjectsView type={type} />;
}
