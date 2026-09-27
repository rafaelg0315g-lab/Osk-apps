"use client";

import { useEffect, useMemo, useState } from "react";
import { GitCompare, ShieldCheck } from "lucide-react";

import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";

const MAX_LINES = 2000;
const BLOCK_SIZE = 200;
const AUTO_WORD_LIMIT = 5000;
const MAX_RENDERED_ROWS = 2000;

type LineKind = "equal" | "delete" | "insert";

interface LineOp {
  kind: LineKind;
  text: string;
}

interface WordSeg {
  text: string;
  kind: "same" | "del" | "add";
}

type RowKind = "equal" | "delete" | "insert" | "modify";

interface DiffRow {
  kind: RowKind;
  text?: string;
  removed?: string;
  added?: string;
  removedSegs?: WordSeg[];
  addedSegs?: WordSeg[];
}

interface DiffStats {
  added: number;
  removed: number;
  equal: number;
  similarity: number;
  usedBlocks: boolean;
}

interface DiffResult {
  rows: DiffRow[];
  stats: DiffStats;
}

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

/** LCS por programación dinámica sobre líneas (matriz plana Int32). */
function lcsOps(a: string[], b: string[]): LineOp[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    const rowBase = i * width;
    const nextBase = rowBase + width;
    const valueA = a[i];
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[rowBase + j] =
        valueA === b[j]
          ? dp[nextBase + j + 1] + 1
          : Math.max(dp[nextBase + j], dp[rowBase + j + 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "equal", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      ops.push({ kind: "delete", text: a[i] });
      i += 1;
    } else {
      ops.push({ kind: "insert", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: "delete", text: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: "insert", text: b[j] });
    j += 1;
  }
  return ops;
}

function chunkLines(lines: string[], size: number): string[][] {
  const blocks: string[][] = [];
  for (let start = 0; start < lines.length; start += size) {
    blocks.push(lines.slice(start, start + size));
  }
  return blocks;
}

/**
 * Comparación por bloques para textos enormes: primero LCS sobre bloques de
 * 200 líneas y después refinamiento línea a línea dentro de cada par.
 */
function diffByBlocks(a: string[], b: string[]): LineOp[] {
  const blocksA = chunkLines(a, BLOCK_SIZE);
  const blocksB = chunkLines(b, BLOCK_SIZE);
  const keysA = blocksA.map((block) => block.join("\n"));
  const keysB = blocksB.map((block) => block.join("\n"));
  const blockOps = lcsOps(keysA, keysB);

  const ops: LineOp[] = [];
  let ia = 0;
  let ib = 0;
  let index = 0;
  while (index < blockOps.length) {
    const op = blockOps[index];
    if (op.kind === "equal") {
      for (const line of blocksA[ia]) ops.push({ kind: "equal", text: line });
      ia += 1;
      ib += 1;
      index += 1;
      continue;
    }
    const deletedBlocks: string[][] = [];
    while (index < blockOps.length && blockOps[index].kind === "delete") {
      deletedBlocks.push(blocksA[ia]);
      ia += 1;
      index += 1;
    }
    const insertedBlocks: string[][] = [];
    while (index < blockOps.length && blockOps[index].kind === "insert") {
      insertedBlocks.push(blocksB[ib]);
      ib += 1;
      index += 1;
    }
    const deletedLines = deletedBlocks.flat();
    const insertedLines = insertedBlocks.flat();
    if (
      deletedLines.length > 0 &&
      insertedLines.length > 0 &&
      deletedLines.length <= MAX_LINES &&
      insertedLines.length <= MAX_LINES
    ) {
      ops.push(...lcsOps(deletedLines, insertedLines));
    } else {
      for (const line of deletedLines) ops.push({ kind: "delete", text: line });
      for (const line of insertedLines) ops.push({ kind: "insert", text: line });
    }
  }
  return ops;
}

function tokenize(line: string): string[] {
  return line.split(/(\s+)/).filter((token) => token.length > 0);
}

function mergeSeg(list: WordSeg[], text: string, kind: WordSeg["kind"]): void {
  const last = list[list.length - 1];
  if (last && last.kind === kind) {
    last.text += text;
  } else {
    list.push({ text, kind });
  }
}

/** Diff intra-línea por palabras para pares modificados. */
function wordDiff(a: string, b: string): { removed: WordSeg[]; added: WordSeg[] } | null {
  if (a.length > 400 || b.length > 400) return null;
  const wa = tokenize(a);
  const wb = tokenize(b);
  if (wa.length > 80 || wb.length > 80) return null;
  const n = wa.length;
  const m = wb.length;
  const width = m + 1;
  const dp = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    const rowBase = i * width;
    const nextBase = rowBase + width;
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[rowBase + j] =
        wa[i] === wb[j]
          ? dp[nextBase + j + 1] + 1
          : Math.max(dp[nextBase + j], dp[rowBase + j + 1]);
    }
  }
  const removed: WordSeg[] = [];
  const added: WordSeg[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wa[i] === wb[j]) {
      mergeSeg(removed, wa[i], "same");
      mergeSeg(added, wb[j], "same");
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      mergeSeg(removed, wa[i], "del");
      i += 1;
    } else {
      mergeSeg(added, wb[j], "add");
      j += 1;
    }
  }
  while (i < n) {
    mergeSeg(removed, wa[i], "del");
    i += 1;
  }
  while (j < m) {
    mergeSeg(added, wb[j], "add");
    j += 1;
  }
  if (removed.every((seg) => seg.kind === "same")) return null;
  return { removed, added };
}

