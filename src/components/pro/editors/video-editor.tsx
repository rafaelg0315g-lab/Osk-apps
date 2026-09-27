"use client";

/**
 * EDITOR DE VIDEO PRO — OSK APPS
 *
 * Pipeline 100% en el dispositivo (sin ffmpeg.wasm ni WebCodecs):
 * - Preview: canvas + rAF, video elements en paralelo con seek sincronizado.
 * - Audio: WebAudio (source → GainNode por clip → destination; también → streamDest al exportar).
 * - Export: canvas.captureStream(30) + MediaStreamAudioDestinationNode → MediaRecorder
 *   en TIEMPO REAL (dura lo mismo que el video).
 * - Persistencia: `data` JSON-serializable vía onChange (debounce ~1s) + blobs en IndexedDB.
 *
 * DECISIONES DOCUMENTADAS:
 * - Encaje de clips: "contain" (frame completo con bandas negras si el aspecto difiere).
 * - Transición "fade": fade-in desde negro al inicio de cada clip (excepto el primero).
 * - Offsets de clips: siempre derivados (offsets[i] = suma de duraciones previas), nunca guardados.
 * - Resolución de trabajo: la del primer clip con medio disponible; el resto se ajusta con bandas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Download,
  Film,
  Loader2,
  Pause,
  Play,
  Plus,
  Send,
  SkipBack,
  SkipForward,
  Trash2,
  TriangleAlert,
  Type,
  Wand2,
} from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import type { ProEditorProps } from "@/components/pro/editor-workspace";
import { deleteProjectBlob, getLocalProject, getProjectBlob, putProjectBlob } from "@/lib/pro/local-projects";
import { cn, formatBytes } from "@/lib/utils";
import { downloadBlob } from "@/lib/upload-client";

import { applyAiOperations } from "./video-editor-ai";
import { captureThumbnail, drawScene } from "./video-editor-compositor";
import { mediaPool, type MediaEntry } from "./video-editor-media";
import { computeExportSize, pickExportFormat, sanitizeFilename, EXPORT_RESOLUTIONS, type ExportFormat, type ExportResolution } from "./video-editor-recorder";
import { VideoEditorTimeline } from "./video-editor-timeline";
import {
  clamp,
  clipTrimLength,
  computeClipOffsets,
  DEFAULT_TRANSITION_DURATION,
  findActiveClipIndex,
  formatTimecode,
  MAX_FONT_SIZE,
  MAX_IMPORT_MB,
  MIN_CLIP_LEN,
  MIN_FONT_SIZE,
  newId,
  normalizeVideoProject,
  totalDuration,
  type TextOverlay,
  type TextPosition,
  type VideoClip,
  type VideoProjectData,
} from "./video-editor-types";

function noop(): void {
  /* intencional */
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface ExportSession {
  recorder: MediaRecorder;
  chunks: Blob[];
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  streamDest: MediaStreamAudioDestinationNode | null;
  videoTracks: MediaStreamTrack[];
  cancelled: boolean;
  finished: boolean;
  format: ExportFormat;
}

interface AiBubble {
  id: number;
  role: "user" | "assistant";
  content: string;
  kind: "normal" | "unsupported" | "error";
}

/** Input numérico con estado local (no pisa lo que el usuario teclea). */
function NumberField({
  value,
  onCommit,
  min,
  max,
  step,
  label,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  min: number;
  max: number;
  step: number;
  label: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => String(round2(value)));
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);

  // Ajuste en fase de render (patrón recomendado): sincroniza el texto con la
  // propiedad cuando cambia por fuera y no se está editando.
  if (!focused && value !== lastValue) {
    setLastValue(value);
    setText(String(round2(value)));
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={text}
        aria-label={label}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(String(round2(value)));
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === "") return;
          const n = Number(raw);
          if (Number.isFinite(n)) onCommit(n);
        }}
      />
    </div>
  );
}

