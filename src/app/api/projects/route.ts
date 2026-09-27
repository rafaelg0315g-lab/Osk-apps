import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const VALID_TYPES = new Set(["image", "video", "audio"]);

function serialize(project: {
  id: string;
  type: string;
  name: string;
  thumbnail: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: project.id,
    type: project.type,
    name: project.name,
    thumbnail: project.thumbnail,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** Lista los proyectos del usuario autenticado (filtro opcional ?type=). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }

  const type = new URL(req.url).searchParams.get("type") ?? undefined;
  const where = {
    userId: session.user.id,
    ...(type ? { type: VALID_TYPES.has(type) ? type : "__none__" } : {}),
  };

  const projects = await db.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: { id: true, type: true, name: true, thumbnail: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ projects: projects.map(serialize) });
}

/** Crea un proyecto nuevo para el usuario autenticado. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { type?: unknown; name?: unknown } | null;
  const type = typeof body?.type === "string" ? body.type : "";
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Tipo de proyecto inválido." }, { status: 400 });
  }

  const name =
    typeof body?.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "Proyecto sin título";

  const project = await db.project.create({
    data: { userId: session.user.id, type, name },
  });

  return NextResponse.json({ project: serialize(project) }, { status: 201 });
}