function computeDiff(textA: string, textB: string): DiffResult {
  const a = splitLines(textA);
  const b = splitLines(textB);
  const usedBlocks = a.length > MAX_LINES || b.length > MAX_LINES;
  const ops = usedBlocks ? diffByBlocks(a, b) : lcsOps(a, b);

  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let equal = 0;
  let idx = 0;
  while (idx < ops.length) {
    const op = ops[idx];
    if (op.kind === "equal") {
      rows.push({ kind: "equal", text: op.text });
      equal += 1;
      idx += 1;
      continue;
    }
    const deleted: string[] = [];
    while (idx < ops.length && ops[idx].kind === "delete") {
      deleted.push(ops[idx].text);
      removed += 1;
      idx += 1;
    }
    const inserted: string[] = [];
    while (idx < ops.length && ops[idx].kind === "insert") {
      inserted.push(ops[idx].text);
      added += 1;
      idx += 1;
    }
    const pairs = Math.min(deleted.length, inserted.length);
    for (let k = 0; k < pairs; k += 1) {
      const segs = wordDiff(deleted[k], inserted[k]);
      rows.push({
        kind: "modify",
        removed: deleted[k],
        added: inserted[k],
        removedSegs: segs?.removed,
        addedSegs: segs?.added,
      });
    }
    for (let k = pairs; k < deleted.length; k += 1) {
      rows.push({ kind: "delete", text: deleted[k] });
    }
    for (let k = pairs; k < inserted.length; k += 1) {
      rows.push({ kind: "insert", text: inserted[k] });
    }
  }

  const longest = Math.max(a.length, b.length);
  const similarity =
    longest === 0 ? 100 : Math.round((equal / longest) * 1000) / 10;
  return { rows, stats: { added, removed, equal, similarity, usedBlocks } };
}

function Segments({
  segs,
  fallback,
  side,
}: {
  segs: WordSeg[] | undefined;
  fallback: string | undefined;
  side: "del" | "add";
}) {
  if (!segs) return <>{fallback}</>;
  const highlight = side === "del" ? "rounded-sm bg-red-500/25" : "rounded-sm bg-emerald-500/25";
  return (
    <>
      {segs.map((seg, index) =>
        seg.kind === "same" ? (
          <span key={index}>{seg.text}</span>
        ) : (
          <span key={index} className={highlight}>
            {seg.text}
          </span>
        ),
      )}
    </>
  );
}