export default function VideoEditor({ projectId, initialData, onChange }: ProEditorProps) {
  // ── Estado serializable ─────────────────────────────────────
  const [data, setData] = useState<VideoProjectData>(() => normalizeVideoProject(initialData));
  const [loadState, setLoadState] = useState<{ done: number; total: number } | null>(
    data.clips.length > 0 ? { done: 0, total: data.clips.length } : null,
  );
  const [missingMedia, setMissingMedia] = useState<Set<string>>(() => new Set());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // ── Estado de reproducción / UI ─────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(60);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportResolution, setExportResolution] = useState<ExportResolution>("original");
  const [exportBitrate, setExportBitrate] = useState(4);
  const [exportProgress, setExportProgress] = useState<{ t: number; total: number; percent: number } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiBubble[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [deleteClipOpen, setDeleteClipOpen] = useState(false);

  // ── Refs del motor ──────────────────────────────────────────
  const dataRef = useRef<VideoProjectData>(data);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workingWidthRef = useRef(1280);
  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const timeRef = useRef(0);
  const playStartRef = useRef(0);
  const activeIdxRef = useRef(-1);
  const uiTimeRef = useRef(0);
  const exportUiRef = useRef(0);
  const exportingRef = useRef<ExportSession | null>(null);
  const thumbnailTakenRef = useRef(false);
  const tickRef = useRef<() => void>(noop);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<VideoProjectData | null>(null);
  const onChangeRef = useRef(onChange);
  const projectNameRef = useRef("video-exportado");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reimportMediaRef = useRef<string | null>(null);
  const deleteTargetRef = useRef<string | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const progressDragRef = useRef(false);
  const aiListRef = useRef<HTMLDivElement | null>(null);
  const aiIdRef = useRef(0);

  const exportFormat = useMemo<ExportFormat | null>(() => pickExportFormat(), []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // ── Autoguardado (debounce ~1s) ─────────────────────────────
  const scheduleDataSave = useCallback((next: VideoProjectData): void => {
    pendingDataRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const payload = pendingDataRef.current;
      pendingDataRef.current = null;
      if (payload) onChangeRef.current?.({ data: payload });
    }, 1000);
  }, []);

  const applyData = useCallback(
    (updater: (d: VideoProjectData) => VideoProjectData): VideoProjectData => {
      const next = updater(dataRef.current);
      dataRef.current = next;
      setData(next);
      scheduleDataSave(next);
      return next;
    },
    [scheduleDataSave],
  );

  // ── Motor de composición ────────────────────────────────────
  const syncCanvasSize = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let w = 0;
    let h = 0;
    for (const clip of dataRef.current.clips) {
      const entry = mediaPool.get(clip.mediaId);
      if (entry) {
        w = entry.width;
        h = entry.height;
        break;
      }
    }
    if (w <= 0 || h <= 0) {
      w = 1280;
      h = 720;
    }
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    workingWidthRef.current = w;
  }, []);

  const drawFrame = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, t: number): void => {
      const d = dataRef.current;
      const clips = d.clips;
      const offsets = computeClipOffsets(clips);
      const idx = findActiveClipIndex(clips, offsets, t);
      const clip = idx >= 0 ? clips[idx] : null;
      const entry: MediaEntry | null = clip ? mediaPool.get(clip.mediaId) ?? null : null;
      const localTime = clip ? t - offsets[idx] : 0;
      const fade =
        d.transition.type === "fade" && clip !== null && idx > 0 && localTime < d.transition.duration;
      const alpha = fade ? clamp(localTime / d.transition.duration, 0, 1) : 1;
      const activeTexts = d.texts.filter((tx) => t >= tx.start && t <= tx.end);
      drawScene({
        ctx,
        width,
        height,
        referenceWidth: workingWidthRef.current || width,
        entry,
        placeholderName: entry ? null : clip ? clip.name : null,
        alpha,
        texts: activeTexts,
      });
    },
    [],
  );

  const pushThumbnail = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const thumb = captureThumbnail(canvas, 320);
    if (thumb) onChangeRef.current?.({ thumbnail: thumb });
  }, []);

  const renderAt = useCallback(
    (t: number): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      syncCanvasSize();
      const d = dataRef.current;
      const total = totalDuration(d.clips);
      const tt = clamp(t, 0, total);

      let activeEntry: MediaEntry | null = null;
      if (!playingRef.current) {
        // En pausa: seek del clip activo si hay deriva > 0.25 s
        const clips = d.clips;
        const offsets = computeClipOffsets(clips);
        const idx = findActiveClipIndex(clips, offsets, tt);
        if (idx >= 0) {
          const clip = clips[idx];
          const entry = mediaPool.get(clip.mediaId);
          if (entry) {
            activeEntry = entry;
            const tl = clip.trimStart + (tt - offsets[idx]);
            if (Math.abs(entry.el.currentTime - tl) > 0.25) {
              try {
                const maxT = entry.duration > 0 ? entry.duration : tl;
                entry.el.currentTime = Math.min(tl, Math.max(0, maxT - 0.001));
              } catch {
                noop();
              }
            }
          }
        }
      } else {
        const clips = d.clips;
        const offsets = computeClipOffsets(clips);
        const idx = findActiveClipIndex(clips, offsets, tt);
        activeEntry = idx >= 0 ? mediaPool.get(clips[idx].mediaId) ?? null : null;
      }

      drawFrame(ctx, canvas.width, canvas.height, tt);

      // Miniatura: primer frame real renderizado (solo en pausa y sin exportación)
      if (
        !thumbnailTakenRef.current &&
        !playingRef.current &&
        !exportingRef.current &&
        activeEntry &&
        activeEntry.el.readyState >= 2
      ) {
        thumbnailTakenRef.current = true;
        pushThumbnail();
      }
    },
    [drawFrame, syncCanvasSize, pushThumbnail],
  );

  /** Re-render en pausa cuando un elemento termina su seek / carga. */
  const bindEntryListeners = useCallback(
    (entry: MediaEntry): void => {
      if (entry.el.dataset.oskVeBound === "1") return;
      entry.el.dataset.oskVeBound = "1";
      const onVisualRefresh = () => {
        if (!playingRef.current && !exportingRef.current) renderAt(timeRef.current);
      };
      entry.el.addEventListener("seeked", onVisualRefresh);
      entry.el.addEventListener("loadeddata", onVisualRefresh);
    },
    [renderAt],
  );

  // ── Transporte ──────────────────────────────────────────────
  const syncPlaybackMedia = useCallback((t: number): void => {
    const clips = dataRef.current.clips;
    if (clips.length === 0) {
      activeIdxRef.current = -1;
      return;
    }
    const offsets = computeClipOffsets(clips);
    const idx = findActiveClipIndex(clips, offsets, t);
    const clip = clips[idx];
    const tl = clip.trimStart + (t - offsets[idx]);
    const entry = mediaPool.get(clip.mediaId) ?? null;

    if (idx === activeIdxRef.current) {
      if (entry && playingRef.current) {
        const el = entry.el;
        if (el.paused) {
          try {
            el.currentTime = tl;
          } catch {
            noop();
          }
          void el.play().catch(noop);
        } else if (Math.abs(el.currentTime - tl) > 0.35) {
          try {
            el.currentTime = tl;
          } catch {
            noop();
          }
        }
      }
      return;
    }

    // Cambio de clip activo: pausa el anterior, activa el nuevo con seek + play
    const prevIdx = activeIdxRef.current;
    if (prevIdx >= 0 && prevIdx < clips.length) {
      const prevEntry = mediaPool.get(clips[prevIdx].mediaId);
      if (prevEntry) {
        try {
          prevEntry.el.pause();
        } catch {
          noop();
        }
        if (prevEntry.gain) prevEntry.gain.gain.value = 0;
      }
    }
    activeIdxRef.current = idx;
    if (entry) {
      try {
        entry.el.currentTime = tl;
      } catch {
        noop();
      }
      if (playingRef.current) void entry.el.play().catch(noop);
      mediaPool.setVolume(clip.mediaId, clip.volume);
    }
  }, []);

  const pushThumbnailRef = useRef(pushThumbnail);
  useEffect(() => {
    pushThumbnailRef.current = pushThumbnail;
  }, [pushThumbnail]);

  const stopPlayback = useCallback((): void => {
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaPool.pauseAll();
    setCurrentTime(timeRef.current);
    // Miniatura al pausar (si ya hubo un frame real)
    if (thumbnailTakenRef.current && !exportingRef.current) pushThumbnailRef.current();
  }, []);

  const startPlayback = useCallback((fromT?: number): void => {
    const total = totalDuration(dataRef.current.clips);
    if (total <= 0) {
      toast.info("Importa un video para comenzar a reproducir.");
      return;
    }
    let t0 = typeof fromT === "number" ? fromT : timeRef.current;
    if (t0 >= total - 0.05) t0 = 0; // si estaba al final, reinicia
    mediaPool.resumeContext();
    timeRef.current = t0;
    playStartRef.current = performance.now() - t0 * 1000;
    activeIdxRef.current = -1;
    playingRef.current = true;
    setPlaying(true);
    setCurrentTime(t0);
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => tickRef.current());
    }
  }, []);

  const finishExport = useCallback((): void => {
    const session = exportingRef.current;
    if (!session || session.finished) return;
    session.finished = true;
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaPool.pauseAll();
    try {
      session.recorder.stop();
    } catch {
      noop();
    }
  }, []);

  const tick = useCallback((): void => {
    const total = totalDuration(dataRef.current.clips);
    let t: number;
    if (playingRef.current) {
      t = (performance.now() - playStartRef.current) / 1000;
    } else {
      t = timeRef.current;
    }
    t = clamp(t, 0, total);
    timeRef.current = t;
    syncPlaybackMedia(t);

    // Preview
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        syncCanvasSize();
        drawFrame(ctx, canvas.width, canvas.height, t);
      }
    }

    // Export frame + progreso
    const session = exportingRef.current;
    if (session) {
      drawFrame(session.ctx, session.canvas.width, session.canvas.height, t);
      const now = performance.now();
      if (now - exportUiRef.current > 150) {
        exportUiRef.current = now;
        setExportProgress({ t, total, percent: total > 0 ? (t / total) * 100 : 0 });
      }
    }

    // Hora para la UI (throttle ~10 Hz)
    const now = performance.now();
    if (now - uiTimeRef.current > 100) {
      uiTimeRef.current = now;
      setCurrentTime(t);
    }

    // Fin de la reproducción / exportación
    if (playingRef.current && total > 0 && t >= total) {
      if (session) {
        finishExport();
      } else {
        timeRef.current = total;
        stopPlayback();
        setCurrentTime(total);
      }
      return;
    }
    rafRef.current = requestAnimationFrame(() => tickRef.current());
  }, [drawFrame, syncCanvasSize, syncPlaybackMedia, finishExport, stopPlayback]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const seek = useCallback(
    (t: number): void => {
      const total = totalDuration(dataRef.current.clips);
      const tt = clamp(t, 0, total);
      timeRef.current = tt;
      setCurrentTime(tt);
      if (playingRef.current) {
        playStartRef.current = performance.now() - tt * 1000;
      } else {
        activeIdxRef.current = -1;
        renderAt(tt);
      }
    },
    [renderAt],
  );

  const togglePlay = useCallback((): void => {
    if (exportingRef.current) return;
    if (playingRef.current) stopPlayback();
    else startPlayback();
  }, [startPlayback, stopPlayback]);

  // Barra espaciadora = play/pausa (si el foco no está en un campo)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (target && typeof target.closest === "function" && target.closest("[role='dialog']")) {
        return;
      }
      if (exportingRef.current) return;
      e.preventDefault();
      togglePlay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  // ── Carga inicial del proyecto ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    mediaPool.cancelScheduledDisposal();
    void (async () => {
      const parsed = normalizeVideoProject(initialData);
      try {
        const project = await getLocalProject(projectId);
        if (project?.name) projectNameRef.current = project.name;
      } catch {
        noop();
      }
      if (cancelled) return;
      const clips = parsed.clips;
      if (clips.length > 0) {
        setLoadState({ done: 0, total: clips.length });
        const missing: string[] = [];
        let done = 0;
        for (const clip of clips) {
          if (cancelled) return;
          const blob = await getProjectBlob(projectId, clip.mediaId).catch(() => null);
          if (blob) {
            const entry = await mediaPool.load(projectId, clip.mediaId, blob);
            if (entry) bindEntryListeners(entry);
            else missing.push(clip.mediaId);
          } else {
            missing.push(clip.mediaId);
          }
          done += 1;
          if (!cancelled) setLoadState({ done, total: clips.length });
        }
        if (cancelled) return;
        setMissingMedia(new Set(missing));
      }
      if (cancelled) return;
      dataRef.current = parsed;
      setData(parsed);
      setLoadState(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialData, bindEntryListeners]);

  // Re-render en pausa cuando cambian los datos (textos, transición, clips…)
  useEffect(() => {
    if (loadState) return;
    if (playingRef.current || exportingRef.current) return;
    renderAt(timeRef.current);
  }, [data, loadState, renderAt]);

  // ── Limpieza total al desmontar ─────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      playingRef.current = false;
      mediaPool.pauseAll();
      mediaPool.silenceAll();
      mediaPool.scheduleDisposal();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (pendingDataRef.current) {
        const payload = pendingDataRef.current;
        pendingDataRef.current = null;
        onChangeRef.current?.({ data: payload });
      }
    };
  }, []);

  // ── Mutaciones de clips ─────────────────────────────────────
  const updateClip = useCallback(
    (clipId: string, patch: Partial<Pick<VideoClip, "trimStart" | "trimEnd" | "volume">>): void => {
      applyData((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => {
          if (c.id !== clipId) return c;
          const updated: VideoClip = { ...c, ...patch };
          if (patch.volume !== undefined) {
            mediaPool.setVolume(c.mediaId, clamp(patch.volume, 0, 2));
          }
          updated.duration = Math.max(0, updated.duration);
          updated.trimStart = clamp(updated.trimStart, 0, Math.max(0, updated.duration - MIN_CLIP_LEN));
          updated.trimEnd = clamp(
            updated.trimEnd,
            updated.trimStart + MIN_CLIP_LEN,
            Math.max(updated.duration, updated.trimStart + MIN_CLIP_LEN),
          );
          return updated;
        }),
      }));
    },
    [applyData],
  );

  const removeClip = useCallback(
    (clipId: string): void => {
      const clip = dataRef.current.clips.find((c) => c.id === clipId);
      if (!clip) return;
      const next = applyData((prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.id !== clipId),
      }));
      if (!next.clips.some((c) => c.mediaId === clip.mediaId)) {
        mediaPool.disposeEntry(clip.mediaId);
        void deleteProjectBlob(projectId, clip.mediaId).catch(noop);
      }
      if (selectedClipId === clipId) setSelectedClipId(null);
      const newTotal = totalDuration(next.clips);
      if (timeRef.current > newTotal) seek(newTotal);
      toast.success("Clip eliminado.");
    },
    [applyData, projectId, selectedClipId, seek],
  );

  const reorderClip = useCallback(
    (clipId: string, insertIndex: number): void => {
      applyData((prev) => {
        const from = prev.clips.findIndex((c) => c.id === clipId);
        if (from < 0) return prev;
        const list = [...prev.clips];
        const [item] = list.splice(from, 1);
        const to = clamp(insertIndex, 0, list.length);
        list.splice(to, 0, item);
        return { ...prev, clips: list };
      });
    },
    [applyData],
  );

  // ── Mutaciones de textos ────────────────────────────────────
  const addText = useCallback((): void => {
    const total = totalDuration(dataRef.current.clips);
    const start = clamp(timeRef.current, 0, Math.max(0, total));
    const rawEnd = total > 0 ? Math.min(total, start + 3) : start + 3;
    const id = newId("t");
    const overlay: TextOverlay = {
      id,
      text: "Texto nuevo",
      fontSize: 42,
      color: "#ffffff",
      position: "bottom",
      start,
      end: Math.max(rawEnd, start + 0.5),
    };
    applyData((prev) => ({ ...prev, texts: [...prev.texts, overlay] }));
    setSelectedTextId(id);
    setSelectedClipId(null);
    toast.success("Texto agregado.");
  }, [applyData]);

  const updateText = useCallback(
    (textId: string, patch: Partial<TextOverlay>): void => {
      const total = totalDuration(dataRef.current.clips);
      applyData((prev) => ({
        ...prev,
        texts: prev.texts.map((t) => {
          if (t.id !== textId) return t;
          const u: TextOverlay = { ...t, ...patch };
          u.fontSize = clamp(u.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE);
          u.start = clamp(u.start, 0, Math.max(0, total));
          if (!(u.end > u.start)) u.end = u.start + 1;
          if (total > 0) u.end = Math.min(u.end, Math.max(total, u.start + 1));
          return u;
        }),
      }));
    },
    [applyData],
  );

  const removeText = useCallback(
    (textId: string): void => {
      applyData((prev) => ({ ...prev, texts: prev.texts.filter((t) => t.id !== textId) }));
      if (selectedTextId === textId) setSelectedTextId(null);
      toast.success("Texto eliminado.");
    },
    [applyData, selectedTextId],
  );

  const setTransition = useCallback(
    (type: "none" | "fade", duration?: number): void => {
      applyData((prev) => ({
        ...prev,
        transition: {
          type,
          duration: clamp(duration ?? prev.transition.duration, 0.2, 2),
        },
      }));
    },
    [applyData],
  );

  // ── Importación de videos ───────────────────────────────────
  const handleImportFiles = useCallback(
    async (files: File[]): Promise<void> => {
      let added = 0;
      for (const file of files) {
        const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v|avi|ogv)$/i.test(file.name);
        if (!isVideo) {
          toast.error(`"${file.name}" no es un archivo de video compatible.`);
          continue;
        }
        if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
          toast.error(`"${file.name}" supera el límite de ${MAX_IMPORT_MB} MB por archivo.`);
          continue;
        }
        const mediaId = newId("m");
        const entry = await mediaPool.load(projectId, mediaId, file);
        if (!entry || entry.duration <= 0) {
          toast.error(`No se pudo leer "${file.name}". El formato no es compatible con el navegador.`);
          continue;
        }
        bindEntryListeners(entry);
        try {
          await putProjectBlob(projectId, mediaId, file);
        } catch {
          mediaPool.disposeEntry(mediaId);
          toast.error(`No se pudo guardar "${file.name}" en este dispositivo.`);
          continue;
        }
        // Aviso si la relación de aspecto difiere de la del primer clip
        const first = dataRef.current.clips.length
          ? mediaPool.get(dataRef.current.clips[0].mediaId)
          : undefined;
        if (first && first.width > 0 && entry.width > 0) {
          const r1 = first.width / first.height;
          const r2 = entry.width / entry.height;
          if (Math.abs(r1 - r2) > 0.02) {
            toast.info(`"${file.name}" tiene otra relación de aspecto: se ajustará con bandas negras.`);
          }
        }
        const clip: VideoClip = {
          id: newId("c"),
          mediaId,
          name: file.name.replace(/\.[^.]+$/, "") || "Clip",
          duration: entry.duration,
          trimStart: 0,
          trimEnd: entry.duration,
          volume: 1,
        };
        applyData((prev) => ({ ...prev, clips: [...prev.clips, clip] }));
        setMissingMedia((prev) => {
          if (!prev.has(mediaId)) return prev;
          const next = new Set(prev);
          next.delete(mediaId);
          return next;
        });
        added += 1;
      }
      if (added > 0) {
        toast.success(added === 1 ? "Video agregado al proyecto." : `${added} videos agregados al proyecto.`);
      }
    },
    [applyData, bindEntryListeners, projectId],
  );

  const handleReimport = useCallback(
    async (mediaId: string, file: File): Promise<void> => {
      const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|mkv|m4v|avi|ogv)$/i.test(file.name);
      if (!isVideo) {
        toast.error("El archivo no es un video compatible.");
        return;
      }
      if (file.size > MAX_IMPORT_MB * 1024 * 1024) {
        toast.error(`El archivo supera el límite de ${MAX_IMPORT_MB} MB.`);
        return;
      }
      const entry = await mediaPool.load(projectId, mediaId, file);
      if (!entry) {
        toast.error("No se pudo leer el video. El formato no es compatible con el navegador.");
        return;
      }
      bindEntryListeners(entry);
      try {
        await putProjectBlob(projectId, mediaId, file);
      } catch {
        toast.error("No se pudo guardar el video en este dispositivo.");
        return;
      }
      // Si la duración guardada era inválida, se recupera con la real
      if (entry.duration > 0) {
        applyData((prev) => ({
          ...prev,
          clips: prev.clips.map((c) =>
            c.mediaId === mediaId && !(c.duration > 0)
              ? { ...c, duration: entry.duration, trimEnd: entry.duration }
              : c,
          ),
        }));
      }
      setMissingMedia((prev) => {
        if (!prev.has(mediaId)) return prev;
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      toast.success("Video restablecido.");
      renderAt(timeRef.current);
    },
    [applyData, bindEntryListeners, projectId, renderAt],
  );

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const reimportId = reimportMediaRef.current;
    reimportMediaRef.current = null;
    if (reimportId && files.length > 0) {
      void handleReimport(reimportId, files[0]);
      return;
    }
    if (files.length > 0) void handleImportFiles(files);
  }

  function openImportDialog(): void {
    reimportMediaRef.current = null;
    fileInputRef.current?.click();
  }

  function openReimportDialog(mediaId: string): void {
    reimportMediaRef.current = mediaId;
    fileInputRef.current?.click();
  }

  // ── Asistente IA ────────────────────────────────────────────
  useEffect(() => {
    const el = aiListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [aiMessages, aiBusy]);

  const runAi = useCallback(async (): Promise<void> => {
    const instruction = aiInput.trim();
    if (!instruction || aiBusy) return;
    setAiInput("");
    setAiBusy(true);
    aiIdRef.current += 1;
    const userId = aiIdRef.current;
    setAiMessages((prev) => [...prev, { id: userId, role: "user", content: instruction, kind: "normal" }]);

    const d = dataRef.current;
    const offsets = computeClipOffsets(d.clips);
    const context = JSON.stringify({
      totalDuration: round2(totalDuration(d.clips)),
      clips: d.clips.map((c, i) => ({
        name: c.name,
        start: round2(offsets[i]),
        end: round2(offsets[i] + clipTrimLength(c)),
        volume: c.volume,
      })),
      texts: d.texts,
      transition: d.transition,
    });

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "video-editor", instruction, context }),
      });
      const json = (await res.json().catch(() => null)) as
        | { reply?: unknown; operations?: unknown; unsupported?: unknown; error?: string }
        | null;
      if (!res.ok) {
        throw new Error(json?.error || "El asistente no está disponible en este momento.");
      }
      const reply = typeof json?.reply === "string" && json.reply.trim() ? json.reply : "Listo.";
      const operations: unknown[] = Array.isArray(json?.operations) ? json.operations : [];
      const unsupported: string[] = Array.isArray(json?.unsupported)
        ? json.unsupported.filter((u): u is string => typeof u === "string")
        : [];

      const result = applyAiOperations(dataRef.current, operations);
      if (result.applied > 0) {
        const removed = dataRef.current.clips.filter(
          (c) => !result.data.clips.some((n) => n.id === c.id),
        );
        applyData(() => result.data);
        for (const rc of removed) {
          if (!result.data.clips.some((c) => c.mediaId === rc.mediaId)) {
            mediaPool.disposeEntry(rc.mediaId);
            void deleteProjectBlob(projectId, rc.mediaId).catch(noop);
          }
        }
        if (!result.data.clips.some((c) => c.id === selectedClipId)) setSelectedClipId(null);
        const newTotal = totalDuration(result.data.clips);
        if (timeRef.current > newTotal) seek(newTotal);
      }

      aiIdRef.current += 1;
      const replyId = aiIdRef.current;
      setAiMessages((prev) => [
        ...prev,
        { id: replyId, role: "assistant", content: reply, kind: "normal" },
      ]);
      const notes = [...unsupported, ...result.unknown.map((u) => `No puedo hacer: ${u}`)];
      if (notes.length > 0) {
        aiIdRef.current += 1;
        const noteId = aiIdRef.current;
        setAiMessages((prev) => [
          ...prev,
          { id: noteId, role: "assistant", content: notes.join(" "), kind: "unsupported" },
        ]);
      }
      if (result.applied > 0) {
        toast.success(
          result.applied === 1 ? "1 operación aplicada." : `${result.applied} operaciones aplicadas.`,
        );
      } else if (notes.length === 0) {
        toast.info("El asistente no requirió cambios.");
      }
    } catch (err) {
      aiIdRef.current += 1;
      const errId = aiIdRef.current;
      setAiMessages((prev) => [
        ...prev,
        {
          id: errId,
          role: "assistant",
          content: err instanceof Error ? err.message : "Error del asistente.",
          kind: "error",
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  }, [aiBusy, aiInput, applyData, projectId, seek, selectedClipId]);

  // ── Exportación ─────────────────────────────────────────────
  const workingDims = useCallback((): { w: number; h: number } => {
    syncCanvasSize();
    const canvas = canvasRef.current;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      return { w: canvas.width, h: canvas.height };
    }
    return { w: 1280, h: 720 };
  }, [syncCanvasSize]);

  function teardownExportSession(session: ExportSession): void {
    if (session.streamDest) {
      for (const entry of mediaPool.all()) {
        if (entry.gain) {
          try {
            entry.gain.disconnect(session.streamDest);
          } catch {
            noop();
          }
        }
      }
    }
    for (const track of session.videoTracks) {
      try {
        track.stop();
      } catch {
        noop();
      }
    }
  }

  const cancelExport = useCallback((): void => {
    const session = exportingRef.current;
    if (!session || session.finished) return;
    session.cancelled = true;
    session.finished = true;
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaPool.pauseAll();
    try {
      session.recorder.stop();
    } catch {
      noop();
    }
  }, []);

  const startExport = useCallback((): void => {
    if (exportingRef.current) return;
    const total = totalDuration(dataRef.current.clips);
    if (total <= 0) {
      toast.error("No hay contenido para exportar: importa al menos un clip.");
      return;
    }
    if (!exportFormat) {
      toast.error("Tu navegador no soporta la grabación de video (MediaRecorder).");
      return;
    }
    // Detener el preview
    playingRef.current = false;
    setPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    mediaPool.pauseAll();
    mediaPool.resumeContext();

    const dims = workingDims();
    const size = computeExportSize(dims.w, dims.h, exportResolution);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("No se pudo preparar el lienzo de exportación.");
      return;
    }

    // Audio: todas las sources existentes se conectan TAMBIÉN al destination de export
    let streamDest: MediaStreamAudioDestinationNode | null = null;
    const actx = mediaPool.ensureContext();
    if (actx) {
      try {
        streamDest = actx.createMediaStreamDestination();
      } catch {
        streamDest = null;
      }
      if (streamDest) {
        for (const entry of mediaPool.all()) {
          if (entry.gain) {
            try {
              entry.gain.connect(streamDest);
            } catch {
              noop();
            }
          }
        }
      }
    }

    let videoTracks: MediaStreamTrack[];
    try {
      videoTracks = canvas.captureStream(30).getVideoTracks();
    } catch {
      toast.error("Tu navegador no permite capturar el lienzo para exportar.");
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(new MediaStream([...videoTracks, ...(streamDest ? streamDest.stream.getAudioTracks() : [])]), {
        mimeType: exportFormat.mime,
        videoBitsPerSecond: exportBitrate * 1_000_000,
        audioBitsPerSecond: 128_000,
      });
    } catch {
      toast.error("No se pudo iniciar la grabación con el formato seleccionado.");
      teardownExportSession({ recorder: null as unknown as MediaRecorder, chunks: [], canvas, ctx, streamDest, videoTracks, cancelled: true, finished: true, format: exportFormat });
      return;
    }

    const session: ExportSession = {
      recorder,
      chunks: [],
      canvas,
      ctx,
      streamDest,
      videoTracks,
      cancelled: false,
      finished: false,
      format: exportFormat,
    };
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) session.chunks.push(e.data);
    };
    recorder.onstop = () => {
      teardownExportSession(session);
      exportingRef.current = null;
      setExportProgress(null);
      setPlaying(false);
      timeRef.current = 0;
      setCurrentTime(0);
      activeIdxRef.current = -1;
      renderAt(0);
      if (session.cancelled) {
        toast.info("Exportación cancelada.");
        return;
      }
      if (session.chunks.length === 0) {
        toast.error("No se capturaron datos de video. Intenta de nuevo.");
        return;
      }
      const blob = new Blob(session.chunks, { type: exportFormat.mime.split(";")[0] });
      downloadBlob(blob, `${sanitizeFilename(projectNameRef.current)}.${exportFormat.ext}`);
      toast.success(`Video exportado (${formatBytes(blob.size)}).`);
    };

    exportingRef.current = session;
    exportUiRef.current = 0;
    setExportProgress({ t: 0, total, percent: 0 });
    setExportOpen(false);
    recorder.start(1000);
    // Reproducción real desde 0: el rAF del compositor alimenta el canvas de export
    startPlayback(0);
  }, [exportBitrate, exportFormat, exportResolution, renderAt, startPlayback, workingDims]);

  // ── Derivados de render ─────────────────────────────────────
  const clips = data.clips;
  const texts = data.texts;
  const offsets = useMemo(() => computeClipOffsets(clips), [clips]);
  const total = useMemo(() => totalDuration(clips), [clips]);
  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;
  const selectedClipIndex = selectedClip ? clips.findIndex((c) => c.id === selectedClip.id) : -1;
  const selectedText = texts.find((t) => t.id === selectedTextId) ?? null;
  const missingClips = clips.filter((c) => missingMedia.has(c.mediaId));

  function seekToClip(clipIndex: number, atEnd: boolean): void {
    const clip = clips[clipIndex];
    if (!clip) return;
    const target = atEnd ? offsets[clipIndex] + clipTrimLength(clip) : offsets[clipIndex];
    seek(target);
  }

  // ── Paneles (reutilizados en desktop y en las tabs móviles) ─
  function renderClipPanel(): React.ReactNode {
    if (!selectedClip || selectedClipIndex < 0) {
      return (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          Selecciona un clip en la línea de tiempo para recortarlo y ajustar su volumen.
        </p>
      );
    }
    const clip = selectedClip;
    return (
      <Card className="gap-3 rounded-lg py-4">
        <div className="space-y-1 px-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Film className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
            <span className="truncate">{clip.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Original: {formatTimecode(clip.duration)} · En uso: {formatTimecode(clipTrimLength(clip))}
            {missingMedia.has(clip.mediaId) ? " · falta el archivo" : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4">
          <NumberField
            label="Inicio del recorte (s)"
            value={round2(clip.trimStart)}
            min={0}
            max={round2(clip.duration)}
            step={0.1}
            onCommit={(v) => updateClip(clip.id, { trimStart: v })}
          />
          <NumberField
            label="Fin del recorte (s)"
            value={round2(clip.trimEnd)}
            min={0}
            max={round2(clip.duration)}
            step={0.1}
            onCommit={(v) => updateClip(clip.id, { trimEnd: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 px-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              updateClip(clip.id, {
                trimStart: clamp(timeRef.current - offsets[selectedClipIndex], 0, Math.max(0, clip.duration - MIN_CLIP_LEN)),
              })
            }
          >
            Inicio = playhead
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              updateClip(clip.id, {
                trimEnd: clamp(
                  timeRef.current - offsets[selectedClipIndex],
                  clip.trimStart + MIN_CLIP_LEN,
                  Math.max(clip.duration, clip.trimStart + MIN_CLIP_LEN),
                ),
              })
            }
          >
            Fin = playhead
          </Button>
        </div>
        <div className="space-y-1.5 px-4">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Volumen del clip</Label>
            <span className="text-xs tabular-nums text-muted-foreground">×{clip.volume.toFixed(2)}</span>
          </div>
          <Slider
            value={[clip.volume]}
            min={0}
            max={2}
            step={0.05}
            aria-label="Volumen del clip"
            onValueChange={(v) => updateClip(clip.id, { volume: v[0] ?? 1 })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 px-4">
          <Button variant="ghost" size="sm" onClick={() => seekToClip(selectedClipIndex, false)}>
            Ir al inicio
          </Button>
          <Button variant="ghost" size="sm" onClick={() => seekToClip(selectedClipIndex, true)}>
            Ir al final
          </Button>
        </div>
        <div className="px-4">
          <Button
            variant="outline"
            className="w-full border-rose-500/60 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
            onClick={() => {
              deleteTargetRef.current = clip.id;
              setDeleteClipOpen(true);
            }}
          >
            <Trash2 aria-hidden /> Eliminar clip
          </Button>
        </div>
      </Card>
    );
  }

  function renderTextPanel(): React.ReactNode {
    return (
      <Card className="gap-3 rounded-lg py-4">
        <div className="flex items-center justify-between gap-2 px-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Type className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
            Textos del video
          </p>
          <Button size="sm" variant="outline" onClick={addText} className="border-amber-500/60 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400">
            <Plus aria-hidden /> Agregar
          </Button>
        </div>
        {!selectedText ? (
          <p className="px-4 text-xs text-muted-foreground">
            Agrega un texto o selecciona uno en la línea de tiempo (pista ámbar) para editarlo.
          </p>
        ) : (
          <div className="space-y-3 px-4">
            <Textarea
              value={selectedText.text}
              rows={2}
              aria-label="Contenido del texto"
              placeholder="Escribe el texto…"
              onChange={(e) => updateText(selectedText.id, { text: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Aparece (s)"
                value={round2(selectedText.start)}
                min={0}
                max={round2(Math.max(total, selectedText.end))}
                step={0.1}
                onCommit={(v) => updateText(selectedText.id, { start: v })}
              />
              <NumberField
                label="Desaparece (s)"
                value={round2(selectedText.end)}
                min={0}
                max={round2(Math.max(total, selectedText.end))}
                step={0.1}
                onCommit={(v) => updateText(selectedText.id, { end: v })}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Tamaño</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{selectedText.fontSize} px</span>
              </div>
              <Slider
                value={[selectedText.fontSize]}
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                aria-label="Tamaño del texto"
                onValueChange={(v) => updateText(selectedText.id, { fontSize: v[0] ?? 42 })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Color</Label>
                <input
                  type="color"
                  value={selectedText.color}
                  aria-label="Color del texto"
                  className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-1"
                  onChange={(e) => updateText(selectedText.id, { color: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Posición</Label>
                <Select
                  value={selectedText.position}
                  onValueChange={(v) => updateText(selectedText.id, { position: v as TextPosition })}
                >
                  <SelectTrigger aria-label="Posición del texto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Superior</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                    <SelectItem value="bottom">Inferior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-rose-500/60 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
              onClick={() => removeText(selectedText.id)}
            >
              <Trash2 aria-hidden /> Eliminar texto
            </Button>
          </div>
        )}
      </Card>
    );
  }

  function renderTransitionCard(): React.ReactNode {
    const tr = data.transition;
    return (
      <Card className="gap-3 rounded-lg py-4">
        <p className="flex items-center gap-2 px-4 text-sm font-semibold">
          <Wand2 className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
          Transición entre clips
        </p>
        <div className="px-4">
          <Select value={tr.type} onValueChange={(v) => setTransition(v === "fade" ? "fade" : "none")}>
            <SelectTrigger aria-label="Tipo de transición">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguna</SelectItem>
              <SelectItem value="fade">Fundido</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {tr.type === "fade" && (
          <div className="space-y-1.5 px-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Duración del fundido</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{tr.duration.toFixed(1)} s</span>
            </div>
            <Slider
              value={[tr.duration]}
              min={0.2}
              max={2}
              step={0.1}
              aria-label="Duración del fundido"
              onValueChange={(v) => setTransition("fade", v[0] ?? DEFAULT_TRANSITION_DURATION)}
            />
          </div>
        )}
        <p className="px-4 text-xs text-muted-foreground">
          El fundido entra desde el negro al inicio de cada clip (excepto el primero).
        </p>
      </Card>
    );
  }

  // ── Estados finales ─────────────────────────────────────────
  if (loadState) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border bg-muted/20 p-8 text-center">
        <Loader2 className="size-7 animate-spin text-violet-600 dark:text-violet-400" aria-hidden />
        <div>
          <p className="font-semibold">Cargando proyecto…</p>
          <p className="text-sm text-muted-foreground">
            Preparando {loadState.done} de {loadState.total} clips desde este dispositivo
          </p>
        </div>
        <Progress
          value={loadState.total > 0 ? (loadState.done / loadState.total) * 100 : 0}
          className="w-56"
          aria-label="Progreso de carga"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Input de archivos (importar / reimportar) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={onFileInputChange}
        aria-hidden
        tabIndex={-1}
      />

      {/* Medios faltantes */}
      {missingClips.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-4" aria-hidden />
            {missingClips.length === 1
              ? "Falta el archivo de un clip en este dispositivo"
              : `Faltan los archivos de ${missingClips.length} clips en este dispositivo`}
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
            Los proyectos se guardan localmente por navegador. Vuelve a importar el archivo original para restaurar cada clip.
          </p>
          <div className="space-y-1.5">
            {missingClips.map((clip) => (
              <div
                key={clip.id}
                className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-background/60 px-3 py-1.5"
              >
                <span className="truncate text-xs font-medium">{clip.name}</span>
                <Button size="sm" variant="outline" onClick={() => openReimportDialog(clip.mediaId)}>
                  Reimportar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openImportDialog} className="bg-violet-600 text-white hover:bg-violet-700">
          <Plus aria-hidden /> Agregar video
        </Button>
        <span className="text-xs text-muted-foreground">
          {clips.length === 0
            ? "Sin clips"
            : `${clips.length} ${clips.length === 1 ? "clip" : "clips"} · ${formatTimecode(total)}`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setAiOpen(true)}>
            <Bot aria-hidden /> Asistente IA
          </Button>
          <Button
            onClick={() => setExportOpen(true)}
            disabled={total <= 0}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            <Download aria-hidden /> Exportar video
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        {/* Columna principal */}
        <div className="min-w-0 space-y-4">
          {/* Preview */}
          <div className="relative mx-auto aspect-video w-full max-w-[960px] overflow-hidden rounded-xl border bg-black">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full object-contain"
              aria-label="Vista previa del video"
            />
            {clips.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
                <Film className="size-10 text-violet-400" aria-hidden />
                <p className="text-lg font-semibold text-white">Importa tu primer video</p>
                <p className="max-w-xs text-sm text-zinc-400">
                  Agrega clips para armar tu video. Todo se procesa y guarda en tu dispositivo.
                </p>
                <Button onClick={openImportDialog} className="bg-violet-600 text-white hover:bg-violet-700">
                  <Plus aria-hidden /> Agregar video
                </Button>
              </div>
            )}
          </div>

          {/* Transporte */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Retroceder 1 segundo"
                disabled={total <= 0}
                onClick={() => seek(timeRef.current - 1)}
              >
                <SkipBack aria-hidden />
              </Button>
              <Button
                size="icon"
                className="size-10 bg-violet-600 text-white hover:bg-violet-700"
                aria-label={playing ? "Pausar" : "Reproducir"}
                disabled={total <= 0}
                onClick={togglePlay}
              >
                {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Avanzar 1 segundo"
                disabled={total <= 0}
                onClick={() => seek(timeRef.current + 1)}
              >
                <SkipForward aria-hidden />
              </Button>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatTimecode(currentTime)} / {formatTimecode(total)}
            </span>
            <div
              ref={progressRef}
              role="slider"
              tabIndex={0}
              aria-label="Progreso del video"
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(currentTime)}
              className="relative h-2 min-w-[160px] flex-1 cursor-pointer touch-pan-y overflow-hidden rounded-full bg-muted"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                progressDragRef.current = true;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
                seek(clamp(ratio, 0, 1) * total);
              }}
              onPointerMove={(e) => {
                if (!progressDragRef.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
                seek(clamp(ratio, 0, 1) * total);
              }}
              onPointerUp={() => {
                progressDragRef.current = false;
              }}
              onPointerCancel={() => {
                progressDragRef.current = false;
              }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-violet-600"
                style={{ width: `${total > 0 ? (currentTime / total) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Timeline */}
          <VideoEditorTimeline
            clips={clips}
            texts={texts}
            offsets={offsets}
            total={total}
            zoom={zoom}
            currentTime={currentTime}
            selectedClipId={selectedClipId}
            selectedTextId={selectedTextId}
            missingMedia={missingMedia}
            followPlayhead={playing}
            onSelectClip={(id) => {
              setSelectedClipId(id);
              setSelectedTextId(null);
            }}
            onSelectText={(id) => {
              setSelectedTextId(id);
              setSelectedClipId(null);
            }}
            onSelectEmpty={() => {
              setSelectedClipId(null);
              setSelectedTextId(null);
            }}
            onReorderClip={reorderClip}
            onMoveText={(id, newStart) => {
              // El arrastre mueve start/end manteniendo la duración
              const text = dataRef.current.texts.find((t) => t.id === id);
              const len = text ? Math.max(0.2, text.end - text.start) : 3;
              updateText(id, { start: newStart, end: newStart + len });
            }}
            onSeek={seek}
            onZoomChange={setZoom}
          />

          {/* Tabs móviles */}
          <Tabs defaultValue="clips" className="lg:hidden">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="clips">Clips</TabsTrigger>
              <TabsTrigger value="texto">Texto</TabsTrigger>
              <TabsTrigger value="ia">IA</TabsTrigger>
              <TabsTrigger value="exportar">Exportar</TabsTrigger>
            </TabsList>
            <TabsContent value="clips" className="space-y-4 pt-3">
              {renderClipPanel()}
              {renderTransitionCard()}
            </TabsContent>
            <TabsContent value="texto" className="pt-3">
              {renderTextPanel()}
            </TabsContent>
            <TabsContent value="ia" className="space-y-3 pt-3 text-center">
              <p className="text-sm text-muted-foreground">
                Pide cambios en lenguaje natural: textos, volúmenes, transiciones y orden de clips.
              </p>
              <Button
                className="w-full bg-violet-600 text-white hover:bg-violet-700"
                onClick={() => setAiOpen(true)}
              >
                <Bot aria-hidden /> Abrir asistente IA
              </Button>
            </TabsContent>
            <TabsContent value="exportar" className="space-y-3 pt-3 text-center">
              <p className="text-sm text-muted-foreground">
                Genera el archivo final con formato, resolución y bitrate a tu gusto.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                La exportación ocurre en tiempo real: dura lo mismo que el video.
              </p>
              <Button
                className="w-full bg-violet-600 text-white hover:bg-violet-700"
                disabled={total <= 0}
                onClick={() => setExportOpen(true)}
              >
                <Download aria-hidden /> Exportar video
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        {/* Panel lateral (desktop) */}
        <aside className="hidden space-y-4 lg:block">
          {renderClipPanel()}
          {renderTextPanel()}
          {renderTransitionCard()}
          <p className="px-1 text-xs text-muted-foreground">
            Consejo: usa la barra espaciadora para reproducir o pausar el preview.
          </p>
        </aside>
      </div>

      <Separator className="opacity-50" />

      {/* Diálogo de exportación */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar video</DialogTitle>
            <DialogDescription>
              Configura el archivo final. Duración: {formatTimecode(total)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Formato de salida</p>
                <p className="truncate text-xs text-muted-foreground">
                  {exportFormat
                    ? "Elegido automáticamente según tu navegador"
                    : "Tu navegador no soporta grabación de video"}
                </p>
              </div>
              {exportFormat ? (
                <Badge className="shrink-0 bg-violet-600 text-white hover:bg-violet-600">
                  {exportFormat.label}
                </Badge>
              ) : (
                <Badge variant="destructive" className="shrink-0">
                  No disponible
                </Badge>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Resolución</Label>
              <Select value={exportResolution} onValueChange={(v) => setExportResolution(v as ExportResolution)}>
                <SelectTrigger aria-label="Resolución de salida">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_RESOLUTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Calidad (bitrate de video)</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{exportBitrate} Mbps</span>
              </div>
              <Slider
                value={[exportBitrate]}
                min={2}
                max={8}
                step={1}
                aria-label="Bitrate de video"
                onValueChange={(v) => setExportBitrate(v[0] ?? 4)}
              />
              <p className="text-[11px] text-muted-foreground">2 Mbps = archivo liviano · 8 Mbps = máxima calidad</p>
            </div>
            <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              La exportación ocurre en tiempo real: dura lo mismo que el video. No cierres ni cambies de pestaña
              hasta que termine.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={startExport}
              disabled={!exportFormat || total <= 0}
              className="bg-violet-600 text-white hover:bg-violet-700"
            >
              <Download aria-hidden /> Iniciar exportación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overlay bloqueante de exportación */}
      {exportProgress && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-background/95 p-6 text-center backdrop-blur-sm">
          <Loader2 className="size-10 animate-spin text-violet-600 dark:text-violet-400" aria-hidden />
          <p className="text-5xl font-bold tabular-nums">{Math.floor(exportProgress.percent)}%</p>
          <Progress value={exportProgress.percent} className="w-full max-w-md" aria-label="Progreso de exportación" />
          <p className="text-sm tabular-nums text-muted-foreground">
            {formatTimecode(exportProgress.t)} / {formatTimecode(exportProgress.total)}
          </p>
          <p className="flex max-w-md items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            La exportación ocurre en tiempo real: dura lo mismo que el video. No cierres ni cambies de pestaña.
          </p>
          <Button variant="outline" onClick={cancelExport}>
            Cancelar exportación
          </Button>
        </div>
      )}

      {/* Confirmación de eliminación de clip */}
      <AlertDialog open={deleteClipOpen} onOpenChange={setDeleteClipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este clip?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará del proyecto y se liberará su archivo en este dispositivo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                const id = deleteTargetRef.current;
                deleteTargetRef.current = null;
                setDeleteClipOpen(false);
                if (id) removeClip(id);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Asistente IA */}
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4 text-violet-600 dark:text-violet-400" aria-hidden />
              Asistente IA
            </SheetTitle>
            <SheetDescription>
              Pide cambios en lenguaje natural: textos, volúmenes, transiciones y orden de clips.
            </SheetDescription>
          </SheetHeader>
          <div ref={aiListRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {aiMessages.length === 0 && (
              <div className="space-y-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Pruébame con algo como:</p>
                <p>· Agrega un texto que diga &quot;Suscríbete&quot; al final.</p>
                <p>· Baja el volumen del segundo clip a la mitad.</p>
                <p>· Pon un fundido de 1 segundo entre clips.</p>
              </div>
            )}
            {aiMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm break-words",
                  msg.role === "user" && "ml-auto bg-violet-600 text-white",
                  msg.role === "assistant" && msg.kind === "normal" && "bg-muted",
                  msg.role === "assistant" && msg.kind === "unsupported" &&
                    "border border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300",
                  msg.role === "assistant" && msg.kind === "error" &&
                    "border border-rose-500/60 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                )}
              >
                {msg.content}
              </div>
            ))}
            {aiBusy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                Pensando…
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t p-3">
            <Input
              value={aiInput}
              placeholder="Pide un cambio para tu video…"
              aria-label="Mensaje para el asistente"
              disabled={aiBusy}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void runAi();
                }
              }}
            />
            <Button
              size="icon"
              className="shrink-0 bg-violet-600 text-white hover:bg-violet-700"
              aria-label="Enviar mensaje"
              disabled={aiBusy || !aiInput.trim()}
              onClick={() => void runAi()}
            >
              {aiBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
