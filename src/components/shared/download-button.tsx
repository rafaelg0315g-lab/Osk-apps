"use client";

import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

export interface DownloadButtonProps {
  blob: Blob | null;
  filename: string;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "default" | "lg";
  className?: string;
}

/** Botón estándar de descarga: recibe un Blob y lo descarga con el nombre dado. */
export function DownloadButton({
  blob,
  filename,
  label = "Descargar",
  disabled = false,
  loading = false,
  size = "default",
  className,
}: DownloadButtonProps) {
  return (
    <Button
      type="button"
      size={size}
      disabled={disabled || !blob || loading}
      onClick={() => blob && downloadBlob(blob, filename)}
      className={cn("gap-2", className)}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {label}
    </Button>
  );
}
