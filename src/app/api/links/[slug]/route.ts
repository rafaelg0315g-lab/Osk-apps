import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const DAYS_WINDOW = 14;

/** Convierte una fecha a clave "YYYY-MM-DD" en la zona horaria del servidor. */
function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Extrae el hostname del referrer; null o inválido se agrupa como "Directo"/crudo. */
function normalizeReferrer(referrer: string | null): string {
  if (!referrer) return "Directo";
  try {
    const parsed = new URL(referrer);
    return parsed.hostname || referrer;
  } catch {
    return referrer.slice(0, 100);
  }
}

function countBy<T>(items: T[], getKey: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const link = await db.shortLink.findUnique({
      where: { slug },
      select: { id: true, slug: true, url: true, title: true, createdAt: true },
    });

    if (!link) {
      return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
    }

    const clicks = await db.click.findMany({
      where: { linkId: link.id },
      select: { id: true, createdAt: true, referrer: true, device: true, browser: true },
      orderBy: { createdAt: "desc" },
    });

    // Serie de los últimos 14 días (incluye hoy), con los días sin clics en 0.
    const countsByDay = countBy(clicks, (click) => toDayKey(click.createdAt));
    const clicksByDay: { date: string; count: number }[] = [];
    for (let offset = DAYS_WINDOW - 1; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - offset);
      const key = toDayKey(day);
      clicksByDay.push({ date: key, count: countsByDay.get(key) ?? 0 });
    }

    // Top referers (máx. 5) sobre el total histórico de clics.
    const referrerCounts = countBy(clicks, (click) => normalizeReferrer(click.referrer));
    const topReferrers = Array.from(referrerCounts.entries())
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count || a.referrer.localeCompare(b.referrer))
      .slice(0, 5);

    // Dispositivos (conteo completo).
    const deviceCounts = countBy(clicks, (click) => click.device ?? "unknown");
    const devices = Array.from(deviceCounts.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count);

    // Navegadores (top 5).
    const browserCounts = countBy(clicks, (click) => click.browser ?? "Otro");
    const browsers = Array.from(browserCounts.entries())
      .map(([browser, count]) => ({ browser, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return NextResponse.json({
      link,
      totalClicks: clicks.length,
      clicksByDay,
      topReferrers,
      devices,
      browsers,
      recentClicks: clicks.slice(0, 10),
    });
  } catch (error) {
    console.error("[GET /api/links/[slug]]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const link = await db.shortLink.findUnique({ where: { slug }, select: { id: true } });
    if (!link) {
      return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });
    }

    // Los clics se eliminan explícitamente (la relación ya tiene onDelete: Cascade).
    await db.click.deleteMany({ where: { linkId: link.id } });
    await db.shortLink.delete({ where: { id: link.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/links/[slug]]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
