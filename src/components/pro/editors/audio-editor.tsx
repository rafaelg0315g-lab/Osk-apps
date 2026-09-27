"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AudioLines,
  Bot,
  Crop,
  Download,
  Eraser,
  Gauge,
  Headphones,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  SplitSquareHorizontal,
  Square,
  Trash2,
  TriangleAlert,
  Upload,
  Volume2,
  VolumeX,
  Wind,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProEditorProps } from "@/components/pro/editor-workspace";
import {
  deleteProjectBlob,
  getProjectBlob,
  putProjectBlob,
} from "@/lib/pro/local-projects";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/upload-client";

import {
  audioBufferToWav,
  createDecodeContext,
  createEqChain,
  decodeAudio,
  keepRegionFrames,
  normalizeBufferToDb,
  removeRegionFrames,
  reduceNoiseBuffer,
  renderMixOffline,
  scheduleClipOnContext,
} from "./audio-editor-core";
import { AudioEditorWaveform } from "./audio-editor-waveform";
import {
  DEFAULT_EQ,
  EQ_BANDS,
  EQ_PRESETS,
  MAX_CLIPS,
  MAX_FADE,
  MAX_FILE_MB,
  MAX_PITCH,
  MAX_SPEED,
  MIN_SPEED,
  MIN_GAIN_DB,
  MAX_GAIN_DB,
  VOICE_PRESETS,
  bufferClipDuration,
  clamp,
  clipPitch,
  clipSpeed,
  dbToGain,
  formatClock,
  formatDb,
  formatTime,
  mixDuration,
  normalizeProjectData,
  presetParams,
  toNum,
  uid,
  voiceValueForClip,
  type AudioClip,
  type AudioProjectData,
  type EqBandKey,
} from "./audio-editor-types";

type AiBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tone?: "normal" | "amber";
};

const EMPTY_DATA: AudioProjectData = {
  clips: [],
  eq: { ...DEFAULT_EQ },
  masterGainDb: 0,
};

const AI_SUGGESTIONS = [
  "Normaliza el volumen",
  "Quita el ruido de fondo",
  "Pon voz de robot en el último clip",
];

const EQ_MIN = -15;
const EQ_MAX = 15;

function isAudioFile(file: File): boolean {
  return (
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm|aiff?|wma)$/i.test(file.name)
  );
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Hook mínimo de viewport (el editor se monta con ssr:false, siempre hay window). */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

/**
 * Editor de audio PRO: timeline multipista, EQ de 8 bandas, modulador de voz,
 * reducción de ruido espectral, cortes y export WAV. 100% en el dispositivo.
 */
