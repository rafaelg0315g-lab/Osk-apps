/**
 * Límites de uso para las funciones de IA (costo por llamada).
 * Contador en memoria por IP con ventana fija diaria (se reinicia a medianoche UTC).
 * Suficiente para disuadir abuso; en un deploy multi-instancia se movería a Redis.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export const AI_LIMITS = {
  /** Operaciones de chat/JSON de IA por IP y día. */
  chat: 120,
  /** Ediciones de imagen con IA por IP y día. */
  image: 20,
} as const;

export type AiBucket = keyof typeof AI_LIMITS;

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return `${ip}`;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkAiLimit(req: Request, bucket: AiBucket): LimitResult {
  const limit = AI_LIMITS[bucket];
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Limpieza barata de entradas vencidas (aprovechamos la misma llamada)
  if (buckets.size > 5000) {
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }

  const key = `${bucket}:${clientKey(req)}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + dayMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

export function limitResetInMinutes(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 60000));
}
