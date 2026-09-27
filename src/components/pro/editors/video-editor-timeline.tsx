"use client";

/**
 * Timeline del editor de video PRO:
 * - Regla de tiempo con marcas cada 1s/5s según zoom (drag = seek).
 * - Pista de video: bloques violeta reordenables por arrastre horizontal.
 * - Pista de texto: bloques ámbar movibles (start/end manteniendo duración).
 * - Playhead absoluto + zoom 20..160 px/s.
 * Los offsets SIEMPRE se recalculan como función derivada (nunca se guardan).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Film, Type } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { clamp, clipTrimLength, formatTimecode, type TextOverlay, type VideoClip } from "./video-editor-types";

export interface VideoEditorTimelineProps {
  clips: VideoClip[];
  texts: TextOverlay[];
  offsets: number[];
  total: number;
  zoom: number;
  currentTime: number;
  selectedClipId: string | null;
  selectedTextId: string | null;
  missingMedia: Set<string>;
  followPlayhead: boolean;
  onSelectClip: (id: string) => void;
  onSelectEmpty: () => void;
  onSelectText: (id: string) => void;
  onReorderClip: (clipId: string, insertIndex: number) => void;
  onMoveText: (textId: string, newStart: number) => void;
  onSeek: (t: number) => void;
  onZoomChange: (zoom: number) => void;
}

const RULER_H = 28;
const VIDEO_TRACK_TOP = 32;
const VIDEO_TRACK_H = 64;
const TEXT_TRACK_TOP = 104;
const TEXT_TRACK_H = 36;
const CONTENT_H = 152;
const DRAG_THRESHOLD = 4;

export function VideoEditorTimeline(props: VideoEditorTimelineProps) {
  const {
    clips,
    texts,
    offsets,
    total,
    zoom,
    currentTime,
    selectedClipId,
    selectedTextId,
    missingMedia,
    followPlayhead,
    onSelectClip,
    onSelectEmpty,
    onSelectText,
    onReorderClip,
    onMoveText,
    onSeek,
    onZoomChange,
  } = props;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  // ── Drag de clips (reordenar) ─────────────────────────────
  const [clipDrag, setClipDrag] = useState<{
    id: string;
    dx: number;
    targetIndex: number;
    boundaryX: number;
  } | null>(null);
  const clipDragRef = useRef<{ id: string; startX: number; pointerId: number; moved: boolean } | null>(null);

  // ── Drag de textos (mover start/end) ──────────────────────
  const [textDragId, setTextDragId] = useState<string | null>(null);
  const textDragRef = useRef<{
    id: string;
    startX: number;
    origStart: number;
    len: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);

  // ── Drag de la regla (seek) ───────────────────────────────
  const rulerDragRef = useRef<number | null>(null);

  const contentWidth = Math.max(total * zoom + 140, 260);

  const timeFromEvent = useCallback(
    (clientX: number): number => {
      const rect = innerRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return clamp((clientX - rect.left) / zoom, 0, total);
    },
    [zoom, total],
  );

  // ── Regla ─────────────────────────────────────────────────
  const { minorStep, labelEvery } = useMemo(() => {
    let minor = zoom >= 40 ? 1 : 5;
    if (total / minor > 1200) minor = Math.ceil(total / 1200);
    const labelSeconds = zoom >= 80 ? 1 : zoom >= 40 ? 5 : 15;
    const every = Math.max(1, Math.round(labelSeconds / minor));
    return { minorStep: minor, labelEvery: every };
  }, [zoom, total]);

  const ticks = useMemo(() => {
    const list: { second: number; major: boolean }[] = [];
    const count = Math.min(Math.ceil(total / minorStep) + 1, 1400);
    for (let i = 0; i < count; i++) {
      list.push({ second: i * minorStep, major: i % labelEvery === 0 });
    }
    return list;
  }, [total, minorStep, labelEvery]);

  // ── Auto-scroll siguiendo el playhead ─────────────────────
  useEffect(() => {
    if (!followPlayhead) return;
    const el = scrollRef.current;
    if (!el) return;
    const x = currentTime * zoom;
    const viewStart = el.scrollLeft;
    const viewEnd = el.scrollLeft + el.clientWidth;
    if (x < viewStart + 48) {
      el.scrollLeft = Math.max(0, x - 48);
    } else if (x > viewEnd - 96) {
      el.scrollLeft = Math.max(0, x - el.clientWidth + 140);
    }
  }, [currentTime, followPlayhead, zoom]);

  function computeClipTarget(id: string, dx: number): { targetIndex: number; boundaryX: number } {
    const i = clips.findIndex((c) => c.id === id);
    if (i < 0) return { targetIndex: 0, boundaryX: 0 };
    const dragCenter = (offsets[i] + clipTrimLength(clips[i]) / 2) * zoom + dx;
    // Índice de inserción: cuántos centros (sin el arrastrado) quedan a su izquierda.
    let targetIndex = 0;
    for (let j = 0; j < clips.length; j++) {
      if (j === i) continue;
      const center = (offsets[j] + clipTrimLength(clips[j]) / 2) * zoom;
      if (dragCenter > center) targetIndex += 1;
    }
    // Frontera visual: suma de duraciones de los primeros `targetIndex` clips restantes.
    let boundaryTime = 0;
    let counted = 0;
    for (let j = 0; j < clips.length && counted < targetIndex; j++) {
      if (clips[j].id === id) continue;
      boundaryTime += clipTrimLength(clips[j]);
      counted += 1;
    }
    return { targetIndex, boundaryX: boundaryTime * zoom };
  }

  function onClipPointerDown(e: React.PointerEvent<HTMLDivElement>, id: string): void {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    clipDragRef.current = { id, startX: e.clientX, pointerId: e.pointerId, moved: false };
    onSelectClip(id);
  }

  function onClipPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const state = clipDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    state.moved = true;
    const { targetIndex, boundaryX } = computeClipTarget(state.id, dx);
    setClipDrag({ id: state.id, dx, targetIndex, boundaryX });
  }

  function onClipPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    const state = clipDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    clipDragRef.current = null;
    if (state.moved && clipDrag) {
      const currentIndex = clips.findIndex((c) => c.id === state.id);
      if (clipDrag.targetIndex !== currentIndex && clipDrag.targetIndex >= 0) {
        onReorderClip(state.id, clipDrag.targetIndex);
      }
    }
    setClipDrag(null);
  }

  function onTextPointerDown(e: React.PointerEvent<HTMLDivElement>, text: TextOverlay): void {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    textDragRef.current = {
      id: text.id,
      startX: e.clientX,
      origStart: text.start,
      len: Math.max(0.2, text.end - text.start),
      pointerId: e.pointerId,
      moved: false,
    };
    setTextDragId(text.id);
    onSelectText(text.id);
  }

  function onTextPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const state = textDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    state.moved = true;
    const dt = dx / zoom;
    const maxStart = Math.max(0, total - state.len);
    onMoveText(state.id, clamp(state.origStart + dt, 0, maxStart));
  }

  function onTextPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    const state = textDragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    textDragRef.current = null;
    setTextDragId(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          Línea de tiempo · arrastra los clips para reordenar, la regla para mover el playhead
        </p>
        <div className="flex w-36 shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider
            value={[zoom]}
            min={20}
            max={160}
            step={10}
            onValueChange={(v) => onZoomChange(v[0] ?? zoom)}
            aria-label="Zoom de la línea de tiempo"
          />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-900"
      >
        <div
          ref={innerRef}
          className="relative select-none"
          style={{ width: contentWidth, minWidth: "100%", height: CONTENT_H }}
          onPointerDown={onSelectEmpty}
        >
          {/* Regla de tiempo */}
          <div
            className="absolute inset-x-0 top-0 cursor-ew-resize touch-pan-y"
            style={{ height: RULER_H }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              rulerDragRef.current = e.pointerId;
              onSeek(timeFromEvent(e.clientX));
            }}
            onPointerMove={(e) => {
              if (rulerDragRef.current === e.pointerId) onSeek(timeFromEvent(e.clientX));
            }}
            onPointerUp={() => {
              rulerDragRef.current = null;
            }}
            onPointerCancel={() => {
              rulerDragRef.current = null;
            }}
          >
            <div className="absolute inset-x-0 bottom-0 top-0 border-b border-zinc-300 dark:border-zinc-700" />
            {ticks.map((tick) => (
              <div
                key={tick.second}
                className={cn(
                  "absolute bottom-0 border-zinc-400 dark:border-zinc-600",
                  tick.major ? "top-0 border-l" : "top-1/2 border-l",
                  !tick.major && "h-2 border-opacity-60",
                )}
                style={{ left: tick.second * zoom }}
              >
                {tick.major && (
                  <span className="absolute left-1 top-0.5 text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatTimecode(tick.second)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Pista de video */}
          <div
            className="absolute inset-x-0"
            style={{ top: VIDEO_TRACK_TOP, height: VIDEO_TRACK_H }}
          >
            <span className="pointer-events-none absolute left-1.5 -top-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              <Film className="size-3" aria-hidden /> Video
            </span>
            {clips.map((clip, i) => {
              const len = Math.max(0.05, clipTrimLength(clip));
              const left = offsets[i] * zoom;
              const width = Math.max(24, len * zoom);
              const dragging = clipDrag?.id === clip.id;
              const missing = missingMedia.has(clip.mediaId);
              return (
                <div
                  key={clip.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Clip ${clip.name}`}
                  className={cn(
                    "absolute cursor-grab touch-pan-y overflow-hidden rounded-md border-2 px-2 py-1 transition-shadow",
                    selectedClipId === clip.id
                      ? "border-violet-600 bg-violet-600/25 ring-2 ring-violet-600/40"
                      : "border-violet-500/70 bg-violet-500/15 hover:bg-violet-500/25",
                    missing && "border-amber-500 bg-amber-500/20",
                    dragging && "z-20 cursor-grabbing opacity-80 shadow-lg",
                  )}
                  style={{
                    left,
                    width,
                    top: 14,
                    height: VIDEO_TRACK_H - 14,
                    transform: dragging ? `translateX(${clipDrag.dx}px)` : undefined,
                  }}
                  onPointerDown={(e) => onClipPointerDown(e, clip.id)}
                  onPointerMove={onClipPointerMove}
                  onPointerUp={onClipPointerUp}
                  onPointerCancel={onClipPointerUp}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onSelectClip(clip.id);
                  }}
                >
                  <p className="truncate text-[11px] font-semibold leading-tight text-zinc-800 dark:text-zinc-100">
                    {clip.name}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatTimecode(len)}
                    {missing ? " · falta el archivo" : ""}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Indicador de inserción durante el arrastre */}
          {clipDrag && clipDrag.targetIndex >= 0 && clipDrag.targetIndex !== clips.findIndex((c) => c.id === clipDrag.id) && (
            <div
              className="pointer-events-none absolute z-30 w-0.5 rounded bg-violet-600"
              style={{
                left: clipDrag.boundaryX,
                top: VIDEO_TRACK_TOP,
                height: VIDEO_TRACK_H,
              }}
            />
          )}

          {/* Pista de texto */}
          <div className="absolute inset-x-0" style={{ top: TEXT_TRACK_TOP, height: TEXT_TRACK_H }}>
            <span className="pointer-events-none absolute left-1.5 -top-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
              <Type className="size-3" aria-hidden /> Texto
            </span>
            {texts.map((text) => {
              const len = Math.max(0.2, text.end - text.start);
              const left = text.start * zoom;
              const width = Math.max(20, len * zoom);
              return (
                <div
                  key={text.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Texto: ${text.text}`}
                  className={cn(
                    "absolute cursor-grab touch-pan-y truncate rounded-md border px-1.5 text-[10px] leading-[22px]",
                    selectedTextId === text.id || textDragId === text.id
                      ? "border-amber-500 bg-amber-400/40 ring-2 ring-amber-500/40"
                      : "border-amber-500/70 bg-amber-400/20 hover:bg-amber-400/30",
                    textDragId === text.id && "z-20 cursor-grabbing",
                  )}
                  style={{ left, width, top: 14, height: TEXT_TRACK_H - 14 }}
                  onPointerDown={(e) => onTextPointerDown(e, text)}
                  onPointerMove={onTextPointerMove}
                  onPointerUp={onTextPointerUp}
                  onPointerCancel={onTextPointerUp}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onSelectText(text.id);
                  }}
                >
                  <span className="text-amber-900 dark:text-amber-100">{text.text}</span>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 z-30 w-0.5 bg-violet-600"
            style={{ left: currentTime * zoom, top: 0 }}
          >
            <div className="absolute -left-[3px] top-0 h-2 w-2 rounded-[2px] bg-violet-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