export default function AudioEditor({ projectId, initialData, onChange }: ProEditorProps) {
  // ── Estado serializable / derivado ─────────────────────────
  const [data, setData] = useState<AudioProjectData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const [buffers, setBuffers] = useState<Map<string, AudioBuffer>>(() => new Map());
  const [missingIds, setMissingIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [soloClipId, setSoloClipId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(60);
  const [processing, setProcessing] = useState<{ clipId: string; value: number } | null>(null);
  const [rendering, setRendering] = useState(false);

  const [aiMessages, setAiMessages] = useState<AiBubble[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiPending, setAiPending] = useState(false);

  const isDesktop = useIsDesktop();

  // ── Refs (audio + persistencia) ────────────────────────────
  const dataRef = useRef<AudioProjectData>(EMPTY_DATA);
  const buffersMapRef = useRef<Map<string, AudioBuffer>>(new Map());
  const missingIdsRef = useRef<Set<string>>(new Set());
  const selectedClipIdRef = useRef<string | null>(null);
  const soloRef = useRef<string | null>(null);
  const mixDurationRef = useRef(0);
  const pxPerSecRef = useRef(60);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const ctxRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const activeNodesRef = useRef<AudioNode[]>([]);
  const liveChainRef = useRef<{ eqNodes: BiquadFilterNode[]; master: GainNode } | null>(null);
  const playStartRef = useRef({ ctxTime: 0, offset: 0 });
  const playheadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<AudioProjectData | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reimportInputRef = useRef<HTMLInputElement | null>(null);
  const reimportTargetRef = useRef<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const playheadLineRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const aiScrollRef = useRef<HTMLDivElement | null>(null);

  // ── Espejos de estado → refs ───────────────────────────────
  const mixDuration = useMemo(() => mixDuration(data.clips, buffers), [data.clips, buffers]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    buffersMapRef.current = buffers;
  }, [buffers]);
  useEffect(() => {
    missingIdsRef.current = missingIds;
  }, [missingIds]);
  useEffect(() => {
    selectedClipIdRef.current = selectedClipId;
  }, [selectedClipId]);
  useEffect(() => {
    soloRef.current = soloClipId;
  }, [soloClipId]);
  useEffect(() => {
    mixDurationRef.current = mixDuration;
  }, [mixDuration]);

  const selectedClip = useMemo(
    () => data.clips.find((c) => c.id === selectedClipId) ?? null,
    [data.clips, selectedClipId],
  );

  const canPlay = useMemo(
    () =>
      !loading &&
      data.clips.some((c) => buffers.has(c.mediaId)) &&
      mixDuration > 0,
    [loading, data.clips, buffers, mixDuration],
  );

  const eqPresetValue = useMemo(() => {
    const match = EQ_PRESETS.find((p) =>
      EQ_BANDS.every((b) => Math.abs((p.values[b.key] ?? 0) - data.eq[b.key]) < 0.001),
    );
    return match ? match.value : "custom";
  }, [data.eq]);

  // ── Playhead (actualización directa del DOM, sin re-render) ─
  const syncPlayheadUI = useCallback((t: number) => {
    const px = t * pxPerSecRef.current;
    if (playheadLineRef.current) {
      playheadLineRef.current.style.transform = `translateX(${px}px)`;
    }
    if (timeLabelRef.current) {
      timeLabelRef.current.textContent = formatTime(t);
    }
  }, []);

  useEffect(() => {
    pxPerSecRef.current = pxPerSec;
    syncPlayheadUI(playheadRef.current);
  }, [pxPerSec, syncPlayheadUI]);

  // ── Transporte: limpieza de fuentes/nodos ──────────────────
  const stopAllPlayback = useCallback(() => {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    const sources = activeSourcesRef.current;
    activeSourcesRef.current = [];
    for (const s of sources) {
      try {
        s.stop();
      } catch {
        // ya detenido
      }
    }
    const nodes = activeNodesRef.current;
    activeNodesRef.current = [];
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        // ya desconectado
      }
    }
    const chain = liveChainRef.current;
    liveChainRef.current = null;
    if (chain) {
      for (const filter of chain.eqNodes) {
        try {
          filter.disconnect();
        } catch {
          // noop
        }
      }
      try {
        chain.master.disconnect();
      } catch {
        // noop
      }
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setPlaying(false);
  }, []);

  // ── Transporte: bucle rAF del playhead ─────────────────────
  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const { ctxTime, offset } = playStartRef.current;
    const t = offset + (ctx.currentTime - ctxTime);
    const total = mixDurationRef.current;
    if (t >= total) {
      playheadRef.current = total;
      syncPlayheadUI(total);
      stopAllPlayback();
      return;
    }
    playheadRef.current = t;
    syncPlayheadUI(t);
    const sc = scrollerRef.current;
    if (sc) {
      const px = t * pxPerSecRef.current;
      if (px > sc.scrollLeft + sc.clientWidth - 60 || px < sc.scrollLeft) {
        sc.scrollLeft = Math.max(0, px - 80);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stopAllPlayback, syncPlayheadUI]);

  const ensureCtx = useCallback((): AudioContext | null => {
    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
      return ctxRef.current;
    } catch {
      toast.error("Tu navegador no soporta audio en tiempo real.");
      return null;
    }
  }, []);

  /** Programa TODOS los clips activos desde `offset` (preciso vía `when` del AudioContext). */
  const startPlaybackFrom = useCallback(
    (offset: number) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      const total = mixDurationRef.current;
      if (total <= 0) return;
      const current = dataRef.current;
      const chain = createEqChain(ctx, current.eq);
      const master = ctx.createGain();
      master.gain.value = dbToGain(current.masterGainDb);
      chain.output.connect(master);
      master.connect(ctx.destination);
      liveChainRef.current = { eqNodes: chain.nodes, master };

      const startCtxTime = ctx.currentTime + 0.06;
      const sources: AudioScheduledSourceNode[] = [];
      const nodes: AudioNode[] = [];
      for (const clip of current.clips) {
        if (clip.muted) continue;
        if (soloRef.current && clip.id !== soloRef.current) continue;
        const buffer = buffersMapRef.current.get(clip.mediaId);
        if (!buffer) continue;
        const speed = clipSpeed(clip);
        const clipDur = buffer.duration / speed;
        if (offset >= clip.start + clipDur - 0.005) continue;
        const clipOffset = Math.max(0, offset - clip.start);
        const when = startCtxTime + Math.max(0, clip.start - offset);
        const sched = scheduleClipOnContext({
          ctx,
          clip,
          buffer,
          when,
          clipOffset,
          destination: chain.input,
        });
        sources.push(sched.source, ...sched.extraSources);
        nodes.push(...sched.nodes);
      }
      activeSourcesRef.current = sources;
      activeNodesRef.current = nodes;
      playStartRef.current = { ctxTime: startCtxTime, offset };
      playheadRef.current = offset;
      syncPlayheadUI(offset);
      setPlaying(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [ensureCtx, tick, syncPlayheadUI],
  );

  // ── Persistencia: debounce propio de 800 ms ────────────────
  const commitData = useCallback((next: AudioProjectData) => {
    dataRef.current = next;
    setData(next);
    pendingPersistRef.current = next;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const payload = pendingPersistRef.current;
      pendingPersistRef.current = null;
      if (payload) onChangeRef.current({ data: payload });
    }, 800);
  }, []);

  const updateClip = useCallback(
    (clipId: string, patch: Partial<AudioClip>) => {
      const current = dataRef.current;
      commitData({
        ...current,
        clips: current.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      });
    },
    [commitData],
  );

  const setBufferFor = useCallback((mediaId: string, buffer: AudioBuffer) => {
    const next = new Map(buffersMapRef.current);
    next.set(mediaId, buffer);
    buffersMapRef.current = next;
    setBuffers(next);
  }, []);

  // ── Carga inicial del proyecto ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const project = normalizeProjectData(initialData);
    dataRef.current = project;
    setData(project);
    setHydrated(true);
    if (project.clips.length === 0) {
      setLoading(null);
      return;
    }
    setLoading({ done: 0, total: project.clips.length });
    void (async () => {
      const map = new Map<string, AudioBuffer>();
      const missing = new Set<string>();
      const decodeCtx = createDecodeContext();
      for (let i = 0; i < project.clips.length; i++) {
        const clip = project.clips[i];
        try {
          const blob = await getProjectBlob(projectId, clip.mediaId);
          if (!blob) {
            missing.add(clip.mediaId);
          } else {
            const ab = await blob.arrayBuffer();
            const audioBuffer = await decodeAudio(decodeCtx, ab);
            map.set(clip.mediaId, audioBuffer);
          }
        } catch {
          missing.add(clip.mediaId);
        }
        if (cancelled) return;
        buffersMapRef.current = map;
        setBuffers(new Map(map));
        setLoading({ done: i + 1, total: project.clips.length });
      }
      if (cancelled) return;
      missingIdsRef.current = missing;
      setMissingIds(new Set(missing));
      setLoading(null);
      if (missing.size > 0) {
        toast.warning(
          `${missing.size} ${missing.size === 1 ? "audio falta" : "audios faltan"} en este dispositivo: puedes re-importarlos desde su clip.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, initialData]);

  // ── Limpieza total al desmontar ────────────────────────────
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const pending = pendingPersistRef.current;
      pendingPersistRef.current = null;
      if (pending) onChangeRef.current({ data: pending });
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const sources = activeSourcesRef.current;
      activeSourcesRef.current = [];
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // noop
        }
      }
      const nodes = activeNodesRef.current;
      activeNodesRef.current = [];
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // noop
        }
      }
      const chain = liveChainRef.current;
      liveChainRef.current = null;
      if (chain) {
        for (const filter of chain.eqNodes) {
          try {
            filter.disconnect();
          } catch {
            // noop
          }
        }
        try {
          chain.master.disconnect();
        } catch {
          // noop
        }
      }
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
      }
    };
  }, []);

  // ── EQ en vivo mientras suena ──────────────────────────────
  useEffect(() => {
    const chain = liveChainRef.current;
    if (!chain) return;
    chain.eqNodes.forEach((filter, i) => {
      const band = EQ_BANDS[i];
      if (band) filter.gain.value = data.eq[band.key];
    });
  }, [data.eq]);

  // ── Chat IA: auto-scroll ───────────────────────────────────
  useEffect(() => {
    const el = aiScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [aiMessages, aiPending]);

  // ── Acciones de transporte ─────────────────────────────────
  function handlePlay() {
    if (!canPlay) return;
    let from = playheadRef.current;
    if (from >= mixDurationRef.current - 0.02) from = 0;
    stopAllPlayback();
    startPlaybackFrom(from);
  }

  function handlePause() {
    const t = currentMixTime();
    stopAllPlayback();
    playheadRef.current = t;
    syncPlayheadUI(t);
  }

  function handleStop() {
    stopAllPlayback();
    playheadRef.current = 0;
    syncPlayheadUI(0);
  }

  function currentMixTime(): number {
    const ctx = ctxRef.current;
    if (!playing || !ctx) return playheadRef.current;
    const { ctxTime, offset } = playStartRef.current;
    return Math.min(offset + (ctx.currentTime - ctxTime), mixDurationRef.current);
  }

  function seekTo(sec: number) {
    const total = Math.max(mixDurationRef.current, 0.001);
    const t = clamp(sec, 0, total);
    if (playing) {
      stopAllPlayback();
      startPlaybackFrom(t);
    } else {
      playheadRef.current = t;
      syncPlayheadUI(t);
    }
  }

  function onTimelineClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (loading || mixDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - rect.left) / pxPerSecRef.current);
  }

  // ── Importar ───────────────────────────────────────────────
  const importFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const audio = files.filter(isAudioFile);
      if (files.length > 0 && audio.length === 0) {
        toast.error("Los archivos seleccionados no son de audio.");
        return;
      }
      if (audio.length === 0) return;
      const current = dataRef.current;
      if (current.clips.length + audio.length > MAX_CLIPS) {
        toast.error(
          `Máximo ${MAX_CLIPS} clips por proyecto (tienes ${current.clips.length}).`,
        );
        return;
      }
      const tooBig = audio.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
      if (tooBig) {
        toast.error(`"${tooBig.name}" supera el límite de ${MAX_FILE_MB} MB.`);
        return;
      }
      setImporting(true);
      let ok = 0;
      let working = current;
      try {
        const decodeCtx = createDecodeContext();
        for (const file of audio) {
          const mediaId = uid();
          await putProjectBlob(projectId, mediaId, file);
          const arrayBuffer = await file.arrayBuffer();
          const buffer = await decodeAudio(decodeCtx, arrayBuffer);
          const start = mixDuration(working.clips, buffersMapRef.current);
          const clip: AudioClip = {
            id: uid(),
            mediaId,
            name: stripExtension(file.name) || "Audio",
            start: Math.round(start * 100) / 100,
            gain: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
            pitchSemitones: 0,
            speedRate: 1,
            preset: null,
          };
          working = { ...working, clips: [...working.clips, clip] };
          setBufferFor(mediaId, buffer);
          missingIdsRef.current.delete(mediaId);
          ok += 1;
        }
        setMissingIds(new Set(missingIdsRef.current));
        commitData(working);
        toast.success(
          ok === 1 ? "Audio importado." : `${ok} audios importados.`,
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "No se pudo importar el audio.",
        );
      } finally {
        setImporting(false);
      }
    },
    [projectId, commitData, setBufferFor],
  );

  function onImportInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) void importFiles(files);
    e.target.value = "";
  }

  function pickFiles() {
    fileInputRef.current?.click();
  }

  // ── Re-importar audio faltante ─────────────────────────────
  function openReimport(mediaId: string) {
    reimportTargetRef.current = mediaId;
    reimportInputRef.current?.click();
  }

  async function onReimportChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const mediaId = reimportTargetRef.current;
    reimportTargetRef.current = null;
    if (!file || !mediaId) return;
    if (!isAudioFile(file)) {
      toast.error("El archivo seleccionado no es de audio.");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`El archivo supera el límite de ${MAX_FILE_MB} MB.`);
      return;
    }
    try {
      await putProjectBlob(projectId, mediaId, file);
      const buffer = await decodeAudio(createDecodeContext(), await file.arrayBuffer());
      setBufferFor(mediaId, buffer);
      missingIdsRef.current.delete(mediaId);
      setMissingIds(new Set(missingIdsRef.current));
      toast.success("Audio restaurado.");
    } catch {
      toast.error("No se pudo decodificar el audio.");
    }
  }

  // ── Eliminar clip ──────────────────────────────────────────
  const removeClip = useCallback(
    async (clipId: string) => {
      const current = dataRef.current;
      const clip = current.clips.find((c) => c.id === clipId);
      if (!clip) return;
      try {
        await deleteProjectBlob(projectId, clip.mediaId);
      } catch {
        // el blob ya no existía
      }
      const nextMap = new Map(buffersMapRef.current);
      nextMap.delete(clip.mediaId);
      buffersMapRef.current = nextMap;
      setBuffers(nextMap);
      missingIdsRef.current.delete(clip.mediaId);
      setMissingIds(new Set(missingIdsRef.current));
      commitData({ ...current, clips: current.clips.filter((c) => c.id !== clipId) });
      if (selectedClipIdRef.current === clipId) setSelectedClipId(null);
      if (soloRef.current === clipId) setSoloClipId(null);
      toast.success("Clip eliminado.");
    },
    [projectId, commitData],
  );

  // ── Solo ───────────────────────────────────────────────────
  function toggleSolo(clip: AudioClip) {
    if (soloRef.current === clip.id) {
      setSoloClipId(null);
      soloRef.current = null;
      return;
    }
    setSoloClipId(clip.id);
    setSelectedClipId(clip.id);
    soloRef.current = clip.id;
    if (!playing) {
      const buffer = buffersMapRef.current.get(clip.mediaId);
      if (buffer && !loading) {
        stopAllPlayback();
        startPlaybackFrom(clip.start);
      }
    }
  }

  // ── Oír una selección (preview con el grafo completo) ──────
  function listenSelection(clip: AudioClip, sel: { start: number; end: number }) {
    const buffer = buffersMapRef.current.get(clip.mediaId);
    if (!buffer) {
      toast.error("El audio de este clip no está disponible.");
      return;
    }
    stopAllPlayback();
    const ctx = ensureCtx();
    if (!ctx) return;
    const current = dataRef.current;
    const chain = createEqChain(ctx, current.eq);
    const master = ctx.createGain();
    master.gain.value = dbToGain(current.masterGainDb);
    chain.output.connect(master);
    master.connect(ctx.destination);
    liveChainRef.current = { eqNodes: chain.nodes, master };
    const speed = clipSpeed(clip);
    const silentClip: AudioClip = { ...clip, fadeIn: 0, fadeOut: 0 };
    const sched = scheduleClipOnContext({
      ctx,
      clip: silentClip,
      buffer,
      when: ctx.currentTime + 0.04,
      clipOffset: Math.max(0, sel.start) * speed,
      destination: chain.input,
    });
    activeSourcesRef.current = [sched.source, ...sched.extraSources];
    activeNodesRef.current = sched.nodes;
    playheadRef.current = clip.start + sel.start;
    syncPlayheadUI(playheadRef.current);
    const wall = Math.max(0.05, (sel.end - sel.start) / Math.pow(2, clipPitch(clip) / 12));
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      stopAllPlayback();
    }, wall * 1000 + 300);
  }

  // ── Operaciones destructivas por clip ──────────────────────
  async function denoiseClipById(clipId: string, strength: number): Promise<boolean> {
    const clip = dataRef.current.clips.find((c) => c.id === clipId);
    if (!clip) return false;
    const buffer = buffersMapRef.current.get(clip.mediaId);
    if (!buffer) {
      toast.error(`"${clip.name}" no tiene audio cargado en este dispositivo.`);
      return false;
    }
    const next = await reduceNoiseBuffer(buffer, strength, (v) => {
      setProcessing({ clipId, value: Math.round(v * 100) });
    });
    setBufferFor(clip.mediaId, next);
    await putProjectBlob(projectId, clip.mediaId, audioBufferToWav(next));
    return true;
  }

  async function handleDenoise(clipId: string, strength: number) {
    setProcessing({ clipId, value: 0 });
    try {
      const ok = await denoiseClipById(clipId, strength);
      if (ok) toast.success("Ruido reducido (proceso destructivo sobre el clip).");
    } catch {
      toast.error("No se pudo reducir el ruido.");
    } finally {
      setProcessing(null);
    }
  }

  async function handleNormalize(clipId: string) {
    const clip = dataRef.current.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const buffer = buffersMapRef.current.get(clip.mediaId);
    if (!buffer) {
      toast.error(`"${clip.name}" no tiene audio cargado en este dispositivo.`);
      return;
    }
    try {
      const next = normalizeBufferToDb(buffer, -1);
      setBufferFor(clip.mediaId, next);
      await putProjectBlob(projectId, clip.mediaId, audioBufferToWav(next));
      toast.success(`"${clip.name}" normalizado a -1 dBFS.`);
    } catch {
      toast.error("No se pudo normalizar el clip.");
    }
  }

  // ── Cortes ─────────────────────────────────────────────────
  async function handleCut(
    clipId: string,
    mode: "remove" | "trim" | "split",
    sel: { start: number; end: number },
  ) {
    const clip = dataRef.current.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const buffer = buffersMapRef.current.get(clip.mediaId);
    if (!buffer) {
      toast.error("El audio de este clip no está disponible.");
      return;
    }
    const sr = buffer.sampleRate;
    const speed = clipSpeed(clip);
    try {
      if (mode === "remove") {
        const startF = clamp(sel.start * speed * sr, 0, buffer.length - 1);
        const endF = clamp(sel.end * speed * sr, startF + 1, buffer.length);
        const next = removeRegionFrames(buffer, startF, endF);
        setBufferFor(clip.mediaId, next);
        await putProjectBlob(projectId, clip.mediaId, audioBufferToWav(next));
        toast.success("Selección eliminada del clip.");
        return;
      }
      if (mode === "trim") {
        const startF = clamp(sel.start * speed * sr, 0, buffer.length - 1);
        const endF = clamp(sel.end * speed * sr, startF + 1, buffer.length);
        const next = keepRegionFrames(buffer, startF, endF);
        setBufferFor(clip.mediaId, next);
        await putProjectBlob(projectId, clip.mediaId, audioBufferToWav(next));
        toast.success("Clip recortado a la selección.");
        return;
      }
      // split: en el inicio de la selección, dos clips consecutivos con blobs nuevos
      const splitFrame = clamp(Math.round(sel.start * speed * sr), 1, buffer.length - 1);
      const part1 = keepRegionFrames(buffer, 0, splitFrame);
      const part2 = keepRegionFrames(buffer, splitFrame, buffer.length);
      const mediaId1 = uid();
      const mediaId2 = uid();
      await putProjectBlob(projectId, mediaId1, audioBufferToWav(part1));
      await putProjectBlob(projectId, mediaId2, audioBufferToWav(part2));
      try {
        await deleteProjectBlob(projectId, clip.mediaId);
      } catch {
        // noop
      }
      const splitMixSec = splitFrame / sr / speed;
      const clip1: AudioClip = { ...clip, id: uid(), mediaId: mediaId1, fadeOut: 0 };
      const clip2: AudioClip = {
        ...clip,
        id: uid(),
        mediaId: mediaId2,
        start: Math.round((clip.start + splitMixSec) * 100) / 100,
        fadeIn: 0,
      };
      const current = dataRef.current;
      commitData({
        ...current,
        clips: current.clips.flatMap((c) => (c.id === clip.id ? [clip1, clip2] : [c])),
      });
      const nextMap = new Map(buffersMapRef.current);
      nextMap.delete(clip.mediaId);
      nextMap.set(mediaId1, part1);
      nextMap.set(mediaId2, part2);
      buffersMapRef.current = nextMap;
      setBuffers(nextMap);
      setSelectedClipId(clip1.id);
      toast.success("Clip dividido en dos.");
    } catch {
      toast.error("No se pudo completar la operación de corte.");
    }
  }

  // ── EQ ─────────────────────────────────────────────────────
  function setEqBand(key: EqBandKey, value: number) {
    const current = dataRef.current;
    commitData({ ...current, eq: { ...current.eq, [key]: value } });
  }

  function applyEqPreset(value: string) {
    const preset = EQ_PRESETS.find((p) => p.value === value);
    if (!preset) return;
    const current = dataRef.current;
    commitData({ ...current, eq: { ...preset.values } });
    toast.success(`Preset de EQ: ${preset.label}.`);
  }

  function resetEq() {
    const current = dataRef.current;
    commitData({ ...current, eq: { ...DEFAULT_EQ } });
    toast.success("Ecualizador restablecido.");
  }

  // ── Export ─────────────────────────────────────────────────
  async function handleExport() {
    if (rendering) return;
    setRendering(true);
    try {
      const rendered = await renderMixOffline(dataRef.current, buffersMapRef.current);
      if (!rendered) {
        toast.error("No hay audio para exportar.");
        return;
      }
      const blob = audioBufferToWav(rendered);
      downloadBlob(blob, "mezcla-osk.wav");
      toast.success("WAV exportado (16-bit · 44.1 kHz).");
    } catch {
      toast.error("No se pudo exportar el WAV.");
    } finally {
      setRendering(false);
    }
  }

  // ── IA: ejecutor de operaciones ────────────────────────────
  function findClipByName(name: string): AudioClip | null {
    const n = name.toLowerCase().trim();
    if (!n) return null;
    return dataRef.current.clips.find((c) => c.name.toLowerCase().includes(n)) ?? null;
  }

  function pickActiveOrLastClip(): AudioClip | null {
    const current = dataRef.current;
    if (current.clips.length === 0) return null;
    return current.clips.find((c) => c.id === selectedClipIdRef.current) ?? current.clips[current.clips.length - 1];
  }

  async function runAiOperations(ops: unknown[]): Promise<{ applied: number; notes: string[] }> {
    let applied = 0;
    const notes: string[] = [];
    for (const rawOp of ops) {
      if (!rawOp || typeof rawOp !== "object") continue;
      const op = rawOp as Record<string, unknown>;
      const kind = typeof op.op === "string" ? op.op : "";
      try {
        switch (kind) {
          case "normalize": {
            const current = dataRef.current;
            const sel = current.clips.find((c) => c.id === selectedClipIdRef.current);
            const targets = sel ? [sel] : current.clips;
            if (targets.length === 0) {
              notes.push("No hay clips para normalizar.");
              break;
            }
            for (const clip of targets) await handleNormalize(clip.id);
            applied += 1;
            notes.push(
              targets.length === 1
                ? `Normalicé "${targets[0].name}" a -1 dBFS.`
                : `Normalicé ${targets.length} clips a -1 dBFS.`,
            );
            break;
          }
          case "setGain": {
            const db = toNum(op.db, 0, MIN_GAIN_DB, 24);
            const named = typeof op.clip === "string" ? findClipByName(op.clip) : null;
            if (named) {
              updateClip(named.id, { gain: clamp(dbToGain(db), 0, 2) });
              notes.push(`Volumen de "${named.name}" a ${db} dB.`);
            } else {
              const current = dataRef.current;
              commitData({ ...current, masterGainDb: db });
              notes.push(`Ganancia general a ${db} dB.`);
            }
            applied += 1;
            break;
          }
          case "reduceNoise": {
            const current = dataRef.current;
            const sel = current.clips.find((c) => c.id === selectedClipIdRef.current);
            const targets = sel ? [sel] : current.clips;
            if (targets.length === 0) {
              notes.push("No hay clips para procesar.");
              break;
            }
            const strength = toNum(op.strength, 60, 0, 100);
            let okCount = 0;
            for (const clip of targets) {
              setProcessing({ clipId: clip.id, value: 0 });
              const ok = await denoiseClipById(clip.id, strength);
              if (ok) okCount += 1;
            }
            setProcessing(null);
            applied += 1;
            notes.push(
              okCount === 1
                ? `Reduje el ruido de "${targets[0].name}" (fuerza ${strength}).`
                : `Reduje el ruido en ${okCount} clips (fuerza ${strength}).`,
            );
            break;
          }
          case "setEq": {
            const band = typeof op.band === "string" ? (op.band as EqBandKey) : null;
            if (!band || !(band in DEFAULT_EQ)) {
              notes.push("Banda del ecualizador no reconocida.");
              break;
            }
            const gain = toNum(op.gain, 0, EQ_MIN, EQ_MAX);
            setEqBand(band, gain);
            notes.push(`EQ ${band} a ${formatDb(gain)}.`);
            applied += 1;
            break;
          }
          case "fadeIn":
          case "fadeOut": {
            const target = pickActiveOrLastClip();
            if (!target) {
              notes.push("No hay clips para aplicar el fundido.");
              break;
            }
            const seconds = clamp(toNum(op.seconds, 1, 0, 30), 0, MAX_FADE);
            updateClip(target.id, kind === "fadeIn" ? { fadeIn: seconds } : { fadeOut: seconds });
            notes.push(
              `${kind === "fadeIn" ? "Fundido de entrada" : "Fundido de salida"} de ${seconds} s en "${target.name}".`,
            );
            applied += 1;
            break;
          }
          case "setSpeed": {
            const target = pickActiveOrLastClip();
            if (!target) {
              notes.push("No hay clips para cambiar la velocidad.");
              break;
            }
            const rate = clamp(toNum(op.rate, 1, MIN_SPEED, 4), MIN_SPEED, MAX_SPEED);
            updateClip(target.id, { speedRate: rate });
            notes.push(`Velocidad de "${target.name}" a ${rate}×.`);
            applied += 1;
            break;
          }
          case "setPitch": {
            const target = pickActiveOrLastClip();
            if (!target) {
              notes.push("No hay clips para cambiar el tono.");
              break;
            }
            const semi = clamp(Math.round(toNum(op.semitones, 0, -12, 12)), -MAX_PITCH, MAX_PITCH);
            updateClip(target.id, { pitchSemitones: semi });
            notes.push(`Tono de "${target.name}" a ${semi} semitonos.`);
            applied += 1;
            break;
          }
          case "applyPreset": {
            const target = pickActiveOrLastClip();
            if (!target) {
              notes.push("No hay clips para aplicar el preset.");
              break;
            }
            const preset = typeof op.preset === "string" ? op.preset : "";
            const params = presetParams(preset);
            if (preset && !params.preset && params.speedRate === 1 && preset !== "none") {
              notes.push(`Preset "${preset}" no reconocido.`);
              break;
            }
            updateClip(target.id, params);
            const label = VOICE_PRESETS.find((p) => p.value === (preset === "none" ? "none" : preset))?.label ?? preset;
            notes.push(`Preset "${label}" aplicado a "${target.name}".`);
            applied += 1;
            break;
          }
          default:
            notes.push(`Operación no reconocida: ${kind || "(vacía)"}.`);
        }
      } catch {
        notes.push(`Falló la operación "${kind || "desconocida"}".`);
      }
    }
    return { applied, notes };
  }

  async function sendAiMessage() {
    const instruction = aiInput.trim();
    if (!instruction || aiPending) return;
    setAiMessages((prev) => [...prev, { id: uid(), role: "user", content: instruction }]);
    setAiInput("");
    setAiPending(true);
    try {
      const context = JSON.stringify({
        clips: dataRef.current.clips.map((c) => {
          const buffer = buffersMapRef.current.get(c.mediaId);
          return {
            name: c.name,
            start: Math.round(c.start * 100) / 100,
            duration: buffer ? Math.round((buffer.duration / clipSpeed(c)) * 100) / 100 : 0,
            gain: c.gain,
            preset: c.preset ?? null,
          };
        }),
        eq: dataRef.current.eq,
        masterGainDb: dataRef.current.masterGainDb,
      });
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "audio-editor", instruction, context }),
      });
      const json = (await res.json()) as {
        reply?: string;
        operations?: unknown[];
        unsupported?: string[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : "El asistente no está disponible.",
        );
      }
      setAiMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: (json.reply ?? "Listo.").trim() || "Listo." },
      ]);
      const unsupported = Array.isArray(json.unsupported)
        ? json.unsupported.filter(
            (u): u is string => typeof u === "string" && u.trim().length > 0,
          )
        : [];
      if (unsupported.length > 0) {
        setAiMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            tone: "amber",
            content: `No puedo hacer eso desde el chat: ${unsupported.join(" · ")}`,
          },
        ]);
      }
      const ops = Array.isArray(json.operations) ? json.operations : [];
      if (ops.length > 0) {
        const { applied, notes } = await runAiOperations(ops);
        if (notes.length > 0) {
          setAiMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant", content: notes.join(" ") },
          ]);
        }
        if (applied > 0) {
          toast.success(
            applied === 1 ? "1 operación aplicada." : `${applied} operaciones aplicadas.`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error del asistente.";
      toast.error(message);
      setAiMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", tone: "amber", content: message },
      ]);
    } finally {
      setAiPending(false);
    }
  }

  // ── Drag & drop ────────────────────────────────────────────
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (loading) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) setDragOver(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (loading) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) void importFiles(files);
  }

  // ── Bloques derivados para el timeline ─────────────────────
  const totalSec = Math.max(mixDuration, 1);
  const timelineWidth = Math.max(totalSec * pxPerSec + 16, 320);
  const tickStep = useMemo(() => {
    const ticks = totalSec / 5;
    return ticks <= 400 ? 5 : 5 * Math.ceil(ticks / 400);
  }, [totalSec]);
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i * tickStep <= totalSec; i++) arr.push(i * tickStep);
    return arr;
  }, [totalSec, tickStep]);

  // ── Piezas de UI compartidas (desktop grid / mobile tabs) ──
  const timelineCard = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Timeline</CardTitle>
        <CardDescription>
          Haz clic en la regla para mover el cursor. Toca un bloque para seleccionar el clip.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="outline"
              onClick={playing ? handlePause : handlePlay}
              disabled={!canPlay}
              aria-label={playing ? "Pausar" : "Reproducir"}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant="outline"
              onClick={handleStop}
              disabled={!canPlay}
              aria-label="Detener y volver al inicio"
            >
              <Square className="size-4" />
            </Button>
          </div>
          <div className="font-mono text-sm">
            <span ref={timeLabelRef}>00:00.00</span>
            <span className="text-muted-foreground"> / {formatTime(mixDuration)}</span>
          </div>
          {soloClipId && (
            <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
              Solo: {data.clips.find((c) => c.id === soloClipId)?.name ?? ""}
            </Badge>
          )}
          <div className="ml-auto flex w-40 items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Zoom</span>
            <Slider
              value={[pxPerSec]}
              min={30}
              max={120}
              step={5}
              onValueChange={(v) => setPxPerSec(v[0] ?? 60)}
              aria-label="Zoom del timeline (píxeles por segundo)"
            />
          </div>
        </div>

        <div ref={scrollerRef} className="overflow-x-auto pb-1">
          <div
            className="relative cursor-crosshair"
            style={{ width: timelineWidth }}
            onClick={onTimelineClick}
            role="presentation"
          >
            {/* Regla de tiempo */}
            <div className="relative h-7 border-b border-border/70">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute bottom-0 top-0 border-l border-border/60"
                  style={{ left: t * pxPerSec }}
                >
                  <span className="pl-1 font-mono text-[10px] text-muted-foreground">
                    {formatClock(t)}
                  </span>
                </div>
              ))}
            </div>
            {/* Bloques de clips */}
            <div className="relative h-14">
              {data.clips.map((clip) => {
                const buffer = buffers.get(clip.mediaId);
                const dur = bufferClipDuration(buffer, clip);
                const width = buffer ? Math.max(4, dur * pxPerSec) : 80;
                const dimmed = (soloClipId !== null && soloClipId !== clip.id) || clip.muted;
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClipId(clip.id);
                    }}
                    className={cn(
                      "absolute top-1 h-12 overflow-hidden rounded-md border px-2 text-left text-xs transition-colors",
                      buffer
                        ? "border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30"
                        : "border-amber-500/50 bg-amber-500/15",
                      dimmed && "opacity-40",
                      selectedClipId === clip.id &&
                        "ring-2 ring-emerald-500 ring-offset-1 ring-offset-background",
                    )}
                    style={{ left: clip.start * pxPerSec, width }}
                    title={clip.name}
                  >
                    <span className="block truncate font-medium">{clip.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {buffer ? formatTime(dur) : "Audio faltante"}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Playhead compartido */}
            <div
              ref={playheadLineRef}
              className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-emerald-600"
              style={{ left: 0, transform: "translateX(0px)" }}
              aria-hidden
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const clipsSection = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Clips{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({data.clips.length}/{MAX_CLIPS})
          </span>
        </h2>
        <Button
          size="sm"
          onClick={pickFiles}
          disabled={importing || loading !== null || data.clips.length >= MAX_CLIPS}
          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {importing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Agregar audio
        </Button>
      </div>

      {data.clips.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-muted/20 px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <AudioLines className="size-7" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">Importa tu primer audio</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Arrastra archivos aquí o usa el botón. MP3, WAV, OGG, M4A… hasta {MAX_CLIPS}{" "}
              archivos de {MAX_FILE_MB} MB.
            </p>
          </div>
          <Button
            onClick={pickFiles}
            disabled={importing}
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            Agregar audio
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {data.clips.map((clip) => (
            <ClipRow
              key={clip.id}
              clip={clip}
              buffer={buffers.get(clip.mediaId) ?? null}
              missing={missingIds.has(clip.mediaId)}
              selected={selectedClipId === clip.id}
              soloed={soloClipId === clip.id}
              dimmed={(soloClipId !== null && soloClipId !== clip.id) || clip.muted}
              processing={processing?.clipId === clip.id ? processing.value : null}
              onUpdate={(patch) => updateClip(clip.id, patch)}
              onRemove={() => void removeClip(clip.id)}
              onSelect={() => setSelectedClipId(clip.id)}
              onSolo={() => toggleSolo(clip)}
              onNormalize={() => void handleNormalize(clip.id)}
              onDenoise={(strength) => void handleDenoise(clip.id, strength)}
              onCut={(mode, sel) => void handleCut(clip.id, mode, sel)}
              onListen={(sel) => listenSelection(clip, sel)}
              onReimport={() => openReimport(clip.mediaId)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const eqPanel = (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Ecualizador</CardTitle>
            <CardDescription>8 bandas, de -15 a +15 dB, en cadena.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={eqPresetValue} onValueChange={applyEqPreset}>
              <SelectTrigger size="sm" className="w-36" aria-label="Preset del ecualizador">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQ_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom" disabled>
                  Personalizado
                </SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={resetEq} className="gap-1">
              <RotateCcw className="size-3.5" aria-hidden />
              Restablecer
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-1 sm:gap-2">
          {EQ_BANDS.map((band) => (
            <div key={band.key} className="flex min-w-0 flex-col items-center gap-2">
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {formatDb(data.eq[band.key])}
              </span>
              <Slider
                orientation="vertical"
                className="h-28 min-h-0"
                min={EQ_MIN}
                max={EQ_MAX}
                step={0.5}
                value={[data.eq[band.key]]}
                onValueChange={(v) => setEqBand(band.key, v[0] ?? 0)}
                aria-label={`Banda ${band.label}`}
              />
              <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                {band.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  const voicePanel = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Voz y velocidad</CardTitle>
        <CardDescription>
          Presets y controles del clip seleccionado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!selectedClip ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AudioLines className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium">Ningún clip seleccionado</p>
            <p className="text-xs text-muted-foreground">
              Toca la forma de onda de un clip (o un bloque del timeline) para editarlo aquí.
            </p>
          </div>
        ) : (
          <VoiceControls
            clip={selectedClip}
            onUpdate={(patch) => updateClip(selectedClip.id, patch)}
          />
        )}
      </CardContent>
    </Card>
  );

  const aiPanel = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          Asistente IA
        </CardTitle>
        <CardDescription>
          Pide ajustes en lenguaje natural y se aplican al proyecto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={aiScrollRef}
          className="max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-3"
        >
          {aiMessages.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Ejemplos: “sube el volumen 3 dB”, “pon voz de robot”, “ecualiza 6 kHz a +4”.
            </p>
          ) : (
            aiMessages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-emerald-600 text-white"
                    : m.tone === "amber"
                      ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                      : "border bg-background",
                )}
              >
                {m.content}
              </div>
            ))
          )}
          {aiPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Pensando…
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AI_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setAiInput(s)}
              disabled={aiPending}
              className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-400 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendAiMessage();
          }}
        >
          <Input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="¿Qué quieres ajustar?"
            disabled={aiPending}
            aria-label="Mensaje para el asistente"
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={aiPending || !aiInput.trim()}
            aria-label="Enviar al asistente"
          >
            {aiPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  const exportPanel = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Exportar</CardTitle>
        <CardDescription>
          Render completo de la mezcla a WAV 16-bit · 44.1 kHz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {data.clips.length} {data.clips.length === 1 ? "clip" : "clips"} ·{" "}
            {buffers.size} con audio
          </span>
          <Badge variant="outline" className="font-mono">
            {formatTime(mixDuration)}
          </Badge>
        </div>
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="master-gain">Ganancia general</Label>
            <Badge variant="outline" className="font-mono">
              {formatDb(data.masterGainDb)}
            </Badge>
          </div>
          <Slider
            id="master-gain"
            min={MIN_GAIN_DB}
            max={MAX_GAIN_DB}
            step={0.5}
            value={[data.masterGainDb]}
            onValueChange={(v) => {
              const current = dataRef.current;
              commitData({ ...current, masterGainDb: v[0] ?? 0 });
            }}
            aria-label="Ganancia general de la mezcla"
          />
        </div>
        <Button
          onClick={() => void handleExport()}
          disabled={rendering || !canPlay}
          className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {rendering ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          {rendering ? "Renderizando…" : "Exportar WAV"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Se renderiza la mezcla completa (clips, fundidos, velocidad/tono, efectos de voz, EQ y
          ganancia). En mezclas largas puede tardar unos segundos.
        </p>
      </CardContent>
    </Card>
  );

  // ── Pantalla de carga (progreso por clip) ──────────────────
  if (!hydrated || loading) {
    const progress = loading ? Math.round((loading.done / Math.max(1, loading.total)) * 100) : 0;
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <Loader2 className="size-6 animate-spin text-emerald-600" aria-hidden />
          <p className="text-sm font-medium">Cargando proyecto…</p>
          {loading && (
            <div className="w-full max-w-xs space-y-1.5">
              <Progress value={progress} aria-label="Progreso de carga" />
              <p className="text-center text-xs text-muted-foreground">
                {loading.done} de {loading.total} clips decodificados
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const editorBody = isDesktop ? (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-6">
        {timelineCard}
        {clipsSection}
      </div>
      <div className="space-y-6">
        {eqPanel}
        {voicePanel}
        {aiPanel}
        {exportPanel}
      </div>
    </div>
  ) : (
    <Tabs defaultValue="clips" className="gap-4">
      <TabsList className="h-auto w-full flex-wrap justify-start">
        <TabsTrigger value="clips">Clips</TabsTrigger>
        <TabsTrigger value="eq">EQ</TabsTrigger>
        <TabsTrigger value="voz">Voz</TabsTrigger>
        <TabsTrigger value="ia">IA</TabsTrigger>
        <TabsTrigger value="exportar">Exportar</TabsTrigger>
      </TabsList>
      <TabsContent value="clips" forceMount className="space-y-6">
        {timelineCard}
        {clipsSection}
      </TabsContent>
      <TabsContent value="eq" forceMount>
        {eqPanel}
      </TabsContent>
      <TabsContent value="voz" forceMount>
        {voicePanel}
      </TabsContent>
      <TabsContent value="ia" forceMount>
        {aiPanel}
      </TabsContent>
      <TabsContent value="exportar" forceMount>
        {exportPanel}
      </TabsContent>
    </Tabs>
  );

  return (
    <div
      className={cn(
        "rounded-2xl transition-shadow",
        dragOver && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-background",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {editorBody}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={onImportInputChange}
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={reimportInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => void onReimportChange(e)}
        aria-hidden
        tabIndex={-1}
      />
    </div>
  );
}

// ─── Fila de clip ────────────────────────────────────────────

interface ClipRowProps {
  clip: AudioClip;
  buffer: AudioBuffer | null;
  missing: boolean;
  selected: boolean;
  soloed: boolean;
  dimmed: boolean;
  processing: number | null;
  onUpdate: (patch: Partial<AudioClip>) => void;
  onRemove: () => void;
  onSelect: () => void;
  onSolo: () => void;
  onNormalize: () => void;
  onDenoise: (strength: number) => void;
  onCut: (mode: "remove" | "trim" | "split", sel: { start: number; end: number }) => void;
  onListen: (sel: { start: number; end: number }) => void;
  onReimport: () => void;
}

function ClipRow({
  clip,
  buffer,
  missing,
  selected,
  soloed,
  dimmed,
  processing,
  onUpdate,
  onRemove,
  onSelect,
  onSolo,
  onNormalize,
  onDenoise,
  onCut,
  onListen,
  onReimport,
}: ClipRowProps) {
  const speed = clipSpeed(clip);
  const dur = bufferClipDuration(buffer, clip);

  // Borrador de edición del Input "Inicio": mientras se escribe conserva el texto
  // tal cual ("1.", ""), y al salir muestra siempre el valor real del clip.
  const [startDraft, setStartDraft] = useState<string | null>(null);
  const startShown = startDraft ?? String(clip.start);

  const [selStartText, setSelStartText] = useState("");
  const [selEndText, setSelEndText] = useState("");
  const [noiseStrength, setNoiseStrength] = useState(60);

  const selection = useMemo(() => {
    const s = parseFloat(selStartText.replace(",", "."));
    const e = parseFloat(selEndText.replace(",", "."));
    if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
    if (s < 0 || e <= s || e > dur + 0.001) return null;
    return { start: s, end: Math.min(e, dur) };
  }, [selStartText, selEndText, dur]);

  const commitStartText = (text: string) => {
    const parsed = parseFloat(text.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      onUpdate({ start: Math.round(parsed * 100) / 100 });
    }
  };

  if (missing) {
    return (
      <Card className={cn(dimmed && "opacity-60")}>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{clip.name}</p>
              <p className="text-sm text-muted-foreground">
                Audio faltante: el archivo no está en este dispositivo. Vuelve a importarlo para
                recuperar el clip.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" onClick={onReimport} className="gap-1.5">
                <Upload className="size-3.5" aria-hidden />
                Re-importar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRemove}
                className="gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Eliminar clip
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("transition-opacity", dimmed && "opacity-50", selected && "ring-1 ring-emerald-500")}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Miniatura + datos */}
          <div className="shrink-0 space-y-1.5 sm:w-52">
            <button
              type="button"
              onClick={onSelect}
              className="block w-full text-left focus-visible:outline-2 focus-visible:outline-emerald-500"
              aria-label={`Seleccionar clip ${clip.name}`}
              aria-pressed={selected}
            >
              <AudioEditorWaveform
                buffer={buffer}
                duration={dur}
                selection={selection}
                height={64}
              />
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="font-mono">
                {formatTime(dur)}
              </Badge>
              {clip.preset && (
                <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                  {VOICE_PRESETS.find((p) => p.value === clip.preset)?.label ?? clip.preset}
                </Badge>
              )}
              {(clip.fadeIn ?? 0) > 0 || (clip.fadeOut ?? 0) > 0 ? (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                  fades
                </Badge>
              ) : null}
              {clip.muted && (
                <Badge variant="outline" className="text-muted-foreground">
                  silenciado
                </Badge>
              )}
            </div>
          </div>

          {/* Controles */}
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={clip.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="h-8 min-w-36 flex-1 text-sm"
                aria-label={`Nombre del clip ${clip.name}`}
              />
              <div className="flex items-center gap-1.5">
                <Label className="shrink-0 text-xs text-muted-foreground">Inicio</Label>
                <Input
                  value={startShown}
                  onChange={(e) => {
                    setStartDraft(e.target.value);
                    commitStartText(e.target.value);
                  }}
                  onBlur={() => setStartDraft(null)}
                  inputMode="decimal"
                  className="h-8 w-20 text-sm"
                  aria-label="Inicio del clip en segundos"
                />
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="icon"
                  variant={soloed ? "default" : "outline"}
                  className={cn(
                    "size-8",
                    soloed && "bg-emerald-600 text-white hover:bg-emerald-700",
                  )}
                  onClick={onSolo}
                  aria-pressed={soloed}
                  aria-label="Oír solo este clip"
                  title="Oír solo este clip"
                >
                  <Headphones className="size-3.5" aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className={cn("size-8", clip.muted && "text-amber-600 dark:text-amber-400")}
                  onClick={() => onUpdate({ muted: !clip.muted })}
                  aria-pressed={clip.muted}
                  aria-label={clip.muted ? "Activar clip" : "Silenciar clip"}
                  title={clip.muted ? "Activar clip" : "Silenciar clip"}
                >
                  {clip.muted ? (
                    <VolumeX className="size-3.5" aria-hidden />
                  ) : (
                    <Volume2 className="size-3.5" aria-hidden />
                  )}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={!buffer}
                      title="Normalizar el pico a -1 dBFS (destructivo)"
                    >
                      <Gauge className="size-3.5" aria-hidden />
                      Normalizar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Normalizar clip</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se ajustará la ganancia de “{clip.name}” para llevar su pico a -1 dBFS.
                        Esto modifica el audio del clip de forma destructiva (puedes volver a
                        importar el original si lo necesitas).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onNormalize}>Normalizar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={!buffer || processing !== null}
                      title="Reducir ruido de fondo (destructivo)"
                    >
                      <Wind className="size-3.5" aria-hidden />
                      Reducir ruido
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reducir ruido</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se aplicará sobre el audio del clip “{clip.name}” de forma destructiva
                        (puedes volver a importar el original). Se estima el perfil de ruido con
                        los primeros 0.5 s y se atenúan las frecuencias bajo ese umbral.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <Label htmlFor={`noise-${clip.id}`}>Fuerza</Label>
                        <span className="font-mono text-xs">{noiseStrength}%</span>
                      </div>
                      <Slider
                        id={`noise-${clip.id}`}
                        min={0}
                        max={100}
                        step={5}
                        value={[noiseStrength]}
                        onValueChange={(v) => setNoiseStrength(v[0] ?? 60)}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDenoise(noiseStrength)}>
                        Aplicar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-8 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                      aria-label="Eliminar clip"
                      title="Eliminar clip (borra también su audio guardado)"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar “{clip.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se quitará el clip del proyecto y se borrará su audio de este dispositivo.
                        Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onRemove}
                        className="bg-red-600 text-white hover:bg-red-700"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Volumen + fades */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Volumen</Label>
                  <span className="font-mono text-xs">{clip.gain.toFixed(2)}×</span>
                </div>
                <Slider
                  min={0}
                  max={2}
                  step={0.05}
                  value={[clip.gain]}
                  onValueChange={(v) => onUpdate({ gain: v[0] ?? 1 })}
                  aria-label={`Volumen del clip ${clip.name}`}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Entrada (fade)</Label>
                  <span className="font-mono text-xs">{(clip.fadeIn ?? 0).toFixed(1)} s</span>
                </div>
                <Slider
                  min={0}
                  max={MAX_FADE}
                  step={0.1}
                  value={[clip.fadeIn ?? 0]}
                  onValueChange={(v) => onUpdate({ fadeIn: v[0] ?? 0 })}
                  aria-label={`Fundido de entrada del clip ${clip.name}`}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Salida (fade)</Label>
                  <span className="font-mono text-xs">{(clip.fadeOut ?? 0).toFixed(1)} s</span>
                </div>
                <Slider
                  min={0}
                  max={MAX_FADE}
                  step={0.1}
                  value={[clip.fadeOut ?? 0]}
                  onValueChange={(v) => onUpdate({ fadeOut: v[0] ?? 0 })}
                  aria-label={`Fundido de salida del clip ${clip.name}`}
                />
              </div>
            </div>

            {/* Progreso de reducción de ruido */}
            {processing !== null && (
              <div className="space-y-1">
                <Progress value={processing} aria-label="Progreso de reducción de ruido" />
                <p className="text-xs text-muted-foreground">Procesando… {processing}%</p>
              </div>
            )}

            {/* Selección y cortes */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs font-semibold">
                  <Crop className="size-3.5" aria-hidden />
                  Cortar
                </span>
                <Input
                  value={selStartText}
                  onChange={(e) => setSelStartText(e.target.value)}
                  placeholder="Inicio (s)"
                  inputMode="decimal"
                  className="h-7 w-24 text-xs"
                  aria-label="Inicio de la selección en segundos"
                />
                <Input
                  value={selEndText}
                  onChange={(e) => setSelEndText(e.target.value)}
                  placeholder="Fin (s)"
                  inputMode="decimal"
                  className="h-7 w-24 text-xs"
                  aria-label="Fin de la selección en segundos"
                />
                {selection && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 font-mono text-amber-600 dark:text-amber-400"
                  >
                    {formatTime(selection.end - selection.start)}
                  </Badge>
                )}
                {buffer && (
                  <span className="text-[11px] text-muted-foreground">
                    clip: 0 – {formatTime(dur)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={!selection || !buffer}
                  onClick={() => selection && onListen(selection)}
                >
                  <Play className="size-3.5" aria-hidden />
                  Escuchar selección
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={!selection || processing !== null}
                  onClick={() => selection && onCut("remove", selection)}
                >
                  <Eraser className="size-3.5" aria-hidden />
                  Eliminar selección
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={!selection || processing !== null}
                  onClick={() => selection && onCut("trim", selection)}
                >
                  <Crop className="size-3.5" aria-hidden />
                  Recortar a selección
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={
                    !selection ||
                    processing !== null ||
                    selection.start < 0.05 ||
                    selection.start >= dur - 0.05
                  }
                  title="Divide el clip en el inicio de la selección"
                  onClick={() =>
                    selection && onCut("split", { start: selection.start, end: selection.start + 0.01 })
                  }
                >
                  <SplitSquareHorizontal className="size-3.5" aria-hidden />
                  Dividir aquí
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Controles de voz (clip seleccionado) ────────────────────

function VoiceControls({
  clip,
  onUpdate,
}: {
  clip: AudioClip;
  onUpdate: (patch: Partial<AudioClip>) => void;
}) {
  const speed = clipSpeed(clip);
  const pitch = clipPitch(clip);
  const rate = speed * Math.pow(2, pitch / 12);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Preset de voz</Label>
        <Select
          value={voiceValueForClip(clip)}
          onValueChange={(v) => onUpdate(presetParams(v))}
        >
          <SelectTrigger className="w-full" aria-label="Preset de voz">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOICE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Robot, Eco y Teléfono son efectos sobre el audio; Ardilla y Profundo cambian la
          velocidad (y con ella el tono).
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Velocidad</Label>
          <Badge variant="outline" className="font-mono">
            {speed.toFixed(2)}×
          </Badge>
        </div>
        <Slider
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={0.05}
          value={[speed]}
          onValueChange={(v) => onUpdate({ speedRate: v[0] ?? 1 })}
          aria-label="Velocidad del clip"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Tono (semitonos)</Label>
          <Badge variant="outline" className="font-mono">
            {pitch > 0 ? `+${pitch}` : pitch}
          </Badge>
        </div>
        <Slider
          min={-MAX_PITCH}
          max={MAX_PITCH}
          step={1}
          value={[pitch]}
          onValueChange={(v) => onUpdate({ pitchSemitones: v[0] ?? 0 })}
          aria-label="Tono del clip en semitonos"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Velocidad y tono se combinan en la tasa de reproducción (cambian juntos).
        </span>
        <Badge variant="outline" className="font-mono">
          tasa {rate.toFixed(2)}×
        </Badge>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => onUpdate({ preset: null, speedRate: 1, pitchSemitones: 0 })}
      >
        <RotateCcw className="size-3.5" aria-hidden />
        Restablecer voz, velocidad y tono
      </Button>
    </div>
  );
}
