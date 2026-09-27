"use client";

import { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { FileDown, FileText, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import { toast } from "sonner";

import { DownloadButton } from "@/components/shared/download-button";
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
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import type { Pluggable } from "unified";

import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTable } from "micromark-extension-gfm-table";

/**
 * Plugin de remark que activa tablas estilo GitHub (GFM).
 * Equivale a la parte de tablas de remark-gfm, construido con las extensiones
 * de micromark/mdast que ya acompaña a las dependencias del proyecto.
 */
interface RemarkHost {
  data(): Record<string, unknown[]> | undefined;
}

const remarkGfmTables = (function remarkGfmTables(this: RemarkHost): void {
  const data = this.data();
  if (!data) return;
  data.micromarkExtensions = [
    ...(data.micromarkExtensions ?? []),
    gfmTable(),
  ];
  data.fromMarkdownExtensions = [
    ...(data.fromMarkdownExtensions ?? []),
    gfmTableFromMarkdown(),
  ];
}) as unknown as Pluggable;

/*
 * Colores en formato hexadecimal SIEMPRE: los nodos que se capturan con
 * html2canvas no pueden depender de clases de color de Tailwind 4 (oklch),
 * que html2canvas no sabe interpretar.
 */
const M = {
  ink: "#18181b",
  body: "#3f3f46",
  soft: "#52525b",
  line: "#d4d4d8",
  chipBg: "#f4f4f5",
  quoteBg: "#fafafa",
  headBg: "#f4f4f5",
  accent: "#047857",
  preBg: "#18181b",
  preInk: "#e4e4e7",
  inlineCode: "#9f1239",
};

const MONO_FONT =
  "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";

const MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1
      style={{
        fontSize: "1.7em",
        fontWeight: 700,
        color: M.ink,
        lineHeight: 1.25,
        margin: "0 0 0.5em",
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{
        fontSize: "1.35em",
        fontWeight: 700,
        color: M.ink,
        lineHeight: 1.3,
        margin: "1.2em 0 0.5em",
        borderBottom: `1px solid ${M.line}`,
        paddingBottom: 4,
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      style={{
        fontSize: "1.15em",
        fontWeight: 700,
        color: M.ink,
        margin: "1em 0 0.4em",
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontSize: "1em", fontWeight: 700, color: M.ink, margin: "0.9em 0 0.4em" }}>
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p style={{ margin: "0.6em 0", lineHeight: 1.65, color: M.body }}>{children}</p>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: M.ink }}>{children}</strong>
  ),
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: M.accent, textDecoration: "underline" }}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul
      style={{
        margin: "0.6em 0",
        paddingLeft: 26,
        listStyle: "disc",
        color: M.body,
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        margin: "0.6em 0",
        paddingLeft: 26,
        listStyle: "decimal",
        color: M.body,
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => <li style={{ margin: "0.25em 0", lineHeight: 1.55 }}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: "0.9em 0",
        padding: "6px 14px",
        borderLeft: `3px solid ${M.line}`,
        backgroundColor: M.quoteBg,
        color: M.soft,
        fontStyle: "italic",
      }}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return (
        <code
          style={{
            fontFamily: MONO_FONT,
            fontSize: "0.85em",
            color: M.preInk,
            backgroundColor: "transparent",
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          fontFamily: MONO_FONT,
          fontSize: "0.87em",
          backgroundColor: M.chipBg,
          color: M.inlineCode,
          padding: "2px 5px",
          borderRadius: 4,
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        margin: "0.9em 0",
        padding: 12,
        backgroundColor: M.preBg,
        borderRadius: 8,
        overflowX: "auto",
        fontSize: "0.8em",
        lineHeight: 1.55,
        color: M.preInk,
      }}
    >
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        margin: "0.9em 0",
        fontSize: "0.9em",
      }}
    >
      {children}
    </table>
  ),
  thead: ({ children }) => <thead style={{ backgroundColor: M.headBg }}>{children}</thead>,
  th: ({ children }) => (
    <th
      style={{
        border: `1px solid ${M.line}`,
        padding: "6px 9px",
        textAlign: "left",
        fontWeight: 700,
        color: M.ink,
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ border: `1px solid ${M.line}`, padding: "6px 9px", color: M.body }}>
      {children}
    </td>
  ),
  hr: () => <hr style={{ border: "none", borderTop: `1px solid ${M.line}`, margin: "1.2em 0" }} />,
};

