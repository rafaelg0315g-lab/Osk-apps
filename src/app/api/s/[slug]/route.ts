import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Página 404 mínima y estilizada (inline) para slugs inexistentes. */
const NOT_FOUND_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Link no encontrado</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #fafafa; color: #18181b; }
      .card { text-align: center; padding: 48px 32px; border: 1px solid #e4e4e7; border-radius: 16px; background: #ffffff; max-width: 380px; width: 100%; margin: 16px; }
      .code { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; color: #059669; }
      h1 { font-size: 20px; margin: 12px 0 8px; }
      p { font-size: 14px; color: #71717a; margin: 0 0 24px; line-height: 1.5; }
      a { display: inline-block; padding: 10px 20px; border-radius: 8px; background: #18181b; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; }
      a:hover { opacity: 0.9; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="code">404</div>
      <h1>Link no encontrado</h1>
      <p>El enlace que buscas no existe o fue eliminado por su autor.</p>
      <a href="/">Ir al inicio</a>
    </main>
  </body>
</html>`;

const SERVER_ERROR_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Error del servidor</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #fafafa; color: #18181b; }
      .card { text-align: center; padding: 48px 32px; border: 1px solid #e4e4e7; border-radius: 16px; background: #ffffff; max-width: 380px; width: 100%; margin: 16px; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { font-size: 14px; color: #71717a; margin: 0 0 24px; line-height: 1.5; }
      a { display: inline-block; padding: 10px 20px; border-radius: 8px; background: #18181b; color: #ffffff; font-size: 14px; font-weight: 500; text-decoration: none; }
      a:hover { opacity: 0.9; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Error del servidor</h1>
      <p>No se pudo procesar el enlace. Inténtalo de nuevo en unos segundos.</p>
      <a href="/">Ir al inicio</a>
    </main>
  </body>
</html>`;

function detectDevice(userAgent: string): string {
  if (/bot|spider|crawl/i.test(userAgent)) return "bot";
  if (/mobile|android.*mobile|iphone/i.test(userAgent)) return "mobile";
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  return "desktop";
}

function detectBrowser(userAgent: string): string {
  if (userAgent.includes("Edg") || userAgent.includes("Edge")) return "Edge";
  if (userAgent.includes("OPR") || userAgent.includes("Opera")) return "Opera";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Chrome") || userAgent.includes("Chromium")) return "Chrome";
  if (userAgent.includes("Safari")) return "Safari";
  return "Otro";
}

function detectOs(userAgent: string): string {
  if (userAgent.includes("Windows")) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad/i.test(userAgent)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Otro";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const link = await db.shortLink.findUnique({ where: { slug } });

    if (!link) {
      return new NextResponse(NOT_FOUND_HTML, {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    // Registrar el clic (device, browser, os, referrer). Un fallo aquí no bloquea el redirect.
    const userAgent = request.headers.get("user-agent") ?? "";
    const rawReferrer = request.headers.get("referer");
    try {
      await db.click.create({
        data: {
          linkId: link.id,
          referrer: rawReferrer ? rawReferrer.slice(0, 500) : null,
          device: detectDevice(userAgent),
          browser: detectBrowser(userAgent),
          os: detectOs(userAgent),
        },
      });
    } catch (clickError) {
      console.error("[GET /api/s/[slug]] No se pudo registrar el clic", clickError);
    }

    const response = NextResponse.redirect(link.url, 302);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("[GET /api/s/[slug]]", error);
    return new NextResponse(SERVER_ERROR_HTML, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
