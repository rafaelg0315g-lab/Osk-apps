"use client";

import { useMemo, useState } from "react";
import CryptoJS from "crypto-js";
import { ChevronDown, ChevronUp, Lock } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { ToolShell } from "@/components/shared/tool-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatBytes } from "@/lib/utils";

const encoder = new TextEncoder();

interface HashRow {
  algorithm: string;
  bits: string;
  value: string;
  badgeClass: string;
}

function computeHashes(text: string): HashRow[] {
  return [
    {
      algorithm: "MD5",
      bits: "128 bits",
      value: CryptoJS.MD5(text).toString(),
      badgeClass:
        "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    },
    {
      algorithm: "SHA-1",
      bits: "160 bits",
      value: CryptoJS.SHA1(text).toString(),
      badgeClass:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
    },
    {
      algorithm: "SHA-256",
      bits: "256 bits",
      value: CryptoJS.SHA256(text).toString(),
      badgeClass:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      algorithm: "SHA-512",
      bits: "512 bits",
      value: CryptoJS.SHA512(text).toString(),
      badgeClass:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
    },
  ];
}

export default function HashGenerator() {
  const [text, setText] = useState("");
  const [uppercase, setUppercase] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const hashes = useMemo(() => {
    const rows = computeHashes(text);
    if (!uppercase) return rows;
    return rows.map((row) => ({ ...row, value: row.value.toUpperCase() }));
  }, [text, uppercase]);

  const inputBytes = useMemo(() => encoder.encode(text).length, [text]);

  const toggleExpanded = (algorithm: string) => {
    setExpanded((prev) => ({ ...prev, [algorithm]: !prev[algorithm] }));
  };

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>Texto de entrada</CardTitle>
          <CardDescription>
            Los hashes se recalculan en vivo mientras escribes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe o pega el texto que quieres hashear…"
            aria-label="Texto para calcular hashes"
            className="min-h-32 font-mono text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="hash-uppercase"
                checked={uppercase}
                onCheckedChange={setUppercase}
              />
              <Label htmlFor="hash-uppercase">Mayúsculas</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {text.length} caracteres · {formatBytes(inputBytes)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultados</CardTitle>
          <CardDescription>
            Cuatro algoritmos calculados sobre el mismo texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hashes.map((row) => {
            const isExpanded = expanded[row.algorithm] ?? false;
            return (
              <div
                key={row.algorithm}
                className="rounded-lg border p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={row.badgeClass}>
                      {row.algorithm}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {row.bits}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleExpanded(row.algorithm)}
                      aria-label={
                        isExpanded
                          ? `Contraer hash ${row.algorithm}`
                          : `Expandir hash ${row.algorithm}`
                      }
                      className="size-8"
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" aria-hidden />
                      ) : (
                        <ChevronDown className="size-4" aria-hidden />
                      )}
                    </Button>
                    <CopyButton value={row.value} />
                  </div>
                </div>
                <p
                  className={cn(
                    "mt-2 font-mono text-xs break-all",
                    !isExpanded && "line-clamp-1"
                  )}
                >
                  {row.value}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <Lock className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        <p className="text-sm text-muted-foreground">
          El hash se calcula localmente en tu navegador; tu texto nunca sale del
          dispositivo.
        </p>
      </div>
    </ToolShell>
  );
}
