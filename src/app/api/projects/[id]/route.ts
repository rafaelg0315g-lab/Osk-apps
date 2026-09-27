import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Devuelve el proyecto si existe y pertenece al usuario autenticado.
 * Si el proyecto no existe o es de otro usuario responde 404 (no filtra
 * la existencia de proyectos ajenos).
 */
async function requireOwnedProject(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      errorResponse: NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 }),
    } as const;
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project || project.userId !== session.user.id) {
    return {
      errorResponse: NextResponse.json(
        { error: "Proyecto no encontrado." },
        { status: 404 },
      ),
    } as const;
  }

  return { project } as const;
}

function serialize(project: {
  id: string;
  type: string;
  name: string;
  data: string | null;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: project.id,
    type: project.type,
    name: project.name,
    data: project.data,
    thumbnail: project.thumbnail,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Obtiene un proyecto completo (incluye data para el editor). */
export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if ("errorResponse" in result) return result.errorResponse;

  return NextResponse.json({ project: serialize(result.project) });
}

/** Autoguardado: actualiza nombre, estado (data) o miniatura del proyecto. */
export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if ("errorResponse" in result) return result.errorResponse;

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    data?: unknown;
    thumbnail?: unknown;
  } | null;

  const update: { name?: string; data?: string | null; thumbnail?: string | null } = {};

  if (typeof body?.name === "string" && body.name.trim()) {
    update.name = body.name.trim().slice(0, 80);
  }
  if (typeof body?.data === "string") {
    // Límite de seguridad: 2 MB de estado serializado por proyecto
    if (body.data.length > 2_000_000) {
      return NextResponse.json({ error: "El proyecto es demasiado grande para autoguardar." }, { status: 413 });
    }
    update.data = body.data;
  } else if (body?.data === null) {
    update.data = null;
  }
  if (typeof body?.thumbnail === "string") {
    if (body.thumbnail.length > 500_000) {
      return NextResponse.json({ error: "La miniatura es demasiado grande." }, { status: 413 });
    }
    update.thumbnail = body.thumbnail;
  } else if (body?.thumbnail === null) {
    update.thumbnail = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  const updated = await db.project.update({ where: { id }, data: update });
  return NextResponse.json({ project: serialize(updated) });
}

/** Elimina un proyecto del usuario autenticado. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const result = await requireOwnedProject(id);
  if ("errorResponse" in result) return result.errorResponse;

  await db.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