const EXAMPLE_MARKDOWN = [
  "# Informe trimestral",
  "",
  "Bienvenido al **documento de ejemplo**. Este texto demuestra las capacidades del conversor: títulos, *cursiva*, `código`, listas, citas y tablas.",
  "",
  "## Puntos clave",
  "",
  "- El PDF respeta márgenes de 10 mm y corta por páginas A4",
  "- La vista previa es fiel al resultado final",
  "- También puedes exportar a **Word (.doc)** o Markdown plano",
  "",
  "### Tareas del equipo",
  "",
  "1. Redactar el resumen ejecutivo",
  "2. Revisar las métricas del trimestre",
  "3. Compartir el documento con dirección",
  "",
  "> «La simplicidad es la máxima sofisticación.»",
  "> — Atribuido a Leonardo da Vinci",
  "",
  "| Concepto    | Cantidad | Importe  |",
  "|-------------|----------|----------|",
  "| Consultoría | 40 h     | 2.400,00 |",
  "| Desarrollo  | 80 h     | 5.600,00 |",
  "| **Total**   | 120 h    | 8.000,00 |",
  "",
  "## Conclusión",
  "",
  "El proyecto avanza según lo previsto. Para más detalles, visita [la documentación](https://example.com) o escribe a `equipo@ejemplo.com`.",
  "",
  "```js",
  "const saludo = \"Hola, mundo\";",
  "console.log(saludo);",
  "```",
].join("\n");

