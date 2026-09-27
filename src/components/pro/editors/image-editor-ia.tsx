"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { ChatMsg } from "./image-editor-types";

// ─── Diálogo "IA de imagen" (edición generativa / inpainting) ───────────────

interface AiPromptChip {
  label: string;
  prompt: string;
  /** true → activa el modo "solo el objeto seleccionado". */
  selection?: boolean;
}

const AI_PROMPT_CHIPS: AiPromptChip[] = [
  {
    label: "Quitar fondo (blanco)",
    prompt:
      "Elimina el fondo de la imagen por completo y reemplazalo con blanco puro, sin halos. Mantén intacto el objeto principal.",
  },
  {
    label: "Eliminar objeto seleccionado",
    prompt:
      "Elimina por completo el objeto situado dentro del área indicada de la imagen y rellena el hueco de forma natural con el entorno (inpainting).",
    selection: true,
  },
  {
    label: "Mejorar calidad",
    prompt:
      "Mejora la calidad, la nitidez y el nivel de detalle de esta imagen manteniendo exactamente el mismo contenido, colores y encuadre.",
  },
  {
    label: "Blanco y negro profesional",
    prompt:
      "Convierte esta imagen a blanco y negro profesional, con buen contraste y un rango tonal rico, sin perder detalle.",
  },
];

interface AiImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasSelection: boolean;
  running: boolean;
  error: string | null;
  /** (prompt, soloObjetoSeleccionado) */
  onSubmit: (prompt: string, onlySelection: boolean) => void;
}

export function AiImageDialog({
  open,
  onOpenChange,
  hasSelection,
  running,
  error,
  onSubmit,
}: AiImageDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [onlySelection, setOnlySelection] = useState(false);

  function submit() {
    const value = prompt.trim();
    if (!value || running) return;
    onSubmit(value, onlySelection && hasSelection);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!running) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-600 dark:text-amber-400" aria-hidden />
            IA de imagen
          </DialogTitle>
          <DialogDescription>
            Edición generativa: eliminar objetos, cambiar el fondo, mejorar calidad… El resultado se
            agregará como una capa nueva encima del lienzo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ej: elimina el objeto del centro; cambia el fondo a un atardecer"
            rows={3}
            disabled={running}
            aria-label="Instrucción para la IA"
          />

          <div className="flex flex-wrap gap-1.5">
            {AI_PROMPT_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                disabled={running}
                onClick={() => {
                  setPrompt(chip.prompt);
                  if (chip.selection) setOnlySelection(true);
                }}
                className="rounded-full border border-amber-300 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-300"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="ai-only-selection" className="text-sm font-medium">
                Solo el objeto seleccionado
              </Label>
              <p className="text-xs text-muted-foreground">
                {hasSelection
                  ? "Envía a la IA únicamente la región del objeto seleccionado."
                  : "Selecciona un objeto en el lienzo para usar esta opción."}
              </p>
            </div>
            <Switch
              id="ai-only-selection"
              checked={onlySelection && hasSelection}
              onCheckedChange={setOnlySelection}
              disabled={running || !hasSelection}
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          ) : null}

          {running ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Generando con IA (~10-30 s)…
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={running || !prompt.trim()}
            className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
          >
            {running ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" aria-hidden />
            )}
            Generar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pestaña "Asistente IA" (chat de operaciones) ───────────────────────────

const CHAT_QUICK_CHIPS = [
  "Sube el brillo a 30",
  "Aplica sepia",
  "Añade un texto OFERTA en el centro",
  "Quita los filtros",
  "Pixela la imagen",
];

interface AssistantTabProps {
  messages: ChatMsg[];
  running: boolean;
  onSend: (text: string) => void;
}

export function AssistantTab({ messages, running, onSend }: AssistantTabProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, running]);

  function send() {
    const value = input.trim();
    if (!value || running) return;
    onSend(value);
    setInput("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Pide ajustes en lenguaje natural y el asistente aplicará las operaciones del editor. Por
            ejemplo: «sube el contraste a 40» o «añade un texto OFERTA en el centro».
          </p>
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
        {running ? (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Pensando…
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHAT_QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={running}
            onClick={() => onSend(chip)}
            className="rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-amber-400 hover:text-foreground disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Describe el ajuste…"
          disabled={running}
          aria-label="Mensaje para el asistente"
        />
        <Button
          size="icon"
          onClick={send}
          disabled={running || !input.trim()}
          className="size-9 shrink-0 bg-amber-600 text-white hover:bg-amber-700"
          title="Enviar"
          aria-label="Enviar mensaje"
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-amber-600 px-3 py-1.5 text-sm text-white">
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.role === "system") {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{msg.text}</span>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-background px-3 py-1.5 text-sm",
        )}
      >
        {msg.text}
      </div>
    </div>
  );
}
