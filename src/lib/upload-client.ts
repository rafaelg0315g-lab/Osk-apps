/**
 * Cliente para invocar las APIs de procesamiento de archivos.
 * Devuelve el archivo resultante como Blob + metadata de las cabeceras.
 */

export interface ProcessResult {
  blob: Blob;
  filename: string;
  /** Cabeceras personalizadas que la API pueda enviar (ej. tamaños). */
  headers: Headers;
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
  return plainMatch?.[1] ?? fallback;
}

export async function processFiles(endpoint: string, form: FormData): Promise<ProcessResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", body: form });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
  }

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // respuesta sin JSON, usamos el mensaje genérico
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const filename = filenameFromDisposition(
    response.headers.get("content-disposition"),
    "resultado",
  );

  return { blob, filename, headers: response.headers };
}

/** Descarga un Blob en el navegador con el nombre indicado. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