export default function TextDiff() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [committed, setCommitted] = useState({ a: "", b: "" });

  const leftWords = useMemo(() => countWords(left), [left]);
  const rightWords = useMemo(() => countWords(right), [right]);
  const autoCompare = leftWords + rightWords < AUTO_WORD_LIMIT;

  // Comparación en vivo con debounce de 400 ms cuando los textos son pequeños.
  useEffect(() => {
    if (!autoCompare) return;
    const timer = setTimeout(() => setCommitted({ a: left, b: right }), 400);
    return () => clearTimeout(timer);
  }, [left, right, autoCompare]);

  const result = useMemo(() => computeDiff(committed.a, committed.b), [committed]);
  const hasInput = committed.a.length > 0 || committed.b.length > 0;
  const visibleRows = hasInput ? result.rows.slice(0, MAX_RENDERED_ROWS) : [];
  const hiddenRows = Math.max(0, result.rows.length - MAX_RENDERED_ROWS);

  const compareNow = () => setCommitted({ a: left, b: right });

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="size-4 text-orange-600" aria-hidden />
            Textos a comparar
          </CardTitle>
          <CardDescription>
            {autoCompare
              ? "Comparación automática en vivo con textos cortos (menos de 5000 palabras)."
              : "Textos largos detectados: pulsa «Comparar» para analizarlos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="diff-left">Texto original</Label>
                <Badge variant="secondary">
                  {leftWords} {leftWords === 1 ? "palabra" : "palabras"}
                </Badge>
              </div>
              <Textarea
                id="diff-left"
                value={left}
                onChange={(e) => setLeft(e.target.value)}
                placeholder="Pega aquí la versión original del texto…"
                aria-label="Texto original"
                spellCheck={false}
                className="min-h-44 font-mono text-[13px]"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="diff-right">Texto modificado</Label>
                <Badge variant="secondary">
                  {rightWords} {rightWords === 1 ? "palabra" : "palabras"}
                </Badge>
              </div>
              <Textarea
                id="diff-right"
                value={right}
                onChange={(e) => setRight(e.target.value)}
                placeholder="Pega aquí la versión modificada del texto…"
                aria-label="Texto modificado"
                spellCheck={false}
                className="min-h-44 font-mono text-[13px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={compareNow}
              disabled={!left && !right}
              className="gap-2"
            >
              <GitCompare className="size-4" aria-hidden />
              Comparar
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden />
              Todo se procesa en tu dispositivo: los textos nunca salen de tu
              navegador.
            </p>
          </div>
        </CardContent>
      </Card>

      {hasInput && (
        <section
          aria-label="Estadísticas de diferencias"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Card className="p-3">
            <p className="text-xs font-medium text-muted-foreground">Añadidas</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-600">
              +{result.stats.added}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs font-medium text-muted-foreground">Eliminadas</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-red-600">
              −{result.stats.removed}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs font-medium text-muted-foreground">Iguales</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {result.stats.equal}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs font-medium text-muted-foreground">Similitud</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-teal-600">
              {result.stats.similarity} %
            </p>
          </Card>
        </section>
      )}

      {result.stats.usedBlocks && (
        <Alert>
          <GitCompare className="size-4" aria-hidden />
          <AlertDescription>
            Los textos superan las {MAX_LINES} líneas: la comparación se hace por
            bloques de {BLOCK_SIZE} líneas y puede ser menos precisa.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Diferencias</CardTitle>
          <CardDescription>
            Rojo: eliminado. Verde: añadido. Las líneas modificadas se muestran
            lado a lado con el detalle palabra a palabra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasInput ? (
            <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              Pega dos textos y pulsa «Comparar» para ver las diferencias línea
              por línea.
            </p>
          ) : (
            <div
              aria-label="Lista de diferencias"
              className="max-h-96 overflow-y-auto rounded-lg border bg-card font-mono text-xs leading-relaxed"
            >
              {visibleRows.map((row, index) => {
                if (row.kind === "equal") {
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-2 border-b border-border/50 px-3 py-1 text-muted-foreground/60"
                    >
                      <span className="w-3 shrink-0 select-none" aria-hidden>
                        {"\u00A0"}
                      </span>
                      <span className="whitespace-pre-wrap break-all">{row.text}</span>
                    </div>
                  );
                }
                if (row.kind === "delete") {
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-2 border-l-2 border-red-500/70 bg-red-500/10 px-3 py-1 text-red-600 dark:text-red-400"
                    >
                      <span className="w-3 shrink-0 select-none font-bold" aria-hidden>
                        −
                      </span>
                      <span className="whitespace-pre-wrap break-all">{row.text}</span>
                    </div>
                  );
                }
                if (row.kind === "insert") {
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-2 border-l-2 border-emerald-500/70 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-400"
                    >
                      <span className="w-3 shrink-0 select-none font-bold" aria-hidden>
                        +
                      </span>
                      <span className="whitespace-pre-wrap break-all">{row.text}</span>
                    </div>
                  );
                }
                return (
                  <div key={index} className="grid grid-cols-1 border-b border-border/50 sm:grid-cols-2">
                    <div className="flex items-start gap-2 border-l-2 border-red-500/70 bg-red-500/10 px-3 py-1 text-red-600 dark:text-red-400">
                      <span className="w-3 shrink-0 select-none font-bold" aria-hidden>
                        −
                      </span>
                      <span className="whitespace-pre-wrap break-all">
                        <Segments segs={row.removedSegs} fallback={row.removed} side="del" />
                      </span>
                    </div>
                    <div className="flex items-start gap-2 border-l-2 border-emerald-500/70 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-400 sm:border-l-0">
                      <span className="w-3 shrink-0 select-none font-bold" aria-hidden>
                        +
                      </span>
                      <span className="whitespace-pre-wrap break-all">
                        <Segments segs={row.addedSegs} fallback={row.added} side="add" />
                      </span>
                    </div>
                  </div>
                );
              })}
              {hiddenRows > 0 && (
                <p className="px-3 py-2 text-muted-foreground">
                  Se muestran las primeras {MAX_RENDERED_ROWS} líneas de
                  diferencias ({hiddenRows} restantes sin renderizar).
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
