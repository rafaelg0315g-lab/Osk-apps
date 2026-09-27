import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

import { checkAiLimit, limitResetInMinutes } from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Endpoint general de chat/texto con IA.
 *
 * Cuerpo:
 * - system?: string             → prompt de sistema
 * - messages: {role, content}[] → conversación (último mensaje = petición)
 * - json?: boolean              → si true, exige y parsea respuesta JSON
 *
 * Modo "editor PRO" (patrón: la IA controla operaciones ya construidas):
 * - scene: "image-editor" | "audio-editor" | "video-editor"
 * - instruction: string         → pedido del usuario en lenguaje natural
 * - context?: string            → estado resumido del proyecto (capas, pistas…)
 *   → Responde { reply, operations: Op[], unsupported: string[] }
 */

type ChatMessage = { role: "user" | "assistant"; content: string };

const IMAGE_OPS = `Operaciones disponibles del editor de imagen (cada una es un objeto en "operations"):
- {"op":"setBrightness","value":-100..100}
- {"op":"setContrast","value":-100..100}
- {"op":"setSaturation","value":-100..100}
- {"op":"setBlur","value":0..20}
- {"op":"setGrayscale"} | {"op":"setSepia"} | {"op":"setInvert"}
- {"op":"setPixelate","value":2..50}
- {"op":"addText","text":"...","fontSize":12..120,"color":"#hex","x":0..1,"y":0..1} (x,y relativos al lienzo)
- {"op":"addRectangle","color":"#hex","opacity":0..1,"x":0..1,"y":0..1,"w":0..1,"h":0..1}
- {"op":"clearFilters"}
NO está soportado (avísalo en "unsupported"): recortar con precisión, rotar, eliminar objetos con IA desde el chat (usa el botón "IA de imagen"), dibujar formas libres.`;

const AUDIO_OPS = `Operaciones disponibles del editor de audio (cada una es un objeto en "operations"):
- {"op":"normalize"} (normaliza el volumen del pico a -1 dBFS)
- {"op":"setGain","db":-24..24} (volumen general en decibelios)
- {"op":"reduceNoise","strength":0..100} (reducción de ruido espectral)
- {"op":"setEq","band":"60Hz"|"150Hz"|"400Hz"|"1kHz"|"2.4kHz"|"6kHz"|"10kHz"|"14kHz","gain":-15..15} (ecualizador de 8 bandas)
- {"op":"fadeOut","seconds":0.1..30} | {"op":"fadeIn","seconds":0.1..30}
- {"op":"setSpeed","rate":0.25..4} (cambia velocidad; afecta el tono)
- {"op":"setPitch","semitones":-12..12} (modulador de tono)
- {"op":"applyPreset","preset":"robot"|"echo"|"chipmunk"|"deep"|"telephone"}
NO está soportado (avísalo en "unsupported"): cortar o seleccionar regiones desde el chat (usa la waveform), unir archivos, generar música o voces.`;

const VIDEO_OPS = `Operaciones disponibles del editor de video (cada una es un objeto en "operations"):
- {"op":"addText","text":"...","fontSize":12..120,"color":"#hex","position":"top"|"center"|"bottom","start":0,"end":0} (start/end en segundos dentro de la línea de tiempo)
- {"op":"setClipVolume","clipIndex":0,"volume":0..2} (volumen del clip N)
- {"op":"setTransition","type":"none"|"fade","duration":0.2..2} (transición entre clips)
- {"op":"removeClip","clipIndex":0}
- {"op":"moveClip","from":0,"to":1}
NO está soportado (avísalo en "unsupported"): recortar clips con precisión (usa el timeline), agregar clips, efectos avanzados, exportar.`;

const SCENES: Record<string, string> = {
  "image-editor": IMAGE_OPS,
  "audio-editor": AUDIO_OPS,
  "video-editor": VIDEO_OPS,
};

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("La IA no devolvió un JSON válido para esta operación.");
  }
}

export async function POST(req: Request) {
  const limit = checkAiLimit(req, "chat");
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Alcanzaste el límite diario de operaciones de IA. Vuelve a intentarlo en ${limitResetInMinutes(limit.resetAt)} minutos.`,
      },
      { status: 429 },
    );
  }

  let body: {
    system?: string;
    messages?: ChatMessage[];
    json?: boolean;
    scene?: string;
    instruction?: string;
    context?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  try {
    const zai = await ZAI.create();
    const messages: ChatMessage[] = [];

    if (body.scene && SCENES[body.scene]) {
      // Modo editor: la IA controla operaciones ya construidas (patrón OSK)
      const scene = body.scene;
      const catalog = SCENES[scene];
      const sceneName =
        scene === "image-editor"
          ? "editor de imagen"
          : scene === "audio-editor"
            ? "editor de audio"
            : "editor de video";
      messages.push({
        role: "assistant",
        content: `Eres el asistente de edición de un ${sceneName} online. Tu trabajo es traducir el pedido del usuario a operaciones EXISTENTES del editor.

${catalog}

Responde ÚNICAMENTE con JSON válido, sin texto extra, con esta forma:
{"reply":"confirmación breve en español (1 frase)","operations":[ ...solo las operaciones necesarias... ],"unsupported":["lo que pediste y NO puede hacerse, en español, o vacío"]}

Reglas:
- Si el pedido es ambiguo, asume el valor más razonable y menciónalo en "reply".
- Si nada del pedido se puede hacer, devuelve "operations": [] y explica en "unsupported".
- NUNCA inventes operaciones fuera del catálogo. NUNCA generes contenido nuevo de imagen/audio/video: solo controlas las funciones del editor.`,
      });
      messages.push({
        role: "user",
        content: `Estado actual del proyecto:\n${body.context ?? "(sin información)"}\n\nPedido del usuario: ${body.instruction ?? ""}`,
      });
    } else {
      if (body.system) messages.push({ role: "assistant", content: body.system });
      const incoming = Array.isArray(body.messages) ? body.messages : [];
      for (const m of incoming) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          messages.push({ role: m.role, content: m.content.slice(0, 24000) });
        }
      }
      if (messages.length === 0) {
        return NextResponse.json({ error: "Falta el mensaje del usuario." }, { status: 400 });
      }
    }

    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    if (!content.trim()) {
      return NextResponse.json(
        { error: "La IA no devolvió respuesta. Intenta de nuevo." },
        { status: 502 },
      );
    }

    if (body.scene && SCENES[body.scene]) {
      const parsed = extractJson(content) as {
        reply?: string;
        operations?: unknown[];
        unsupported?: unknown[];
      };
      return NextResponse.json({
        reply: typeof parsed.reply === "string" ? parsed.reply : "Listo.",
        operations: Array.isArray(parsed.operations) ? parsed.operations : [],
        unsupported: Array.isArray(parsed.unsupported)
          ? parsed.unsupported.filter((u): u is string => typeof u === "string")
          : [],
      });
    }

    if (body.json) {
      const parsed = extractJson(content);
      return NextResponse.json({ data: parsed });
    }

    return NextResponse.json({ content });
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("JSON")
        ? err.message
        : "El servicio de IA no está disponible en este momento. Intenta de nuevo en unos segundos.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
