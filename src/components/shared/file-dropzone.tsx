"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, File as FileIcon, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatBytes } from "@/lib/utils";

export interface FileDropzoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Atributo accept del input, ej: ".pdf,application/pdf" o "image/*" */
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  /** Límite por archivo en MB (default 20). */
  maxSizeMB?: number;
  /** Muestra botones para reordenar (útil para combinar PDFs). */
  reorderable?: boolean;
  disabled?: boolean;
  /** Texto personalizado del área de arrastre. */
  hint?: string;
  className?: string;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function FileDropzone({
  files,
  onFilesChange,
  accept,
  multiple = false,
  maxFiles = 10,
  maxSizeMB = 20,
  reorderable = false,
  disabled = false,
  hint,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      const valid: File[] = [];

      for (const file of list) {
        if (file.size > maxSizeMB * 1024 * 1024) {
          toast.error(`"${file.name}" supera el límite de ${maxSizeMB} MB`);
          continue;
        }
        valid.push(file);
      }

      if (valid.length === 0) return;

      const current = multiple ? files : [];
      const next = [...current, ...valid];
      if (next.length > maxFiles) {
        toast.error(`Máximo ${maxFiles} archivo${maxFiles > 1 ? "s" : ""}`);
        onFilesChange(next.slice(0, maxFiles));
        return;
      }
      onFilesChange(next);
    },
    [files, maxFiles, maxSizeMB, multiple, onFilesChange],
  );

  const removeAt = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Zona para subir archivos"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors",
          "hover:border-primary/40 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isDragging && "border-primary/60 bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
          <Upload className="size-5 text-primary" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">
            Arrastra y suelta {multiple ? "tus archivos" : "tu archivo"} aquí
          </p>
          <p className="text-xs text-muted-foreground">
            {hint ?? "o haz clic para seleccionar"} · Máx. {maxSizeMB} MB por archivo
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Archivos seleccionados">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}-${file.lastModified}`}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
            >
              <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
              </div>
              {reorderable && files.length > 1 && (
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Subir archivo en la lista"
                    disabled={index === 0 || disabled}
                    onClick={() => onFilesChange(move(files, index, index - 1))}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Bajar archivo en la lista"
                    disabled={index === files.length - 1 || disabled}
                    onClick={() => onFilesChange(move(files, index, index + 1))}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar ${file.name}`}
                disabled={disabled}
                onClick={() => removeAt(index)}
                className="size-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
          {files.length > 1 && (
            <li className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onFilesChange([])}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Limpiar todo
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