export default function MarkdownToPdf() {
  const [markdown, setMarkdown] = useState(EXAMPLE_MARKDOWN);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [pdfLoading, setPdfLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const mdBlob = useMemo(
    () => new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    [markdown],
  );

  /** Renderiza el documento (misma salida para la vista previa y la captura del PDF). */
  const rendered = (value: string) => (
    <ReactMarkdown remarkPlugins={[remarkGfmTables]} components={MD_COMPONENTS}>
      {value}
    </ReactMarkdown>
  );

  const generatePdf = async () => {
    const node = printRef.current;
    if (!node) {
      toast.error("No hay contenido para exportar");
      return;
    }
    setPdfLoading(true);
    try {
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const contentHeight = pageHeight - margin * 2;
      if (!Number.isFinite(imgHeight) || imgHeight < 2) {
        throw new Error("Documento vacío");
      }
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      let offset = 0;
      let page = 0;
      while (offset < imgHeight - 0.5) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", margin, margin - offset, imgWidth, imgHeight);
        offset += contentHeight;
        page += 1;
      }
      pdf.save("documento.pdf");
      toast.success("PDF generado");
    } catch {
      toast.error("No se pudo generar el PDF. Inténtalo de nuevo.");
    } finally {
      setPdfLoading(false);
    }
  };

  const generateWord = () => {
    const node = printRef.current;
    if (!node) {
      toast.error("No hay contenido para exportar");
      return;
    }
    const content = node.innerHTML;
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8" /><title>Documento</title><style>body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#27272a;line-height:1.5}h1{font-size:22pt;color:#18181b;margin:12pt 0 8pt}h2{font-size:16pt;color:#18181b;margin:14pt 0 8pt;border-bottom:1px solid #d4d4d8;padding-bottom:4pt}h3{font-size:13pt;color:#18181b;margin:12pt 0 6pt}p{margin:7pt 0}ul,ol{margin:7pt 0 7pt 26pt}table{border-collapse:collapse;width:100%;margin:9pt 0;font-size:10.5pt}th,td{border:1px solid #a1a1aa;padding:5pt 8pt;text-align:left;vertical-align:top}th{background:#f4f4f5;font-weight:bold}blockquote{border-left:3px solid #a1a1aa;background:#fafafa;margin:9pt 0;padding:5pt 12pt;color:#52525b;font-style:italic}code{font-family:Consolas,monospace;background:#f4f4f5;color:#9f1239;padding:1pt 4pt;border-radius:3pt}pre{background:#18181b;color:#e4e4e7;padding:9pt;border-radius:5pt;font-family:Consolas,monospace;font-size:9.5pt;white-space:pre-wrap}a{color:#047857}hr{border:none;border-top:1px solid #d4d4d8;margin:12pt 0}</style></head><body>${content}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    downloadBlob(blob, "documento.doc");
    toast.success("Documento Word (.doc) descargado");
  };

  const loadExample = () => {
    setMarkdown(EXAMPLE_MARKDOWN);
    toast.success("Ejemplo cargado");
  };

  return (
    <ToolShell>
      <div
        className="grid grid-cols-2 gap-2 lg:hidden"
        role="tablist"
        aria-label="Cambiar entre editor y vista previa"
      >
        <Button
          type="button"
          variant={mobileView === "edit" ? "default" : "outline"}
          onClick={() => setMobileView("edit")}
        >
          Editor
        </Button>
        <Button
          type="button"
          variant={mobileView === "preview" ? "default" : "outline"}
          onClick={() => setMobileView("preview")}
        >
          Vista previa
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className={cn(mobileView !== "edit" && "hidden lg:block")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-violet-600" aria-hidden />
              Markdown
            </CardTitle>
            <CardDescription>
              Escribe en Markdown con soporte de tablas, listas y bloques de
              código.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="markdown" className="sr-only">
                Contenido Markdown
              </Label>
              <Textarea
                id="markdown"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                aria-label="Contenido Markdown"
                spellCheck={false}
                className="min-h-80 font-mono text-[13px] leading-relaxed"
                placeholder="# Título&#10;&#10;Escribe aquí tu documento en **Markdown**…"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="secondary">
                {markdown.length} {markdown.length === 1 ? "carácter" : "caracteres"}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadExample}
                className="gap-2"
              >
                <Sparkles className="size-4" aria-hidden />
                Cargar ejemplo
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(mobileView !== "preview" && "hidden lg:block")}>
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              Así se verá tu documento al exportarlo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto rounded-lg border bg-white">
              <div className="min-h-24 bg-white p-5 text-sm text-zinc-900">
                {markdown.trim() ? (
                  rendered(markdown)
                ) : (
                  <p className="text-muted-foreground">
                    Escribe Markdown para ver la vista previa…
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="size-4 text-muted-foreground" aria-hidden />
            Exportar
          </CardTitle>
          <CardDescription>
            El PDF se genera con márgenes de 10 mm y corta el contenido en
            páginas A4. La vista previa es fiel al PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={generatePdf}
            disabled={pdfLoading}
            className="gap-2"
          >
            {pdfLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="size-4" aria-hidden />
            )}
            {pdfLoading ? "Generando…" : "Descargar PDF"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={generateWord}
            className="gap-2"
          >
            <FileDown className="size-4" aria-hidden />
            Descargar Word
          </Button>
          <DownloadButton
            blob={mdBlob}
            filename="documento.md"
            label="Descargar .md"
            size="default"
          />
        </CardContent>
      </Card>

      {/* Copia fiel del documento, fuera de pantalla, para capturar el contenido completo al exportar a PDF. */}
      <div
        ref={printRef}
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: -10000,
          width: 794,
          backgroundColor: "#ffffff",
          color: "#27272a",
          padding: 40,
          fontFamily:
            "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', sans-serif",
          fontSize: 15,
        }}
      >
        {rendered(markdown)}
      </div>
    </ToolShell>
  );
}
