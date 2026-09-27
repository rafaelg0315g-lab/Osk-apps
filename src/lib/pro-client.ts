/** Helper de fetch JSON para las APIs de la sección PRO (errores en español). */
export async function apiJson<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? ((await res.json()) as T) : null;
    if (!res.ok) {
      const error =
        (data as { error?: string } | null)?.error ?? "Ocurrió un error inesperado. Intenta de nuevo.";
      return { ok: false, status: res.status, data, error };
    }
    return { ok: true, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "No hay conexión con el servidor. Revisa tu red e intenta de nuevo.",
    };
  }
}

/** Proyecto PRO serializable (viaja entre servidor y cliente). */
export interface ProProjectDTO {
  id: string;
  type: string;
  name: string;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  data?: string | null;
}
