/**
 * Pool de medios del editor de video (singleton a nivel de módulo).
 *
 * Gestiona el ciclo de vida de los <video> en memoria:
 * - blob (IndexedDB) → objectURL → HTMLVideoElement (preload auto, playsInline)
 * - grafo de audio: createMediaElementSource (UNA vez por elemento) → GainNode → destination
 *
 * Es un singleton para sobrevivir a remontajes (StrictMode) sin revocar URLs
 * en uso: la disposición real se programa con un temporizador cancelable y el
 * pool se vacía automáticamente si cambia el proyecto activo.
 */

export interface MediaEntry {
  mediaId: string;
  /** objectURL del blob (revocar al disponer). */
  url: string;
  el: HTMLVideoElement;
  width: number;
  height: number;
  /** Duración según metadata (0 si no se pudo leer). */
  duration: number;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
}

function noop(): void {
  /* intencional */
}

function createVideoElement(url: string): HTMLVideoElement {
  const el = document.createElement("video");
  el.preload = "auto";
  el.playsInline = true;
  el.muted = false;
  el.volume = 1;
  el.src = url;
  return el;
}

/** Espera loadedmetadata (con timeout defensivo); nunca rechaza. */
function waitForMetadata(el: HTMLVideoElement, timeoutMs = 15000): Promise<void> {
  if (el.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener("loadedmetadata", onReady);
      el.removeEventListener("error", onReady);
      resolve();
    };
    const onReady = () => finish();
    const timer = setTimeout(finish, timeoutMs);
    el.addEventListener("loadedmetadata", onReady, { once: true });
    el.addEventListener("error", onReady, { once: true });
  });
}

async function buildEntry(mediaId: string, blob: Blob): Promise<MediaEntry | null> {
  const url = URL.createObjectURL(blob);
  const el = createVideoElement(url);
  await waitForMetadata(el);
  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
  // Si la metadata tardó demasiado y no hay pista de video, se considera fallo.
  if (el.readyState === 0 && duration === 0) {
    el.pause();
    el.removeAttribute("src");
    el.load();
    URL.revokeObjectURL(url);
    return null;
  }
  return {
    mediaId,
    url,
    el,
    width: el.videoWidth > 0 ? el.videoWidth : 1280,
    height: el.videoHeight > 0 ? el.videoHeight : 720,
    duration,
    source: null,
    gain: null,
  };
}

class MediaPool {
  private projectId: string | null = null;
  private entries = new Map<string, MediaEntry>();
  private pending = new Map<string, Promise<MediaEntry | null>>();
  private audioCtx: AudioContext | null = null;
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Contexto de audio compartido (creación perezosa). */
  ensureContext(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.audioCtx = new Ctor();
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  resumeContext(): void {
    const ctx = this.audioCtx;
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(noop);
  }

  /** Cancela una disposición programada (remontaje del componente). */
  cancelScheduledDisposal(): void {
    if (this.disposeTimer !== null) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }
  }

  /** Programa la disposición real tras el desmontaje (cancelable). */
  scheduleDisposal(delayMs = 400): void {
    this.cancelScheduledDisposal();
    this.disposeTimer = setTimeout(() => {
      this.disposeTimer = null;
      this.disposeAll();
    }, delayMs);
  }

  get(mediaId: string): MediaEntry | undefined {
    return this.entries.get(mediaId);
  }

  has(mediaId: string): boolean {
    return this.entries.has(mediaId);
  }

  all(): MediaEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Carga (o reutiliza) el elemento de un mediaId. Deduplica cargas concurrentes.
   * Si cambia el proyecto respecto a cargas anteriores, vacía el pool primero.
   */
  async load(projectId: string, mediaId: string, blob: Blob): Promise<MediaEntry | null> {
    if (this.projectId !== projectId) {
      this.disposeAll();
      this.projectId = projectId;
    }
    this.cancelScheduledDisposal();
    const existing = this.entries.get(mediaId);
    if (existing) return existing;
    const inFlight = this.pending.get(mediaId);
    if (inFlight) return inFlight;

    const promise = buildEntry(mediaId, blob)
      .then((entry) => {
        this.pending.delete(mediaId);
        if (!entry) return null;
        this.attachAudio(entry);
        this.entries.set(mediaId, entry);
        return entry;
      })
      .catch(() => {
        this.pending.delete(mediaId);
        return null;
      });
    this.pending.set(mediaId, promise);
    return promise;
  }

  /** Conecta el elemento al grafo de audio (source → gain → destination), una sola vez. */
  private attachAudio(entry: MediaEntry): void {
    if (entry.source || entry.gain) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const source = ctx.createMediaElementSource(entry.el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(ctx.destination);
      entry.source = source;
      entry.gain = gain;
    } catch {
      // Si falla (p. ej. source ya creada), el audio del elemento sigue su curso natural.
      entry.source = null;
      entry.gain = null;
    }
  }

  /** Volumen del grafo para un medio (0..2); sin grafo, usa el volumen del elemento. */
  setVolume(mediaId: string, volume: number): void {
    const entry = this.entries.get(mediaId);
    if (!entry) return;
    const v = Math.min(2, Math.max(0, volume));
    if (entry.gain) {
      entry.gain.gain.value = v;
    } else {
      entry.el.volume = v;
    }
  }

  silenceAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.gain) entry.gain.gain.value = 0;
    }
  }

  pauseAll(): void {
    for (const entry of this.entries.values()) {
      try {
        entry.el.pause();
      } catch {
        noop();
      }
    }
  }

  /** Elimina un medio concreto (clip borrado). */
  disposeEntry(mediaId: string): void {
    const entry = this.entries.get(mediaId);
    if (!entry) return;
    this.entries.delete(mediaId);
    try {
      entry.el.pause();
    } catch {
      noop();
    }
    try {
      entry.el.removeAttribute("src");
      entry.el.load();
    } catch {
      noop();
    }
    if (entry.gain) {
      try {
        entry.gain.disconnect();
      } catch {
        noop();
      }
    }
    if (entry.source) {
      try {
        entry.source.disconnect();
      } catch {
        noop();
      }
    }
    URL.revokeObjectURL(entry.url);
  }

  /** Libera TODO (elementos, URLs, grafo y AudioContext). */
  disposeAll(): void {
    this.cancelScheduledDisposal();
    for (const mediaId of Array.from(this.entries.keys())) {
      this.disposeEntry(mediaId);
    }
    this.entries.clear();
    this.pending.clear();
    if (this.audioCtx) {
      const ctx = this.audioCtx;
      this.audioCtx = null;
      try {
        void ctx.close().catch(noop);
      } catch {
        noop();
      }
    }
  }
}

/** Pool compartido del editor de video (una instancia por pestaña del navegador). */
export const mediaPool = new MediaPool();
