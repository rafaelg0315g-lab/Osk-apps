import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

import { checkAiLimit, limitResetInMinutes } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Edición de imágenes con IA (quitar fondo, eliminar objetos/inpainting,
 * mejorar resolución, cambiar fondo, etc.).
 *
 * Cuerpo JSON:
 * - image: dataURL (data:image/...) de la imagen a editar  [máx ~10 MB]
 * - prompt: descripción de la edición en lenguaje natural
 * - size?: "1024x1024" | "768x1344" | "864x1152" | "1344x768" | "1152x864" | "1440x720" | "720x1440"
 *
 * Respuesta: { image: "data:image/png;base64,..." }
 */

const SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
] as const;

type EditSize = (typeof SIZES)[number];

const MAX_BASE64_CHARS = 14 * 1024 * 1024; // ~10 MB de imagen

export async function POST(req: Request) {
  const limit = checkAiLimit(req, "image");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Alcanzaste el límite diario de ediciones de imagen con IA. Vuelve a intentarlo en ${limitResetInMinutes(limit.resetAt)} minutos.`,
      },
      { status: 429 },
    );
  }

  let body: { image?: string; prompt?: string; size?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const image = body.image ?? "";
  const prompt = (body.prompt ?? "").trim();
  const size: EditSize = SIZES.includes(body.size as EditSize)
    ? (body.size as EditSize)
    : "1024x1024";

  if (!image.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Debes enviar una imagen válida (dataURL de imagen)." },
      { status: 400 },
    );
  }
  if (image.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: "La imagen es demasiado grande para procesar con IA (máximo ~10 MB)." },
      { status: 413 },
    );
  }
  if (!prompt) {
    return NextResponse.json({ error: "Describe la edición que quieres aplicar." }, { status: 400 });
  }

  try {
    const zai = await ZAI.create();
    const response = await zai.images.generations.edit({
      prompt,
      image,
      size,
    });

    const base64 = response.data?.[0]?.base64;
    if (!base64) {
      return NextResponse.json(
        { error: "La IA no devolvió imagen. Intenta con otra instrucción o imagen." },
        { status: 502 },
      );
    }

    return NextResponse.json({ image: `data:image/png;base64,${base64}` });
  } catch {
    return NextResponse.json(
      {
        error:
          "El servicio de edición con IA no está disponible en este momento. Intenta de nuevo en unos segundos.",
      },
      { status: 502 },
    );
  }
}
