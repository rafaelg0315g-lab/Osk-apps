"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CopyButtonProps {
  value: string;
  label?: string;
  size?: "icon" | "sm" | "default";
  className?: string;
}

/** Copia al portapapeles con feedback visual y toast. */
export function CopyButton({ value, label, size = "icon", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado al portapapeles");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={copy}
      disabled={!value}
      aria-label={label ?? "Copiar al portapapeles"}
      className={cn("gap-1.5", className)}
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {label && size !== "icon" && <span className="text-xs">{label}</span>}
    </Button>
  );
}
