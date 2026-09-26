import { randomBytes } from "crypto";

import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const SLUG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const AUTO_SLUG_LENGTH = 7;
const CUSTOM_SLUG_REGEX = /^[a-z0-9-]{3,30}$/;
const MAX_TITLE_LENGTH = 100;

/** Genera un slug aleatorio de N caracteres a partir de bytes criptográficos. */
function generateRandomSlug(length = AUTO_SLUG_LENGTH): string {
  const bytes = randomBytes(length);
  let slug = "";
  for (let i = 0; i < length; i += 1) {
    slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return slug;
}

/** Deriva la URL corta absoluta desde los headers de la petición (con fallback). */
function buildShortUrl(request: NextRequest, slug: string): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (forwardedProto ? forwardedProto.split(",")[0].trim() : "") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  return `${proto}://${host}/api/s/${slug}`;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Cuerpo de la petición inválido (se esperaba JSON)" },
        { status: 400 }
      );
    }

    const payload = (body ?? {}) as { url?: unknown; customSlug?: unknown; title?: unknown };
    const rawUrl = typeof payload.url === "string" ? payload.url.trim() : "";
    const customSlug = typeof payload.customSlug === "string" ? payload.customSlug.trim() : "";
    const rawTitle = typeof payload.title === "string" ? payload.title.trim() : "";

    if (!rawUrl) {
      return NextResponse.json({ error: "Ingresa una URL para acortar" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json(
        { error: "Ingresa una URL válida (debe comenzar con http:// o https://)" },
        { status: 400 }
      );
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Ingresa una URL válida (debe comenzar con http:// o https://)" },
        { status: 400 }
      );
    }

    if (customSlug && !CUSTOM_SLUG_REGEX.test(customSlug)) {
      return NextResponse.json(
        { error: "El slug personalizado debe tener 3-30 caracteres (letras, números y guiones)" },
        { status: 400 }
      );
    }

    if (rawTitle.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: "El título no puede superar los 100 caracteres" },
        { status: 400 }
      );
    }

    let slug: string;
    if (customSlug) {
      const existing = await db.shortLink.findUnique({ where: { slug: customSlug } });
      if (existing) {
        return NextResponse.json(
          { error: "Ese slug ya está en uso, prueba otro" },
          { status: 409 }
        );
      }
      slug = customSlug;
    } else {
      slug = "";
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = generateRandomSlug();
        const existing = await db.shortLink.findUnique({ where: { slug: candidate } });
        if (!existing) {
          slug = candidate;
          break;
        }
      }
      if (!slug) {
        return NextResponse.json(
          { error: "No se pudo generar un slug único, inténtalo de nuevo" },
          { status: 500 }
        );
      }
    }

    const link = await db.shortLink.create({
      data: {
        slug,
        url: parsedUrl.toString(),
        title: rawTitle || null,
      },
    });

    return NextResponse.json(
      {
        slug: link.slug,
        path: `/api/s/${link.slug}`,
        shortUrl: buildShortUrl(request, link.slug),
        url: link.url,
        title: link.title,
        createdAt: link.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/links]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const links = await db.shortLink.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        url: true,
        title: true,
        createdAt: true,
        _count: { select: { clicks: true } },
        clicks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    return NextResponse.json({
      links: links.map((link) => ({
        id: link.id,
        slug: link.slug,
        url: link.url,
        title: link.title,
        createdAt: link.createdAt,
        totalClicks: link._count.clicks,
        lastClickAt: link.clicks[0]?.createdAt ?? null,
      })),
    });
  } catch (error) {
    console.error("[GET /api/links]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
