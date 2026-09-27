"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface AudioEditorWaveformProps {
  buffer: AudioBuffer | null;
  /** Duración a representar (segundos; para mapear la selección). */
  duration: number;
  /** Selección relativa al clip, en segundos (se dibuja en ámbar). */
  selection?: { start: number; end: number } | null;
  height?: number;
  className?: string;
}

const COLUMNS = 200;

/**
 * Waveform en miniatura: dibuja los peaks del AudioBuffer en 200 columnas
 * (min/max por columna) con trazo esmeralda sobre fondo transparente.
 */
export function AudioEditorWaveform({
  buffer,
  duration,
  selection = null,
  height = 64,
  className,
}: AudioEditorWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const draw = () => {
      const w = container.clientWidth;
      if (w <= 0) return;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, height);

      // Línea central sutil
      ctx.strokeStyle = "rgba(16, 185, 129, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(w, height / 2);
      ctx.stroke();

      if (buffer && buffer.length > 0) {
        const data = buffer.getChannelData(0);
        const perCol = buffer.length / COLUMNS;
        const colW = w / COLUMNS;
        ctx.strokeStyle = "#059669";
        ctx.lineWidth = Math.max(1, colW * 0.7);
        ctx.beginPath();
        for (let i = 0; i < COLUMNS; i++) {
          const from = Math.floor(i * perCol);
          const to = Math.min(buffer.length, Math.max(from + 1, Math.floor((i + 1) * perCol)));
          let min = 1;
          let max = -1;
          const stride = Math.max(1, Math.floor((to - from) / 64));
          for (let j = from; j < to; j += stride) {
            const v = data[j];
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (min > max) {
            min = 0;
            max = 0;
          }
          const x = i * colW + colW / 2;
          const y1 = height / 2 - max * (height / 2 - 2);
          let y2 = height / 2 - min * (height / 2 - 2);
          if (Math.abs(y2 - y1) < 0.75) y2 = y1 + 0.75;
          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
        }
        ctx.stroke();
      }

      if (selection && selection.end > selection.start && duration > 0) {
        const x1 = (selection.start / duration) * w;
        const x2 = (selection.end / duration) * w;
        ctx.fillStyle = "rgba(245, 158, 11, 0.22)";
        ctx.fillRect(x1, 0, Math.max(2, x2 - x1), height);
        ctx.strokeStyle = "rgba(217, 119, 6, 0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1 + 0.5, 0);
        ctx.lineTo(x1 + 0.5, height);
        ctx.moveTo(x2 - 0.5, 0);
        ctx.lineTo(x2 - 0.5, height);
        ctx.stroke();
      }
    };

    draw();
    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [buffer, duration, selection, height]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden rounded-md bg-muted/40", className)}
      style={{ height }}
    >
      <canvas ref={canvasRef} className="block" aria-hidden />
      {!buffer && (
        <span className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
          Sin datos de audio
        </span>
      )}
    </div>
  );
}
